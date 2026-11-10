import { SbCard, esc, icon } from "../base.js";
import { houseHeadline } from "../headlines.js";
import { floorplan, planRooms } from "../floorplan.js";

// type: custom:stonebridge-house
// config: ignore: [integration...]  — integrations whose devices are not things in a room
//
// Reads Home Assistant's device and area registries; nothing is listed in the
// dashboard YAML. It answers: which devices have no room, which are not
// responding, and which rooms have no smart switch.
class StonebridgeHouse extends SbCard {
  // Registries, not states: the base class re-renders this once a minute.
  entities() { return []; }

  devices() {
    const h = this._hass;
    const ignore = new Set(this.config.ignore ?? []);
    const byDevice = {};
    for (const e of Object.values(h.entities ?? {})) if (e.device_id) (byDevice[e.device_id] ??= []).push(e);
    return Object.values(h.devices ?? {})
      .filter((d) => d.entry_type !== "service" && !d.disabled_by && !ignore.has(d.identifiers?.[0]?.[0]))
      .map((d) => {
        const ents = byDevice[d.id] ?? [];
        const states = ents.map((e) => h.states[e.entity_id]).filter(Boolean);
        return {
          id: d.id,
          name: d.name_by_user ?? d.name ?? "Unnamed device",
          model: [d.manufacturer, d.model].filter(Boolean).join(" "),
          area: d.area_id ?? null,
          dead: states.length > 0 && states.every((s) => s.state === "unavailable"),
          // A light or switch you operate, as opposed to a settings toggle.
          control: ents.some((e) => /^(light|switch|fan)\./.test(e.entity_id) && !e.entity_category && !e.hidden),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  render() {
    const h = this._hass;
    const devices = this.devices();
    const unplaced = devices.filter((d) => !d.area);
    const dead = devices.filter((d) => d.dead);
    const head = houseHeadline({ total: devices.length, unplaced: unplaced.length, dead: dead.length });
    const inArea = (area) => devices.filter((d) => d.area === area);

    const rooms = planRooms();
    const planState = Object.fromEntries(rooms.map((r) => {
      const ds = inArea(r.area);
      return [r.id, { cls: ds.length ? "has" : "dead", note: String(ds.length), action: `area:${r.area}` }];
    }));
    const noSwitch = rooms.filter((r) => !inArea(r.area).some((d) => d.control));
    // Areas HA has that are not a room on the plan (Outside, or a leftover).
    const onPlan = new Set(rooms.map((r) => r.area));
    const others = Object.values(h.areas ?? {}).filter((a) => !onPlan.has(a.area_id))
      .map((a) => ({ ...a, count: inArea(a.area_id).length }));
    const areaName = (id) => h.areas?.[id]?.name ?? id;

    const row = (d, right) => `
      <div class="row tap" data-action="device:${esc(d.id)}">
        <span><span>${esc(d.name)}${d.model ? `<br><small class="sub">${esc(d.model)}</small>` : ""}</span></span>
        <span class="sub" style="display:flex;align-items:center;gap:6px;white-space:nowrap">${right}${icon("mdi:chevron-right")}</span>
      </div>`;

    return `
    <div class="stack">
      <div class="card">
        <div class="eyebrow">House</div>
        <div class="headline tone-${head.tone}">${esc(head.text)}</div>
        ${head.sub ? `<div class="sub">${esc(head.sub)}</div>` : ""}
      </div>
      <div class="card navy" style="padding:10px">
        ${floorplan({ rooms: planState })}
        <div class="sub" style="padding:0 8px 6px">Devices per room. Tap a room to open it in Home Assistant.</div>
      </div>
      ${others.length ? `
      <div class="chips">${others.map((a) => `<button class="chip ${a.count ? "" : "mute"}" data-action="area:${esc(a.area_id)}">${esc(a.name)} · ${a.count}</button>`).join("")}</div>` : ""}
      ${unplaced.length ? `
      <div class="section">No room yet</div>
      <div class="card" style="padding:4px 18px">${unplaced.map((d) => row(d, "Place")).join("")}</div>` : ""}
      ${dead.length ? `
      <div class="section">Not responding</div>
      <div class="card" style="padding:4px 18px">${dead.map((d) => row(d, esc(d.area ? areaName(d.area) : "No room"))).join("")}</div>` : ""}
      ${noSwitch.length ? `
      <div class="section">Rooms with no smart switch</div>
      <div class="chips">${noSwitch.map((r) => `<button class="chip warn" data-action="area:${esc(r.area)}">${esc(r.name)}</button>`).join("")}</div>` : ""}
    </div>`;
  }

  handle(action) {
    const id = action.slice(action.indexOf(":") + 1);
    if (action.startsWith("device:")) return this.navigate(`/config/devices/device/${id}`);
    if (action.startsWith("area:")) return this.navigate(`/config/areas/area/${id}`);
  }

  styles() {
    return `
    .row.tap { cursor: pointer; -webkit-tap-highlight-color: transparent; }
    .row ha-icon { --mdc-icon-size: 18px; color: var(--sb-dim); }
    button.chip { background: none; font: inherit; font-size: 13px; cursor: pointer; }`;
  }
}

customElements.define("stonebridge-house", StonebridgeHouse);
