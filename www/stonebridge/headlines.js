// Pure functions: plain values in, { tone, text, sub? } out. No DOM, no hass.
// tone is one of "ok" | "warn" | "alert" | "info" and drives the accent colour.
// Rule: never assert a state we could not read — missing values are null.

export function relTime(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return null;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const h = minutes / 60;
  if (h < 24) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const ALARM_WORDS = {
  disarmed: "off",
  armed_home: "armed (home)",
  armed_away: "armed (away)",
  armed_night: "armed (night)",
  arming: "arming",
  pending: "about to go off",
  triggered: "going off",
};

export function alarmWord(state) {
  return ALARM_WORDS[state] ?? null;
}

function list(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

// --- Home -----------------------------------------------------------------

export function homeHeadline({ alarm, lock, jammed, garage, personNow, insideTemp, openings = [] }) {
  const sub = [];
  const aw = alarmWord(alarm);
  if (aw) sub.push(`Alarm is ${aw}.`);
  if (insideTemp != null) sub.push(`It's ${Math.round(insideTemp)}° inside.`);
  const subText = sub.join(" ") || null;

  if (alarm === "triggered") return { tone: "alert", text: "The alarm is going off.", sub: subText };
  if (jammed) return { tone: "alert", text: "The front door lock is jammed.", sub: subText };
  if (personNow) return { tone: "alert", text: `Someone is at the ${personNow} camera.`, sub: subText };

  const problems = [];
  if (lock === "unlocked") problems.push("the front door is unlocked");
  if (garage === "open" || garage === "opening") problems.push("the garage is open");
  const open = openings.filter((o) => o.open).map((o) => o.name);
  if (open.length) problems.push(`${list(open)} ${open.length === 1 ? "is" : "are"} open`);
  if (problems.length) {
    const t = list(problems);
    return { tone: "warn", text: `${t[0].toUpperCase()}${t.slice(1)}.`, sub: subText };
  }
  if (lock == null && garage == null) return { tone: "info", text: "Can't read the doors right now.", sub: subText };
  return { tone: "ok", text: "All quiet at home.", sub: subText };
}

export function greeting(hour) {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good night";
}

export function whoIsHome(people) {
  const known = people.filter((p) => p.state != null);
  const home = known.filter((p) => p.state === "home");
  if (!known.length) return { tone: "info", text: "—", sub: "Who's home" };
  if (home.length === known.length) return { tone: "ok", text: known.length === 2 ? "Both home" : "Everyone home", sub: "Together" };
  if (!home.length) return { tone: "info", text: "Nobody home", sub: "House is empty" };
  return { tone: "info", text: `${list(home.map((p) => p.name))} home`, sub: `${list(known.filter((p) => p.state !== "home").map((p) => p.name))} out` };
}

// --- Security -------------------------------------------------------------

export function securityHeadline({ alarm, lock, jammed, garage, lastPerson, openings = [] }) {
  const sub = alarm === "disarmed"
    ? "Arm it when you leave, or Alarmo arms itself at night."
    : alarmWord(alarm) ? `Alarm is ${alarmWord(alarm)}.` : null;

  if (alarm === "triggered") return { tone: "alert", text: "The alarm is going off.", sub };
  if (jammed) return { tone: "alert", text: "The front door lock is jammed.", sub };

  const parts = [];
  const secure = lock === "locked" && garage === "closed" && !openings.some((o) => o.open);
  if (lock === "unlocked") parts.push("Front door is unlocked");
  if (garage === "open" || garage === "opening") parts.push("Garage is open");
  const open = openings.filter((o) => o.open).map((o) => o.name);
  if (open.length) parts.push(`${list(open)} open`);

  let text;
  let tone;
  if (parts.length) { text = `${parts.join(". ")}.`; tone = "warn"; }
  else if (secure) { text = "Locked up."; tone = "ok"; }
  else { text = "Can't confirm everything is locked."; tone = "info"; }

  if (lastPerson && lastPerson.minutes != null && lastPerson.minutes < 30) {
    const when = lastPerson.now ? "now" : relTime(lastPerson.minutes);
    text += ` Person at ${lastPerson.camera} ${when}.`;
    if (tone === "ok") tone = lastPerson.now ? "alert" : "info";
  }
  return { tone, text, sub };
}

// --- Cameras --------------------------------------------------------------

// cams: [{ name, personNow, minutesSincePerson }] (minutesSincePerson = time since
// the person sensor last changed while it is off; null when unknown)
export function camerasHeadline(cams) {
  const now = cams.filter((c) => c.personNow);
  if (now.length) return { tone: "alert", text: `Someone at the ${list(now.map((c) => c.name.toLowerCase()))} camera${now.length > 1 ? "s" : ""} now.` };
  const recent = cams
    .filter((c) => c.minutesSincePerson != null)
    .sort((a, b) => a.minutesSincePerson - b.minutesSincePerson);
  if (recent.length && recent[0].minutesSincePerson < 60) {
    return {
      tone: "info",
      text: `Person at the ${recent[0].name.toLowerCase()} camera ${relTime(recent[0].minutesSincePerson)}.`,
      sub: "Quiet everywhere else.",
    };
  }
  return { tone: "ok", text: "No one around.", sub: recent.length ? `Last person ${relTime(recent[0].minutesSincePerson)} at ${recent[0].name.toLowerCase()}.` : null };
}

// --- Car ------------------------------------------------------------------

export function carHeadline({ location, garageCarInside, charging, cable, battery, limit, minutesToFull, open = [] }) {
  let text;
  if (location === "home") text = garageCarInside ? "In the garage" : "At home";
  else if (location == null || location === "unknown" || location === "unavailable") text = "Location unknown";
  else if (location === "not_home") text = "Away";
  else text = `At ${location}`;

  let sub;
  if (charging === "charging") {
    sub = minutesToFull ? `Charging to ${limit}% · ${relTime(minutesToFull).replace(" ago", "")} left` : `Charging to ${limit}%`;
  } else if (charging === "complete") sub = `Done charging at ${battery}%`;
  else if (cable) sub = "Plugged in, not charging";
  else sub = "Not plugged in";

  const tone = open.length ? "warn" : "ok";
  if (open.length) sub = `${list(open)} open · ${sub}`;
  return { tone, text, sub };
}

// --- Climate --------------------------------------------------------------

export function thermostatHeadline({ mode, action, target, low, high }) {
  const t = (v) => (v == null ? "—" : `${Math.round(v * 2) / 2}°`);
  if (mode == null || mode === "unavailable") return { tone: "info", text: "Thermostat unavailable" };
  if (mode === "off") return { tone: "info", text: "Thermostat is off" };
  if (mode === "heat_cool") {
    if (action === "heating") return { tone: "warn", text: `Heating to ${t(low)}` };
    if (action === "cooling") return { tone: "info", text: `Cooling to ${t(high)}` };
    return { tone: "ok", text: `Holding ${t(low)}–${t(high)}` };
  }
  if (action === "heating") return { tone: "warn", text: `Heating to ${t(target)}` };
  if (action === "cooling") return { tone: "info", text: `Cooling to ${t(target)}` };
  return { tone: "ok", text: `Holding at ${t(target)}` };
}

export function roomsHeadline(rooms) {
  const r = rooms.filter((x) => x.temp != null);
  if (!r.length) return { tone: "info", text: "No room temperatures yet." };
  if (r.length === 1) return { tone: "ok", text: `${r[0].name} is ${Math.round(r[0].temp)}°.` };
  const sorted = [...r].sort((a, b) => b.temp - a.temp);
  const diff = Math.round(sorted[0].temp - sorted.at(-1).temp);
  if (diff < 2) return { tone: "ok", text: "Every room is within a degree or two." };
  return { tone: diff >= 6 ? "warn" : "ok", text: `${sorted[0].name} is ${diff}° warmer than ${sorted.at(-1).name.toLowerCase()}.` };
}

export function billHeadline({ toDate, forecast }) {
  if (toDate == null && forecast == null) return { tone: "info", text: "No bill data." };
  if (forecast == null) return { tone: "info", text: `$${Math.round(toDate)} so far this bill.` };
  return { tone: "info", text: `On pace for $${Math.round(forecast)} this bill.`, sub: toDate != null ? `$${Math.round(toDate)} so far.` : null };
}

// --- Lights ---------------------------------------------------------------

// lights: [{ name, floor, on }]  (on: true/false/null for unavailable)
export function lightsHeadline(lights) {
  const on = lights.filter((l) => l.on === true);
  if (!on.length) return { tone: "ok", text: "All lights are off." };
  if (on.length === 1) return { tone: "info", text: `1 light on: ${on[0].name}.` };
  const floors = [...new Set(on.map((l) => l.floor).filter(Boolean))];
  const where = floors.length === 1 ? `, all ${floors[0].toLowerCase()}` : floors.length > 1 ? ", upstairs and down" : "";
  return { tone: "info", text: `${on.length} lights on${where}.` };
}
