import { SbCard, esc, icon } from "../base.js";
import { thermostatHeadline, roomsHeadline, billHeadline } from "../headlines.js";

// type: custom:stonebridge-climate
// config: thermostat, outside_temp,
//   rooms: [{name, temperature, humidity?, source?}]   <- add new sensors here
//   bill: {to_date, forecast, typical?}                 (optional)
class StonebridgeClimate extends SbCard {
  entities() {
    const c = this.config;
    return [c.thermostat, c.outside_temp, c.bill?.to_date, c.bill?.forecast, c.bill?.typical,
      ...(c.rooms ?? []).flatMap((r) => [r.temperature, r.humidity])];
  }

  render() {
    const c = this.config;
    const t = c.thermostat;
    const a = (k) => this.attr(t, k);
    const mode = this.st(t);
    const head = thermostatHeadline({ mode, action: a("hvac_action"), target: a("temperature"), low: a("target_temp_low"), high: a("target_temp_high") });
    const cur = a("current_temperature");
    const hum = a("current_humidity");
    const preset = a("preset_mode");
    const step = a("target_temp_step") ?? 0.5;
    const single = a("temperature") != null;

    const rooms = (c.rooms ?? []).map((r) => {
      // A room may point at the thermostat itself (climate entity) or at a sensor.
      const temp = r.temperature?.startsWith("climate.") ? this.attr(r.temperature, "current_temperature") : this.num(r.temperature);
      const humidity = r.humidity?.startsWith("climate.") ? this.attr(r.humidity, "current_humidity") : this.num(r.humidity);
      return { ...r, temp, humidity };
    });
    const rh = roomsHeadline(rooms);
    const out = this.num(c.outside_temp);
    const bill = c.bill ? billHeadline({ toDate: this.num(c.bill.to_date), forecast: this.num(c.bill.forecast) }) : null;

    // Arc gauge: 270° sweep, 55°F..85°F
    const frac = cur == null ? 0 : Math.max(0, Math.min(1, (cur - 55) / 30));
    const sweep = 226;
    const arcCol = a("hvac_action") === "heating" ? "#f2b45a" : a("hvac_action") === "cooling" ? "#6aa7ff" : "#9fb3d8";

    return `
    <div class="stack">
      <div class="card">
        <div style="display:flex;gap:16px;align-items:center">
          <svg viewBox="0 0 120 120" width="120" style="flex:none" aria-hidden="true">
            <circle cx="60" cy="60" r="48" fill="none" stroke="#2a303c" stroke-width="10" stroke-dasharray="${sweep} 302" transform="rotate(135 60 60)" stroke-linecap="round"/>
            <circle cx="60" cy="60" r="48" fill="none" stroke="${arcCol}" stroke-width="10" stroke-dasharray="${sweep * frac} 302" transform="rotate(135 60 60)" stroke-linecap="round"/>
            <text x="60" y="66" text-anchor="middle" fill="#e9edf3" font-size="30" font-weight="300">${cur != null ? `${Math.round(cur)}°` : "—"}</text>
            <text x="60" y="84" text-anchor="middle" fill="#9aa4b5" font-size="11">inside</text>
          </svg>
          <div>
            <div class="eyebrow">${esc(c.thermostat_name ?? "Thermostat")}</div>
            <div class="headline">${esc(head.text)}</div>
            <div class="sub">${[mode ? `Mode: ${cap(mode.replace("_", "/"))}` : null, hum != null ? `${hum}% humidity` : null, preset ? `Preset: ${cap(preset)}` : null].filter(Boolean).map(esc).join("<br>")}</div>
          </div>
        </div>
        ${single && mode !== "off" ? `
        <div style="display:flex;align-items:center;justify-content:center;gap:22px;margin-top:14px">
          <button class="round" data-action="down"><span class="btn" style="width:48px;height:48px">${icon("mdi:minus")}</span></button>
          <div style="text-align:center"><div style="font-size:28px">${a("temperature")}°</div><div class="sub">Target</div></div>
          <button class="round" data-action="up"><span class="btn" style="width:48px;height:48px">${icon("mdi:plus")}</span></button>
        </div>` : ""}
        <div class="seg" style="margin-top:14px">
          ${["home", "away", "sleep"].map((p) => `<button data-action="preset:${p}" class="${preset === p ? "on" : ""}">${icon({ home: "mdi:home", away: "mdi:home-export-outline", sleep: "mdi:weather-night" }[p])}${cap(p)}</button>`).join("")}
        </div>
      </div>

      <div class="card">
        <div class="eyebrow">Room by room</div>
        <div class="headline" style="font-size:20px">${esc(rh.text)}</div>
        ${rooms.map((r) => `
          <div class="row">
            <span><span class="dot" style="color:${tempColour(r.temp)}"></span><span>${esc(r.name)}${r.source ? `<br><small class="sub">${esc(r.source)}</small>` : ""}</span></span>
            <span style="display:flex;align-items:center;gap:14px">
              ${r.humidity != null ? `<span class="sub">${Math.round(r.humidity)}% humid</span>` : ""}
              <span style="font-size:24px;min-width:56px;text-align:right">${r.temp != null ? `${Math.round(r.temp)}°` : "—"}</span>
            </span>
          </div>`).join("")}
        ${out != null ? `<div class="row"><span><span class="dot" style="color:${tempColour(out)}"></span>Outside</span><span style="font-size:24px">${Math.round(out)}°</span></div>` : ""}
      </div>

      ${bill ? `
      <div class="card">
        <div class="eyebrow">Electric bill</div>
        <div class="headline" style="font-size:20px">${esc(bill.text)}</div>
        ${bill.sub ? `<div class="sub">${esc(bill.sub)}</div>` : ""}
        ${this.billBar()}
      </div>` : ""}
    </div>`;
  }

  billBar() {
    const b = this.config.bill;
    const to = this.num(b.to_date), fc = this.num(b.forecast);
    if (to == null || !fc) return "";
    return `<div class="bar" style="margin-top:14px"><div style="width:${Math.min(100, (to / fc) * 100)}%"></div></div>`;
  }

  handle(action) {
    const t = this.config.thermostat;
    const step = this.attr(t, "target_temp_step") ?? 0.5;
    const cur = this.attr(t, "temperature");
    if (action === "up" || action === "down") {
      return this.call("climate", "set_temperature", { entity_id: t, temperature: cur + (action === "up" ? step : -step) });
    }
    if (action.startsWith("preset:")) return this.call("climate", "set_preset_mode", { entity_id: t, preset_mode: action.slice(7) });
  }
}

// Blue (62°) → teal → green → yellow → red (80°), matching the concept's scale.
function tempColour(t) {
  if (t == null) return "#6b7486";
  const stops = [[62, "#4a7dff"], [68, "#5fd4bf"], [72, "#9fd88a"], [76, "#f2b45a"], [80, "#e86a6a"]];
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) return stops[i][1];
  return stops.at(-1)[1];
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
customElements.define("stonebridge-climate", StonebridgeClimate);
