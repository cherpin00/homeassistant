import { SbCard, esc, icon } from "../base.js";
import { lightsHeadline } from "../headlines.js";
import { floorplan, planSpot, roomForArea } from "../floorplan.js";

// type: custom:stonebridge-lights
// config: floors: [{name, all?, lights: [{entity, name, icon?, fan?, room?, spot?, at?}]}],
//   scenes: [{entity, name, icon}], plan: false to hide the floor plan
// A light shows on the floor plan in the room of its Home Assistant area (an
// explicit `room`, see floorplan.js, overrides that); one with a `spot` or
// `at: [x, y]` is a marker outside. Tapping either switches it.
// A light's optional `fan` (switch) is a badge in its room and a button in the Fans row.
// A floor with `all: false` is left out of the All on / All off buttons.
class StonebridgeLights extends SbCard {
  entities() {
    const c = this.config;
    return [...(c.floors ?? []).flatMap((f) => f.lights.flatMap((l) => [l.entity, l.fan])), ...(c.scenes ?? []).map((s) => s.entity)];
  }

  all() {
    return (this.config.floors ?? []).flatMap((f) => f.lights.map((l) => ({
      ...l, floor: f.name, on: this.on(l.entity),
      room: l.room ?? (l.spot || l.at ? null : roomForArea(this.areaOf(l.entity))),
    })));
  }

  render() {
    const c = this.config;
    const lights = this.all();
    const head = lightsHeadline(lights);

    return `
    <div class="stack">
      <div class="card">
        <div class="eyebrow">Lights</div>
        <div class="headline">${esc(head.text)}</div>
        ${head.sub ? `<div class="sub">${esc(head.sub)}</div>` : ""}
      </div>
      ${this.plan(lights)}
      <div class="grid g4">
        ${(c.scenes ?? []).map((s) => `<button class="round" data-action="scene:${esc(s.entity)}"><span class="btn">${icon(s.icon ?? "mdi:palette")}</span><span>${esc(s.name)}</span></button>`).join("")}
        <button class="round" data-action="all_on"><span class="btn">${icon("mdi:lightbulb-on")}</span><span>All on</span></button>
        <button class="round" data-action="all_off"><span class="btn">${icon("mdi:lightbulb-off")}</span><span>All off</span></button>
      </div>
      ${this.fans(lights)}
      ${(c.floors ?? []).map((f) => `
        <div class="section">${esc(f.name)}</div>
        <div class="grid g3">${f.lights.map((l) => this.tile(l)).join("")}</div>`).join("")}
    </div>`;
  }

  byRoom(lights) {
    const rooms = {};
    for (const l of lights) if (l.room) (rooms[l.room] ??= []).push(l);
    return rooms;
  }

  plan(lights) {
    if (this.config.plan === false) return "";
    const rooms = Object.fromEntries(Object.entries(this.byRoom(lights)).map(([id, ls]) => {
      const on = ls.filter((l) => l.on);
      const level = Math.max(0, ...on.map((l) => (this.attr(l.entity, "brightness") ?? 255) / 255));
      return [id, {
        cls: on.length ? (level < 0.5 ? "lit dim" : "lit") : ls.every((l) => l.on == null) ? "dead" : "",
        label: ls.length === 1 ? ls[0].name : undefined, level, action: `room:${id}`,
        badges: ls.filter((l) => l.fan).map((l) => ({ icon: "mdi:fan", cls: this.on(l.fan) ? "on" : "", action: `fan:${l.fan}` })),
      }];
    }));
    const markers = lights.filter((l) => !l.room).map((l) => ({
      at: planSpot(l), icon: l.icon ?? "mdi:lightbulb", cls: l.on ? "lit" : "", action: `toggle:${l.entity}`,
    })).filter((m) => m.at);
    if (!Object.keys(rooms).length && !markers.length) return "";
    return `<div class="card navy" style="padding:10px">${floorplan({ rooms, markers })}</div>`;
  }

  fans(lights) {
    const fans = lights.filter((l) => l.fan);
    if (!fans.length) return "";
    return `
      <div class="section">Fans</div>
      <div class="grid g3">${fans.map((l) => {
        const on = this.on(l.fan);
        return `<button class="fan ${on ? "on" : ""} ${on == null ? "muted" : ""}" data-action="fan:${esc(l.fan)}">${icon("mdi:fan")}<span>${esc(l.name)}</span></button>`;
      }).join("")}</div>`;
  }

  tile(l) {
    const on = this.on(l.entity);
    const bri = this.attr(l.entity, "brightness");
    const pct = on && bri != null ? `${Math.round((bri / 255) * 100)}%` : null;
    const state = on == null ? "Unavailable" : on ? `On${pct ? ` · ${pct}` : ""}` : "Off";
    return `
      <button class="light ${on ? "on" : ""} ${on == null ? "muted" : ""}" data-action="toggle:${esc(l.entity)}">
        ${icon(l.icon ?? "mdi:lightbulb")}
        <b>${esc(l.name)}</b><small>${esc(state)}</small>
      </button>`;
  }

  handle(action) {
    const [verb, id] = [action.split(":")[0], action.slice(action.indexOf(":") + 1)];
    const ids = (this.config.floors ?? []).filter((f) => f.all !== false).flatMap((f) => f.lights.map((l) => l.entity));
    switch (verb) {
      case "room": {
        // One tap for the whole room: off if anything is on, otherwise on.
        const ls = this.byRoom(this.all())[id] ?? [];
        return this.call("light", ls.some((l) => l.on) ? "turn_off" : "turn_on", { entity_id: ls.map((l) => l.entity) });
      }
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
      font: inherit; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 2px; min-height: 78px;
      -webkit-tap-highlight-color: transparent; }
    .light ha-icon { --mdc-icon-size: 20px; color: var(--sb-dim); }
    .light.on { background: radial-gradient(120% 120% at 20% 0%, #5a4520, #2a2216 60%); border-color: #7a5d2a; }
    .light.on ha-icon { color: #f2c27a; }
    .light b { font-weight: 500; font-size: 14px; margin-top: 4px; }
    .light small { color: var(--sb-muted); font-size: 12px; }
    .light.on small { color: #f2d39a; }
    .fan { display: flex; align-items: center; gap: 8px; border: 1px solid var(--sb-line); border-radius: 999px; padding: 10px 12px;
      background: var(--sb-card); color: var(--sb-muted); font: inherit; font-size: 13px; cursor: pointer; min-width: 0;
      -webkit-tap-highlight-color: transparent; }
    .fan span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fan ha-icon { --mdc-icon-size: 18px; flex: none; }
    .fan.on { background: var(--sb-ok-d); border-color: var(--sb-ok); color: #fff; }`;
  }
}

customElements.define("stonebridge-lights", StonebridgeLights);
