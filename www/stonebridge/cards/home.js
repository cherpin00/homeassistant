import { SbCard, esc, icon } from "../base.js";
import { homeHeadline, greeting, whoIsHome, alarmWord } from "../headlines.js";

// type: custom:stonebridge-home
// config: alarm, lock, lock_jammed, garage, weather, outside_temp, inside_temp,
//   car_battery, car_location, vacuum, people: [{entity, name}],
//   lights: [entity...], upstairs_lights: [entity...], cameras_person: [{entity, name}],
//   openings: [{entity, name}] (optional, for future contact sensors)
class StonebridgeHome extends SbCard {
  entities() {
    const c = this.config;
    return [c.alarm, c.lock, c.lock_jammed, c.garage, c.weather, c.outside_temp, c.inside_temp, c.car_battery,
      c.car_location, c.vacuum, "sun.sun", ...(c.people ?? []).map((p) => p.entity), ...(c.lights ?? []),
      ...(c.cameras_person ?? []).map((p) => p.entity), ...(c.openings ?? []).map((o) => o.entity)];
  }

  render() {
    const c = this.config;
    const alarm = this.st(c.alarm), lock = this.st(c.lock), garage = this.st(c.garage);
    const personNow = (c.cameras_person ?? []).find((p) => this.on(p.entity));
    const openings = (c.openings ?? []).map((o) => ({ name: o.name, open: this.on(o.entity) }));
    const inside = this.num(c.inside_temp) ?? this.attr(c.inside_temp, "current_temperature");
    const head = homeHeadline({ alarm, lock, jammed: this.on(c.lock_jammed), garage, personNow: personNow?.name.toLowerCase(), insideTemp: inside, openings });
    const night = this.st("sun.sun") === "below_horizon";
    const lightsOn = (c.lights ?? []).filter((l) => this.on(l));
    const upstairsLit = (c.upstairs_lights ?? []).some((l) => this.on(l));
    const outside = this.num(c.outside_temp);
    const cond = this.st(c.weather);
    const who = whoIsHome((c.people ?? []).map((p) => ({ name: p.name, state: this.st(p.entity) })));
    const carPct = this.num(c.car_battery);
    const vac = this.st(c.vacuum);
    const garageWord = garage ? garage[0].toUpperCase() + garage.slice(1) : "—";

    const sub = [head.sub, carPct != null ? `Car is ${this.st(c.car_location) === "home" ? "home" : "out"} at ${Math.round(carPct)}%.` : null].filter(Boolean).join(" ");

    return `
    <div class="stack">
      <div class="card navy" style="padding:0">
        <div style="display:flex;justify-content:space-between;padding:16px 18px 0">
          <span style="font-size:20px">${greeting(new Date().getHours())}</span>
          <span class="sub">${outside != null ? `${Math.round(outside)}°` : ""}${cond ? ` · ${esc(cond.replace(/-/g, " "))}` : ""}</span>
        </div>
        ${house({ night, upstairsLit, garageOpen: garage === "open", locked: lock === "locked", tone: head.tone })}
        <div style="padding:14px 18px 18px">
          <div class="headline" style="display:flex;align-items:center"><span class="dot tone-${head.tone}"></span>${esc(head.text)}</div>
          <div class="sub">${esc(sub)}</div>
        </div>
      </div>
      <div class="grid g3">
        ${tile("alarm", alarm && alarm !== "disarmed" ? "armed" : "", "mdi:shield-home", alarmWord(alarm) ? cap(alarmWord(alarm)) : "—", "Alarm")}
        ${tile("lock", lock === "locked" ? "ok" : lock === "unlocked" ? "warn" : "", lock === "unlocked" ? "mdi:lock-open-variant" : "mdi:lock", lock ? cap(lock) : "—", "Front door")}
        ${tile("garage", garage === "closed" ? "ok" : garage ? "warn" : "", garage === "closed" ? "mdi:garage" : "mdi:garage-open", garageWord, "Garage")}
        ${tile("vacuum", "", "mdi:robot-vacuum", vac ? cap(vac) : "—", "Roomba")}
        ${tile("lights", lightsOn.length ? "" : "", "mdi:lightbulb-group", lightsOn.length ? `${lightsOn.length} on` : "All off", "Lights")}
        ${tile("people", who.tone === "ok" ? "ok" : "", "mdi:account-multiple", who.text, who.sub)}
      </div>
    </div>`;
  }

  handle(action) {
    const c = this.config;
    const map = { alarm: c.alarm, lock: c.lock, garage: c.garage, vacuum: c.vacuum, people: c.people?.[0]?.entity };
    if (action === "lights") {
      // HA's own navigate(): push the path, then tell the router.
      history.pushState(null, "", c.lights_path ?? "/stonebridge-home/lights");
      window.dispatchEvent(new CustomEvent("location-changed"));
      return;
    }
    if (map[action]) this.moreInfo(map[action]);
  }
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

function tile(action, cls, ic, big, small) {
  return `<button class="tile ${cls}" data-action="${action}">${icon(ic)}<b>${esc(big)}</b><small>${esc(small)}</small></button>`;
}

function house({ night, upstairsLit, garageOpen, locked, tone }) {
  const sky = night ? ["#16244a", "#1c2d55"] : ["#3f6fa8", "#7fa9d6"];
  const wall = night ? "#25365a" : "#4a5f86";
  const roof = night ? "#2c3d63" : "#3b4f78";
  const win = night ? "#3a4d76" : "#9cc3e6";
  const lit = "#f2c27a";
  const toneCol = { ok: "#5fd4bf", warn: "#f2b45a", alert: "#e86a6a", info: "#9fb3d8" }[tone];
  return `
  <svg viewBox="0 0 360 190" width="100%" style="display:block" aria-hidden="true">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
    <rect width="360" height="190" fill="url(#sky)"/>
    ${night
      ? `<g fill="#fff" opacity=".7"><circle cx="40" cy="22" r="1.2"/><circle cx="120" cy="14" r="1"/><circle cx="210" cy="30" r="1.3"/><circle cx="300" cy="58" r="1"/><circle cx="250" cy="10" r="1"/></g>
         <path d="M318 26a14 14 0 1 0 10 24a11 11 0 1 1 -10 -24z" fill="#f4ecd0"/>`
      : `<circle cx="318" cy="36" r="16" fill="#ffe29a"/><circle cx="318" cy="36" r="26" fill="#ffe29a" opacity=".2"/>`}
    <polygon points="70,82 180,40 290,82" fill="${roof}" stroke="#4a5f8c"/>
    <rect x="70" y="82" width="220" height="90" fill="${wall}" stroke="#4a5f8c"/>
    <rect x="88" y="94" width="40" height="28" fill="${upstairsLit && night ? lit : win}"/>
    <rect x="160" y="94" width="40" height="28" fill="${upstairsLit && night ? lit : win}" opacity=".95"/>
    <rect x="232" y="94" width="40" height="28" fill="${win}"/>
    ${garageOpen
      ? `<rect x="84" y="134" width="110" height="38" fill="#0d1424" stroke="#f2b45a"/><rect x="84" y="134" width="110" height="8" fill="#33476f" stroke="#f2b45a"/>`
      : `<rect x="84" y="134" width="110" height="38" fill="#33476f" stroke="#52689a"/>
         <g stroke="#52689a"><line x1="84" y1="144" x2="194" y2="144"/><line x1="84" y1="154" x2="194" y2="154"/><line x1="84" y1="164" x2="194" y2="164"/></g>`}
    <rect x="240" y="132" width="24" height="40" fill="#33476f" stroke="#52689a"/>
    <circle cx="259" cy="153" r="2.6" fill="${locked ? "#5fd4bf" : "#f2b45a"}"/>
    <rect x="228" y="140" width="6" height="10" rx="2" fill="${night ? "#f2b45a" : "#8090a8"}"/>
    <rect x="0" y="172" width="360" height="18" fill="${night ? "#141d33" : "#2d3e5c"}"/>
    <circle cx="20" cy="180" r="4" fill="${toneCol}"/>
  </svg>`;
}

customElements.define("stonebridge-home", StonebridgeHome);
