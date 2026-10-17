import { theme } from "./theme.js";

// Send a browser-side failure to HA's system log so it shows in `ha core logs`
// (logger "stonebridge"). Card errors otherwise exist only in the browser console.
export function report(message, hass) {
  console.error(`stonebridge: ${message}`);
  const h = hass ?? document.querySelector("home-assistant")?.hass;
  h?.callWS?.({ type: "system_log/write", logger: "stonebridge", level: "error", message: String(message).slice(0, 2000) })
    .catch(() => {});
}

const BAD = new Set(["unavailable", "unknown", "", undefined, null]);

// Shared card base. Subclasses implement:
//   entities()   -> array of entity ids this card reads (used to skip re-renders)
//   render()     -> HTML string
//   handle(action, el) -> called on taps of [data-action] elements
// and may set static `sensitive` actions that need a confirming second tap.
export class SbCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pending = null;
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
  }

  setConfig(config) {
    if (!config) { report(`${this.localName}: missing config`, this._hass); throw new Error("Missing config"); }
    this.config = config;
    this._last = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return; // HA may hand us hass before setConfig
    const ids = this.entities().filter(Boolean);
    const snap = ids.map((id) => hass.states[id]);
    if (this._last && snap.every((s, i) => s === this._last[i])) return;
    this._last = snap;
    this._render();
  }
  get hass() { return this._hass; }

  connectedCallback() {
    // Relative times ("4 min ago") go stale without a state change.
    this._tick = setInterval(() => this._render(), 60_000);
  }
  disconnectedCallback() { clearInterval(this._tick); }

  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12 }; }

  // --- state helpers -----------------------------------------------------
  st(id) { const s = id && this._hass?.states[id]; return s && !BAD.has(s.state) ? s.state : null; }
  obj(id) { return id ? this._hass?.states[id] ?? null : null; }
  attr(id, a) { return this.obj(id)?.attributes?.[a] ?? null; }
  num(id) { const v = parseFloat(this.st(id)); return Number.isFinite(v) ? v : null; }
  on(id) { const s = this.st(id); return s == null ? null : s === "on"; }
  minutesSince(id) {
    const o = this.obj(id);
    if (!o || BAD.has(o.state)) return null;
    return (Date.now() - new Date(o.last_changed).getTime()) / 60_000;
  }
  name(id, fallback) { return fallback ?? this.attr(id, "friendly_name") ?? id; }

  call(domain, service, data) { return this._hass.callService(domain, service, data); }
  moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  // --- rendering ---------------------------------------------------------
  _render() {
    if (!this._hass || !this.config) return;
    let html;
    try { html = this.render(); }
    catch (e) {
      html = `<div class="card"><div class="eyebrow">Stonebridge card error</div><div class="sub">${esc(e.message)}</div></div>`;
      if (!this._reported) { this._reported = true; report(`${this.localName} render failed: ${e.stack ?? e}`, this._hass); }
    }
    this.shadowRoot.innerHTML = `<style>${theme}${this.styles?.() ?? ""}</style>${html}`;
    this.afterRender?.();
  }

  // Two-tap confirmation for actions listed in `sensitive`.
  pendingLabel(action, normal, confirm) {
    return this._pending?.action === action ? confirm : normal;
  }
  isPending(action) { return this._pending?.action === action; }

  _onClick(ev) {
    const el = ev.composedPath().find((n) => n.dataset?.action);
    if (!el) return;
    const action = el.dataset.action;
    const sensitive = this.constructor.sensitive?.includes(action.split(":")[0]) && el.dataset.safe !== "1";
    if (sensitive) {
      if (this._pending?.action !== action || Date.now() - this._pending.at > 4000) {
        this._pending = { action, at: Date.now() };
        clearTimeout(this._pendingTimer);
        this._pendingTimer = setTimeout(() => { this._pending = null; this._render(); }, 4000);
        this._render();
        return;
      }
      this._pending = null;
      clearTimeout(this._pendingTimer);
    }
    this.handle(action, el);
    this._render();
  }
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function icon(name) { return `<ha-icon icon="${esc(name)}"></ha-icon>`; }
