import { SbCard, esc, icon } from "../base.js";
import { securityHeadline, relTime } from "../headlines.js";

// type: custom:stonebridge-security
// config: alarm, lock, lock_jammed, garage, garage_close_script, garage_remotes,
//   cameras_person: [{entity, name}], openings: [{entity, name}] (optional)
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
      const m = this.minutesSince(p.entity);
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
    const col = (ok) => (ok == null ? "#6b7486" : ok ? "#5fd4bf" : "#f2b45a");
    const personCol = last?.now ? "#e86a6a" : last && last.minutes < 30 ? "#9fb3d8" : "#5fd4bf";
    const alarmLabel = { disarmed: "Disarmed", armed_home: "Armed home", armed_away: "Armed away", armed_night: "Armed night", triggered: "TRIGGERED", pending: "Pending", arming: "Arming" }[alarm] ?? "—";
    const alarmChanged = relTime(this.minutesSince(c.alarm));
    const openCount = openings.filter((o) => o.open).length;

    const node = (x, y, colr, ic, label, labelY = y + 36) => `
      <circle cx="${x}" cy="${y}" r="20" fill="#132042" stroke="${colr}" stroke-width="2"/>
      <foreignObject x="${x - 12}" y="${y - 12}" width="24" height="24"><div xmlns="http://www.w3.org/1999/xhtml" style="color:${colr};display:grid;place-items:center;height:24px">${icon(ic)}</div></foreignObject>
      <text x="${x}" y="${labelY}" fill="${colr === "#5fd4bf" ? "#9aa4b5" : colr}" font-size="12" text-anchor="middle">${esc(label)}</text>`;

    return `
    <div class="stack">
      <div class="card navy">
        <svg viewBox="0 0 320 250" width="100%" style="--mdc-icon-size:16px">
          <circle cx="160" cy="125" r="100" fill="none" stroke="#2f4470" stroke-dasharray="2 8"/>
          <circle cx="160" cy="118" r="58" fill="#132042" stroke="${alarm === "triggered" ? "#e86a6a" : alarm && alarm !== "disarmed" ? "#e86a6a88" : "#30477a"}" stroke-width="${alarm && alarm !== "disarmed" ? 3 : 1}"/>
          <path d="M160 84 l28 11 v22 c0 21 -13 34 -28 40 c-15 -6 -28 -19 -28 -40 v-22z" fill="#1a2b52" stroke="#9fb3d8" stroke-width="2"/>
          <text x="160" y="204" text-anchor="middle" fill="#e9edf3" font-size="22" font-weight="600">${alarmLabel}</text>
          <text x="160" y="224" text-anchor="middle" fill="#9aa4b5" font-size="12">Alarmo${alarmChanged ? ` · ${alarmChanged}` : ""}</text>
          ${node(160, 26, col(lock == null ? null : lock === "locked" && !jammed), "mdi:lock", jammed ? "Jammed" : lock === "unlocked" ? "Unlocked" : "Front lock", 62)}
          ${node(268, 96, col(garage == null ? null : garage === "closed"), "mdi:garage", garage === "closed" ? "Garage" : "Garage open")}
          ${node(268, 186, personCol, "mdi:cctv", last?.now ? "Person now" : last && last.minutes < 30 ? relTime(last.minutes) : "Cameras")}
          ${node(52, 96, col(remotes == null ? null : true), "mdi:remote", remotes === "locked" ? "Remotes off" : "Remotes")}
          ${node(52, 186, c.openings?.length ? col(!openCount) : "#6b7486", "mdi:window-closed-variant", c.openings?.length ? (openCount ? `${openCount} open` : "Shut") : "No sensors")}
        </svg>
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
