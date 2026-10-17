import { SbCard, esc, icon } from "../base.js";
import { carHeadline } from "../headlines.js";

// type: custom:stonebridge-car
// config: name, battery, range, charging, charge_cable, charge_limit, time_to_full,
//   location, lock, sentry, climate, inside_temp, outside_temp, trunk, frunk,
//   charge_port, windows (cover), flash, garage_car_inside (binary_sensor),
//   doors: [binary_sensor...], precondition_enabled, precondition_pending,
//   update, tyres: {fl, fr, rl, rr, recommended} (optional; hidden until given)
class StonebridgeCar extends SbCard {
  static sensitive = ["trunk_open"];

  entities() {
    const c = this.config;
    return [c.battery, c.range, c.charging, c.charge_cable, c.charge_limit, c.time_to_full, c.location, c.lock,
      c.sentry, c.climate, c.inside_temp, c.outside_temp, c.trunk, c.frunk, c.charge_port, c.windows,
      c.garage_car_inside, c.precondition_enabled, c.precondition_pending, c.update, c.status,
      ...(c.doors ?? []), ...Object.values(c.tyres ?? {})];
  }

  render() {
    const c = this.config;
    const battery = this.num(c.battery), range = this.num(c.range), limit = this.num(c.charge_limit);
    const lock = this.st(c.lock), trunk = this.st(c.trunk), frunk = this.st(c.frunk), port = this.st(c.charge_port);
    const climate = this.st(c.climate), sentry = this.st(c.sentry), windows = this.st(c.windows);
    const doorsOpen = (c.doors ?? []).some((d) => this.on(d));
    const open = [trunk === "open" && "Trunk", frunk === "open" && "Frunk", doorsOpen && "A door", windows === "open" && "Windows"].filter(Boolean);
    // Tesla Fleet reports time-to-full as a timestamp sensor.
    const ttfAt = Date.parse(this.st(c.time_to_full) ?? "");
    const ttfMin = Number.isFinite(ttfAt) ? Math.max(0, (ttfAt - Date.now()) / 60_000) : null;
    const head = carHeadline({
      location: this.st(c.location), garageCarInside: this.on(c.garage_car_inside), charging: this.st(c.charging),
      cable: this.on(c.charge_cable), battery: battery != null ? Math.round(battery) : "—", limit: limit ?? "—",
      minutesToFull: ttfMin, open,
    });
    const asleep = this.on(c.status) === false;
    const inside = this.num(c.inside_temp), outside = this.num(c.outside_temp);
    const upd = this.st(c.update) === "on" ? this.attr(c.update, "latest_version") : null;
    const tyres = c.tyres ? Object.fromEntries(["fl", "fr", "rl", "rr"].map((k) => [k, this.num(c.tyres[k])])) : null;
    const rec = c.tyres?.recommended;
    const tyreLow = (v) => v != null && rec && v < rec - 3;
    const precond = this.on(c.precondition_enabled);
    const pending = this.num(c.precondition_pending);

    const chip = (ok, label, cls = "") => `<span class="chip ${ok === false ? "warn" : ok == null ? "mute" : cls}">${esc(label)}</span>`;
    const btn = (action, ic, label, on) => `<button class="round ${on ? "on" : ""} ${this.isPending(action) ? "pending" : ""}" data-action="${action}"><span class="btn">${icon(ic)}</span><span>${esc(label)}</span></button>`;

    return `
    <div class="stack">
      <div class="card navy">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div><div class="eyebrow">${esc(c.name ?? "Car")}</div><div class="headline">${esc(head.text)}</div></div>
          <span class="chip mute">● ${asleep ? "Asleep" : "Awake"}</span>
        </div>
        ${carSvg({ trunk: trunk === "open", frunk: frunk === "open", doors: doorsOpen, locked: lock === "locked", tyres, tyreLow })}
        <div style="display:flex;justify-content:space-between;align-items:end;margin:6px 0 12px">
          <span class="big">${battery != null ? Math.round(battery) : "—"}<span style="font-size:22px">%</span></span>
          <span style="text-align:right"><span style="font-size:24px">${range != null ? Math.round(range) : "—"} mi</span><br><span class="sub">estimated range</span></span>
        </div>
        <div class="bar"><div style="width:${Math.min(100, battery ?? 0)}%"></div>${limit != null ? `<span class="mark" style="left:${limit}%"></span>` : ""}</div>
        <div class="sub ${head.tone === "warn" ? "tone-warn" : ""}" style="margin:14px 0 12px">${esc(head.sub)}</div>
        <div class="chips">
          ${chip(lock == null ? null : lock === "locked", lock === "locked" ? "Locked" : lock ? "Unlocked" : "Lock —")}
          ${chip(sentry == null ? null : true, sentry === "on" ? "Sentry on" : "Sentry off", sentry === "on" ? "" : "mute")}
          ${chip((c.doors ?? []).length ? !doorsOpen : null, doorsOpen ? "Door open" : "Doors shut")}
          ${chip(windows == null ? null : windows === "closed", windows === "closed" ? "Windows up" : "Windows open")}
          ${chip(climate == null ? null : true, climate && climate !== "off" ? "Climate on" : "Climate off", climate && climate !== "off" ? "" : "mute")}
          ${upd ? `<span class="chip" style="border-color:#4d3f7a;color:#a98bff;background:#221c36">Update ${esc(upd)}</span>` : ""}
        </div>
        <div class="sub" style="margin-top:12px">${[
          inside != null ? `${Math.round(inside)}° inside` : null,
          outside != null ? `${Math.round(outside)}° outside` : null,
        ].filter(Boolean).join(" · ")}</div>
      </div>
      ${c.precondition_enabled ? `
      <div class="card">
        <div class="eyebrow">Calendar preconditioning</div>
        <div class="headline" style="font-size:19px">${precond ? (pending ? `${pending} warm-up${pending === 1 ? "" : "s"} scheduled.` : "Watching your calendar.") : "Off."}</div>
        <div class="sub">${precond ? "Warms the car before calendar events." : "Manual scheduling still works."}</div>
        <div style="margin-top:12px"><button class="chip ${precond ? "" : "mute"}" style="background:none;cursor:pointer;font:inherit;font-size:13px" data-action="precond">${precond ? "Turn off" : "Turn on"}</button></div>
      </div>` : ""}
      <div class="grid g4">
        ${btn("climate", "mdi:fan", climate && climate !== "off" ? "Climate on" : "Climate", climate && climate !== "off")}
        ${btn(trunk === "open" ? "trunk_close" : "trunk_open", "mdi:car-back", this.pendingLabel("trunk_open", trunk === "open" ? "Close trunk" : "Trunk", "Tap again"), trunk === "open")}
        ${btn("port", "mdi:ev-plug-tesla", port === "open" ? "Close port" : "Port", port === "open")}
        ${btn("flash", "mdi:car-light-high", "Flash", false)}
      </div>
    </div>`;
  }

  handle(action) {
    const c = this.config;
    switch (action) {
      case "climate": return this.call("climate", this.st(c.climate) === "off" ? "turn_on" : "turn_off", { entity_id: c.climate });
      case "trunk_open": return this.call("cover", "open_cover", { entity_id: c.trunk });
      case "trunk_close": return this.call("cover", "close_cover", { entity_id: c.trunk });
      case "port": return this.call("cover", this.st(c.charge_port) === "open" ? "close_cover" : "open_cover", { entity_id: c.charge_port });
      case "flash": return this.call("button", "press", { entity_id: c.flash });
      case "precond": return this.call("input_boolean", "toggle", { entity_id: c.precondition_enabled });
    }
  }
}

function carSvg({ trunk, frunk, doors, locked, tyres, tyreLow }) {
  const t = (x, y, v, anchor) => v == null ? "" : `
    <text x="${x}" y="${y}" text-anchor="${anchor}" fill="${tyreLow(v) ? "#f2b45a" : "#5fd4bf"}" font-size="26">${Math.round(v)}<tspan font-size="12"> psi</tspan></text>
    ${tyreLow(v) ? `<text x="${x}" y="${y + 18}" text-anchor="${anchor}" fill="#f2b45a" font-size="12">Low</text>` : ""}`;
  const amber = "#f2b45a";
  return `
  <svg viewBox="0 0 320 220" width="100%" aria-hidden="true">
    ${tyres ? `${t(22, 50, tyres.fl, "start")}${t(298, 50, tyres.fr, "end")}${t(22, 170, tyres.rl, "start")}${t(298, 170, tyres.rr, "end")}` : ""}
    <rect x="118" y="10" width="84" height="200" rx="34" fill="#cfd5de" stroke="${doors ? amber : "none"}" stroke-width="3"/>
    <rect x="128" y="20" width="64" height="20" rx="8" fill="${frunk ? amber : "#b9c1cc"}"/>
    <rect x="128" y="44" width="64" height="40" rx="12" fill="#2a3445"/>
    <rect x="128" y="92" width="64" height="58" rx="8" fill="#334055"/>
    <rect x="132" y="158" width="56" height="28" rx="10" fill="#2a3445"/>
    <rect x="130" y="190" width="60" height="14" rx="6" fill="${trunk ? amber : "#b9c1cc"}"/>
    <g fill="#5fd4bf44"><rect x="110" y="40" width="10" height="30" rx="4"/><rect x="200" y="40" width="10" height="30" rx="4"/>
      <rect x="110" y="150" width="10" height="30" rx="4"/><rect x="200" y="150" width="10" height="30" rx="4"/></g>
    <foreignObject x="148" y="109" width="24" height="24"><div xmlns="http://www.w3.org/1999/xhtml" style="color:${locked ? "#9fb3d8" : amber};--mdc-icon-size:20px;display:grid;place-items:center">${icon(locked ? "mdi:lock" : "mdi:lock-open-variant")}</div></foreignObject>
  </svg>`;
}

customElements.define("stonebridge-car", StonebridgeCar);
