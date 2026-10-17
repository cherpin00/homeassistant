import { SbCard, esc, icon } from "../base.js";
import { lightsHeadline } from "../headlines.js";

// type: custom:stonebridge-lights
// config: floors: [{name, lights: [{entity, name, icon?, fan?}]}],
//   scenes: [{entity, name, icon}]
// A light's optional `fan` (switch) shows as a small toggle on its tile.
class StonebridgeLights extends SbCard {
  entities() {
    const c = this.config;
    return [...(c.floors ?? []).flatMap((f) => f.lights.flatMap((l) => [l.entity, l.fan])), ...(c.scenes ?? []).map((s) => s.entity)];
  }

  all() {
    return (this.config.floors ?? []).flatMap((f) => f.lights.map((l) => ({ ...l, floor: f.name, on: this.on(l.entity) })));
  }

  render() {
    const c = this.config;
    const lights = this.all();
    const head = lightsHeadline(lights);
    const onLights = lights.filter((l) => l.on);
    // Not "on since …": HA resets last_changed on restart, so that time can lie.
    const since = onLights.length > 1 ? `${onLights.map((l) => l.name).join(", ")}.` : null;

    return `
    <div class="stack">
      <div class="card">
        <div class="eyebrow">Lights</div>
        <div class="headline">${esc(head.text)}</div>
        ${since ? `<div class="sub">${esc(since)}</div>` : ""}
      </div>
      <div class="grid g4">
        ${(c.scenes ?? []).map((s) => `<button class="round" data-action="scene:${esc(s.entity)}"><span class="btn">${icon(s.icon ?? "mdi:palette")}</span><span>${esc(s.name)}</span></button>`).join("")}
        <button class="round" data-action="all_on"><span class="btn">${icon("mdi:lightbulb-on")}</span><span>All on</span></button>
        <button class="round" data-action="all_off"><span class="btn">${icon("mdi:lightbulb-off")}</span><span>All off</span></button>
      </div>
      ${(c.floors ?? []).map((f) => `
        <div class="section">${esc(f.name)}</div>
        <div class="grid g3">${f.lights.map((l) => this.tile(l)).join("")}</div>`).join("")}
    </div>`;
  }

  tile(l) {
    const on = this.on(l.entity);
    const bri = this.attr(l.entity, "brightness");
    const pct = on && bri != null ? `${Math.round((bri / 255) * 100)}%` : null;
    const fan = l.fan ? this.on(l.fan) : undefined;
    const state = on == null ? "Unavailable" : on ? `On${pct ? ` · ${pct}` : ""}` : "Off";
    return `
      <button class="light ${on ? "on" : ""} ${on == null ? "muted" : ""}" data-action="toggle:${esc(l.entity)}">
        ${icon(l.icon ?? "mdi:lightbulb")}
        <b>${esc(l.name)}</b><small>${esc(state)}</small>
        ${l.fan ? `<span class="fan ${fan ? "on" : ""}" data-action="fan:${esc(l.fan)}">${icon("mdi:fan")}${fan == null ? "—" : fan ? "On" : "Off"}</span>` : ""}
      </button>`;
  }

  handle(action) {
    const [verb, id] = [action.split(":")[0], action.slice(action.indexOf(":") + 1)];
    const ids = this.all().map((l) => l.entity);
    switch (verb) {
      case "toggle": return this.call("light", "toggle", { entity_id: id });
      case "fan": return this.call("switch", "toggle", { entity_id: id });
      case "scene": return this.call("scene", "turn_on", { entity_id: id });
      case "all_on": return this.call("light", "turn_on", { entity_id: ids });
      case "all_off": return this.call("light", "turn_off", { entity_id: ids });
    }
  }

  styles() {
    return `
    .light { border-radius: 18px; padding: 12px; border: 1px solid var(--sb-line); background: var(--sb-card); color: inherit;
      font: inherit; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 2px; min-height: 92px;
      -webkit-tap-highlight-color: transparent; }
    .light ha-icon { --mdc-icon-size: 20px; color: var(--sb-dim); }
    .light.on { background: radial-gradient(120% 120% at 20% 0%, #5a4520, #2a2216 60%); border-color: #7a5d2a; }
    .light.on ha-icon { color: #f2c27a; }
    .light b { font-weight: 500; font-size: 14px; margin-top: 4px; }
    .light small { color: var(--sb-muted); font-size: 12px; }
    .light.on small { color: #f2d39a; }
    .fan { margin-top: 6px; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--sb-muted);
      border: 1px solid var(--sb-line); border-radius: 99px; padding: 2px 8px 2px 4px; align-self: flex-start; }
    .fan ha-icon { --mdc-icon-size: 14px; }
    .fan.on { color: var(--sb-ok); border-color: #2f5a55; }
    .fan.on ha-icon { color: var(--sb-ok); }`;
  }
}

customElements.define("stonebridge-lights", StonebridgeLights);
