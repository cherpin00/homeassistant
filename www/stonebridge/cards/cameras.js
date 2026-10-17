import { SbCard, esc } from "../base.js";
import { theme } from "../theme.js";
import { camerasHeadline, relTime } from "../headlines.js";

// type: custom:stonebridge-cameras
// config: cameras: [{camera, person, name}]  — first one is shown large and live.
//
// Unlike the other cards this one never replaces its whole shadow DOM: the live
// stream lives in a container built once, and only the headline, badges and
// snapshot grid are re-rendered. Rebuilding would restart the stream.
class StonebridgeCameras extends SbCard {
  entities() {
    return (this.config.cameras ?? []).flatMap((c) => [c.camera, c.person]);
  }

  connectedCallback() {
    super.connectedCallback();
    // entity_picture carries a rotating token; refresh snapshots every 10 s.
    this._snap = setInterval(() => this._refreshSnapshots(), 10_000);
  }
  disconnectedCallback() { super.disconnectedCallback(); clearInterval(this._snap); }

  set hass(h) { super.hass = h; if (this._liveCard) this._liveCard.hass = h; }
  get hass() { return super.hass; }

  info() {
    return (this.config.cameras ?? []).map((c) => ({
      ...c,
      personNow: this.on(c.person),
      minutesSincePerson: this.on(c.person) === false ? this.minutesSince(c.person) : null,
    }));
  }

  _render() {
    if (!this.hass || !this.config) return;
    const root = this.shadowRoot;
    if (!this._built) {
      root.innerHTML = `<style>${theme}${this.styles()}</style>
        <div class="stack">
          <div class="card" id="head"></div>
          <div class="cam big" id="main"><div id="live"></div><em id="mainbadge"></em><b id="mainname"></b></div>
          <div class="grid g2" id="grid"></div>
        </div>`;
      this._built = true;
      this._mountLive();
    }
    const info = this.info();
    const [main, ...rest] = info;
    const head = camerasHeadline(info);
    root.getElementById("head").innerHTML = `
      <div class="eyebrow">Frigate · ${info.length} cameras</div>
      <div class="headline">${esc(head.text)}</div>
      ${head.sub ? `<div class="sub">${esc(head.sub)}</div>` : ""}`;
    const mainEl = root.getElementById("main");
    if (main) {
      mainEl.dataset.action = `open:${main.camera}`;
      root.getElementById("mainname").textContent = `${main.name} (live)`;
      this._badge(root.getElementById("mainbadge"), main);
    } else mainEl.hidden = true;
    root.getElementById("grid").innerHTML = rest.map((c) => `
      <div class="cam" data-action="open:${esc(c.camera)}">
        ${this._img(c.camera)}<em data-badge="${esc(c.camera)}"></em><b>${esc(c.name)}</b>
      </div>`).join("");
    rest.forEach((c) => this._badge(root.querySelector(`[data-badge="${CSS.escape(c.camera)}"]`), c));
  }

  _badge(el, c) {
    if (!el) return;
    el.className = c.personNow ? "hot" : "";
    el.textContent = c.personNow ? "Person · now" : c.minutesSincePerson != null ? relTime(c.minutesSincePerson).replace(" ago", "") : "";
    el.hidden = !el.textContent;
  }

  _src(cam) {
    const pic = this.attr(cam, "entity_picture");
    return pic ? `${pic}${pic.includes("?") ? "&" : "?"}t=${Date.now()}` : null;
  }

  _img(cam) {
    const src = this._src(cam);
    return src ? `<img data-cam="${esc(cam)}" src="${esc(src)}" alt="">` : `<div class="nofeed">No feed</div>`;
  }

  _refreshSnapshots() {
    this.shadowRoot.querySelectorAll("img[data-cam]").forEach((img) => {
      const src = this._src(img.dataset.cam);
      if (src) img.src = src;
    });
  }

  async _mountLive() {
    const slot = this.shadowRoot.getElementById("live");
    const main = this.config.cameras?.[0];
    if (!slot || !main) return;
    try {
      const helpers = await window.loadCardHelpers?.();
      if (helpers) {
        this._liveCard = await helpers.createCardElement({
          type: "picture-entity", entity: main.camera, camera_view: "live", show_name: false, show_state: false,
          tap_action: { action: "none" }, // our wrapper opens more-info
        });
        this._liveCard.hass = this.hass;
        slot.replaceChildren(this._liveCard);
        return;
      }
    } catch (e) { console.warn("stonebridge: live view unavailable, using snapshots", e); }
    slot.innerHTML = this._img(main.camera);
  }

  setConfig(config) {
    // A new camera list means a new live card.
    this._built = false;
    this._liveCard = null;
    super.setConfig(config);
  }

  handle(action) {
    if (action.startsWith("open:")) this.moreInfo(action.slice(5));
  }

  // The base re-renders after every tap; nothing here changes on tap.
  _onClick(ev) {
    const el = ev.composedPath().find((n) => n.dataset?.action);
    if (el) this.handle(el.dataset.action);
  }

  styles() {
    return `
    .cam { border-radius: 18px; height: 104px; position: relative; overflow: hidden; background: linear-gradient(135deg,#2b3240,#161a22); cursor: pointer; }
    .cam.big { height: auto; min-height: 190px; }
    .cam img { width: 100%; height: 100%; object-fit: cover; display: block; }
    #live > * { --ha-card-border-radius: 0; --ha-card-border-width: 0; display: block; }
    .cam b { position: absolute; left: 10px; bottom: 8px; font-weight: 500; font-size: 13px; z-index: 1; text-shadow: 0 1px 3px #000; pointer-events: none; }
    .cam em { position: absolute; right: 8px; top: 8px; font-style: normal; font-size: 11px; background: #000a; border-radius: 99px; padding: 3px 8px; z-index: 1; }
    .cam em.hot { background: #e86a6add; }
    .nofeed { display: grid; place-items: center; height: 100%; min-height: 104px; color: var(--sb-dim); font-size: 13px; }`;
  }
}

customElements.define("stonebridge-cameras", StonebridgeCameras);
