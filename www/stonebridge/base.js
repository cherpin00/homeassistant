import { theme } from "./theme.js";

// Send a browser-side failure to HA's system log so it shows in `ha core logs`
// (logger "stonebridge"). Card errors otherwise exist only in the browser console.
export function report(message, hass) {
  console.error(`stonebridge: ${message}`);
  const h = hass ?? document.querySelector("home-assistant")?.hass;
  // system_log.write is a service; HA has no websocket command for it.
  h?.callService?.("system_log", "write", { logger: "stonebridge", level: "error", message: String(message).slice(0, 2000) })
    ?.catch(() => {});
}

// Diagnostics for devices whose console we cannot read (the Android app).
// Each device announces the bundle once per version, and any uncaught error
// that comes from this bundle is forwarded to the HA log.
if (typeof window !== "undefined") {
  const where = `${import.meta.url.split("/").pop()} on ${navigator.userAgent}`;
  const note = (level, message) => {
    let tries = 0;
    const send = () => {
      const h = document.querySelector("home-assistant")?.hass;
      if (h?.callService) return h.callService("system_log", "write", { logger: "stonebridge", level, message: String(message).slice(0, 2000) }).catch(() => {});
      if (tries++ < 60) setTimeout(send, 1000);
    };
    send();
  };
  try {
    if (localStorage.getItem("stonebridge-announced") !== where) {
      localStorage.setItem("stonebridge-announced", where);
      note("warning", `loaded ${where}`);
    }
  } catch { note("warning", `loaded ${where} (no localStorage)`); }
  window.addEventListener("error", (ev) => {
    if (`${ev.filename} ${ev.error?.stack}`.includes("stonebridge")) note("error", `uncaught: ${ev.error?.stack ?? ev.message} — ${where}`);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    if (String(ev.reason?.stack).includes("stonebridge")) note("error", `unhandled rejection: ${ev.reason.stack} — ${where}`);
  });
}

// Last person seen per Frigate camera, from Frigate's own event history (via the
// Frigate integration's websocket API). Entity last_changed is NOT usable for
// this: HA resets it on every restart, which made every camera read "18 min ago".
// Shared by all cards; refreshed at most once a minute. null = unknown.
const personCache = { at: 0, times: null, inflight: null, listeners: new Set() };
export function personTimes(hass, onUpdate) {
  personCache.listeners.add(onUpdate);
  if (!personCache.inflight && Date.now() - personCache.at > 60_000) {
    personCache.at = Date.now();
    personCache.inflight = hass.callWS({ type: "frigate/events/get", instance_id: "frigate", labels: ["person"], limit: 100 })
      .then((raw) => {
        const times = {};
        for (const e of typeof raw === "string" ? JSON.parse(raw) : raw) {
          const t = e.end_time ?? e.start_time;
          if (!(e.camera in times) || t > times[e.camera]) times[e.camera] = t;
        }
        personCache.times = times;
      })
      .catch((e) => { personCache.times = null; report(`frigate/events/get failed: ${e?.message ?? JSON.stringify(e)}`, hass); })
      .finally(() => { personCache.inflight = null; personCache.listeners.forEach((f) => f()); });
  }
  return personCache.times;
}
export function forgetPersonListener(onUpdate) { personCache.listeners.delete(onUpdate); }

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

  // HA turns anything thrown from setConfig or the hass setter into a bare
  // "Configuration error" card, so say what it was before rethrowing.
  _guard(what, fn) {
    try { return fn(); }
    catch (e) {
      if (!this._reported) { this._reported = true; report(`${this.localName} ${what} failed: ${e?.stack ?? e} — ${navigator.userAgent}`, this._hass); }
      throw e;
    }
  }

  setConfig(config) {
    this._guard("setConfig", () => {
      if (!config) throw new Error("Missing config");
      this.config = config;
      this._last = null;
      if (this._hass) this._render();
    });
  }

  set hass(hass) {
    this._guard("hass update", () => {
      this._hass = hass;
      if (!this.config) return; // HA may hand us hass before setConfig
      const ids = this.entities().filter(Boolean);
      const snap = ids.map((id) => hass.states[id]);
      if (this._last && snap.every((s, i) => s === this._last[i])) return;
      this._last = snap;
      this._render();
    });
  }
  get hass() { return this._hass; }

  connectedCallback() {
    // Relative times ("4 min ago") go stale without a state change.
    this._tick = setInterval(() => this._render(), 60_000);
  }
  disconnectedCallback() { clearInterval(this._tick); forgetPersonListener(this._personListener); }

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
  // Minutes since Frigate last saw a person on this camera entity; null if unknown.
  minutesSincePerson(cameraEntity) {
    const times = personTimes(this._hass, this._personListener ??= () => this._render());
    const cam = this.attr(cameraEntity, "camera_name");
    const t = times && cam ? times[cam] : null;
    return t ? Math.max(0, (Date.now() / 1000 - t) / 60) : null;
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
