import { SbCard, esc, icon } from "../base.js";
import { securityHeadline, relTime } from "../headlines.js";
import { floorplan, planSpot } from "../floorplan.js";

// type: custom:stonebridge-security
// config: alarm, lock, lock_jammed, garage, garage_close_script, garage_remotes,
//   cameras_person: [{entity, camera, name, spot?, at?}],
//   openings: [{entity, name, spot?, at?}] (optional)
// Cameras and openings with a `spot` (see floorplan.js) or `at: [x, y]` are
// drawn on the floor plan, along with the front door lock and the garage door.
class StonebridgeSecurity extends SbCard {
  static sensitive = ["disarm", "unlock", "garage_open"];

  entities() {
    const c = this.config;
    return [c.alarm, c.lock, c.lock_jammed, c.lock_battery, c.garage, c.garage_remotes,
      ...(c.cameras_person ?? []).map((p) => p.entity), ...(c.openings ?? []).map((o) => o.entity)];
  }

  lastPerson() {
    let best = null;
    for (const p of this.config.cameras_person ?? []) {
      if (this.on(p.entity)) return { camera: `the ${p.name.toLowerCase()} camera`, minutes: 0, now: true };
      const m = p.camera ? this.minutesSincePerson(p.camera) : null;
      if (m != null && (!best || m < best.minutes)) best = { camera: `the ${p.name.toLowerCase()} camera`, minutes: m };
    }
    return best;
  }

  render() {
    const c = this.config;
    const alarm = this.st(c.alarm), lock = this.st(c.lock), garage = this.st(c.garage);
    const jammed = this.on(c.lock_jammed);
    const openings = (c.openings ?? []).map((o) => ({ name: o.name, open: this.on(o.entity) }));
    const last = this.lastPerson();
    const head = securityHeadline({ alarm, lock, jammed, garage, lastPerson: last, openings });
    const remotes = this.st(c.garage_remotes);
    const alarmLabel = { disarmed: "Disarmed", armed_home: "Armed home", armed_away: "Armed away", armed_night: "Armed night", triggered: "TRIGGERED", pending: "Pending", arming: "Arming" }[alarm] ?? "—";
    const armed = alarm && alarm !== "disarmed";
    const tone = (ok) => (ok == null ? "" : ok ? "ok" : "warn");

    const markers = [
      { at: planSpot({ spot: "front_door" }), icon: lock === "unlocked" ? "mdi:lock-open-variant" : "mdi:lock",
        cls: jammed ? "alert" : tone(lock == null ? null : lock === "locked"), label: jammed ? "Jammed" : lock === "unlocked" ? "Unlocked" : null },
      { at: planSpot({ spot: "garage_door" }), icon: garage === "closed" ? "mdi:garage" : "mdi:garage-open",
        cls: tone(garage == null ? null : garage === "closed"), label: garage && garage !== "closed" ? cap(garage) : null },
      ...(c.cameras_person ?? []).map((p) => {
        const now = this.on(p.entity);
        const m = now ? 0 : p.camera ? this.minutesSincePerson(p.camera) : null;
        const recent = m != null && m < 30;
        return { at: planSpot(p), icon: "mdi:cctv", cls: now ? "alert" : recent ? "info" : now == null ? "" : "ok",
          label: now ? "Person" : recent ? relTime(m) : null, action: p.camera ? `info:${p.camera}` : null };
      }),
      ...(c.openings ?? []).map((o) => {
        const v = this.on(o.entity);
        return { at: planSpot(o), icon: v ? "mdi:door-open" : "mdi:door-closed", cls: tone(v == null ? null : !v), label: v ? "Open" : null };
      }),
    ];

    return `
    <div class="stack">
      <div class="card navy">
        <div style="display:flex;align-items:center;gap:10px;--mdc-icon-size:26px" class="${alarm === "triggered" || armed ? "tone-alert" : "tone-info"}">
          ${icon(armed ? "mdi:shield-lock" : "mdi:shield-off-outline")}
          <span style="font-size:22px;font-weight:600;color:var(--sb-text)">${alarmLabel}</span>
          <span class="sub">Alarmo</span>
        </div>
        ${floorplan({ markers, cls: armed ? "armed" : "" })}
        <div class="headline" style="font-size:21px">${esc(head.text)}</div>
        ${head.sub ? `<div class="sub">${esc(head.sub)}</div>` : ""}
      </div>
      <div class="seg">
        <button data-action="arm_home" class="${alarm === "armed_home" ? "on" : ""}">${icon("mdi:shield-home")}Home</button>
        <button data-action="arm_away" class="${alarm === "armed_away" ? "on" : ""}">${icon("mdi:shield-lock")}Away</button>
        <button data-action="disarm" class="${alarm === "disarmed" ? "on" : ""} ${this.isPending("disarm") ? "pending" : ""}">${icon("mdi:shield-off")}${this.pendingLabel("disarm", "Disarm", "Tap again")}</button>
      </div>
      <div class="card" style="padding:4px 18px">
        ${this.row(lock === "locked" ? "ok" : lock ? "warn" : null, jammed ? "Front door — JAMMED" : "Front door", lock ? `${cap(lock)}${this.battery()}` : "—", lock === "locked" ? "unlock" : "lock", lock === "locked" ? this.pendingLabel("unlock", "Unlock", "Tap again") : "Lock", jammed ? "alert" : null)}
        ${this.row(garage === "closed" ? "ok" : garage ? "warn" : null, "Garage door", garage ? cap(garage) : "—", garage === "closed" ? "garage_open" : "garage_close", garage === "closed" ? this.pendingLabel("garage_open", "Open", "Tap again") : "Close")}
        ${this.row(remotes ? "ok" : null, "Garage remotes", remotes === "locked" ? "Disabled" : remotes ? "Allowed" : "—", "remotes", remotes === "locked" ? "Allow" : "Disable")}
        ${(c.openings ?? []).map((o) => { const v = this.on(o.entity); return this.row(v == null ? null : v ? "warn" : "ok", o.name, v == null ? "—" : v ? "Open" : "Shut"); }).join("")}
      </div>
    </div>`;
  }

  battery() {
    const b = this.num(this.config.lock_battery) ?? this.attr(this.config.lock, "battery_level");
    return b != null ? ` · ${Math.round(b)}% battery` : "";
  }

  row(tone, label, value, action, btn, forceTone) {
    const t = forceTone ?? tone;
    const pend = action && this.isPending(action);
    return `<div class="row"><span><span class="dot ${t ? `tone-${t}` : "unavail"}"></span>${esc(label)}</span>
      <span style="display:flex;align-items:center;gap:10px"><span class="${t ? `tone-${t}` : "unavail"}">${esc(value)}</span>
      ${action ? `<button class="chip ${pend ? "warn pending" : "mute"}" style="background:none;cursor:pointer;font:inherit;font-size:13px" data-action="${action}">${esc(btn)}</button>` : ""}</span></div>`;
  }

  handle(action) {
    const c = this.config;
    if (action.startsWith("info:")) return this.moreInfo(action.slice(5));
    switch (action) {
      case "arm_home": return this.call("alarm_control_panel", "alarm_arm_home", { entity_id: c.alarm });
      case "arm_away": return this.call("alarm_control_panel", "alarm_arm_away", { entity_id: c.alarm });
      case "disarm": return this.call("alarm_control_panel", "alarm_disarm", { entity_id: c.alarm });
      case "lock": return this.call("lock", "lock", { entity_id: c.lock });
      case "unlock": return this.call("lock", "unlock", { entity_id: c.lock });
      case "garage_open": return this.call("cover", "open_cover", { entity_id: c.garage });
      case "garage_close": return c.garage_close_script
        ? this.call("script", "turn_on", { entity_id: c.garage_close_script })
        : this.call("cover", "close_cover", { entity_id: c.garage });
      case "remotes": return this.call("lock", this.st(c.garage_remotes) === "locked" ? "unlock" : "lock", { entity_id: c.garage_remotes });
    }
  }
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
customElements.define("stonebridge-security", StonebridgeSecurity);
