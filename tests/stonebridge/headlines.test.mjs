// Run: node --test tests/stonebridge/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as h from "../../www/stonebridge/headlines.js";

test("relTime", () => {
  assert.equal(h.relTime(null), null);
  assert.equal(h.relTime(0.2), "just now");
  assert.equal(h.relTime(4), "4 min ago");
  assert.equal(h.relTime(180), "3 h ago");
  assert.equal(h.relTime(60 * 50), "2 d ago");
});

test("home: all quiet", () => {
  const r = h.homeHeadline({ alarm: "disarmed", lock: "locked", garage: "closed", insideTemp: 71.4 });
  assert.equal(r.tone, "ok");
  assert.equal(r.text, "All quiet at home.");
  assert.equal(r.sub, "Alarm is off. It's 71° inside.");
});

test("home: problems listed, warn", () => {
  const r = h.homeHeadline({ alarm: "armed_home", lock: "unlocked", garage: "open" });
  assert.equal(r.tone, "warn");
  assert.equal(r.text, "The front door is unlocked and the garage is open.");
});

test("home: openings included when sensors exist", () => {
  const r = h.homeHeadline({ lock: "locked", garage: "closed", openings: [{ name: "Back door", open: true }] });
  assert.equal(r.text, "Back door is open.");
});

test("home: alerts outrank warnings", () => {
  assert.equal(h.homeHeadline({ alarm: "triggered", lock: "unlocked" }).tone, "alert");
  assert.equal(h.homeHeadline({ jammed: true, lock: "locked" }).text, "The front door lock is jammed.");
  assert.equal(h.homeHeadline({ personNow: "doorbell", lock: "locked", garage: "closed" }).tone, "alert");
});

test("home: unknown doors never claim quiet", () => {
  const r = h.homeHeadline({ alarm: null, lock: null, garage: null });
  assert.equal(r.tone, "info");
  assert.equal(r.sub, null);
});

test("greeting", () => {
  assert.equal(h.greeting(8), "Good morning");
  assert.equal(h.greeting(14), "Good afternoon");
  assert.equal(h.greeting(19), "Good evening");
  assert.equal(h.greeting(23), "Good night");
});

test("whoIsHome", () => {
  assert.equal(h.whoIsHome([{ name: "Caleb", state: "home" }, { name: "Becca", state: "home" }]).text, "Both home");
  assert.equal(h.whoIsHome([{ name: "Caleb", state: "home" }, { name: "Becca", state: "not_home" }]).text, "Caleb home");
  assert.equal(h.whoIsHome([{ name: "Caleb", state: "x" }, { name: "Becca", state: "y" }]).text, "Nobody home");
  assert.equal(h.whoIsHome([{ name: "Caleb", state: null }]).text, "—");
});

test("security: locked up, recent person", () => {
  const r = h.securityHeadline({ alarm: "disarmed", lock: "locked", garage: "closed", lastPerson: { camera: "the doorbell", minutes: 4 } });
  assert.equal(r.text, "Locked up. Person at the doorbell 4 min ago.");
  assert.equal(r.tone, "info");
});

test("security: cannot confirm when lock unknown", () => {
  assert.equal(h.securityHeadline({ lock: null, garage: "closed" }).tone, "info");
});

test("security: unlocked and open", () => {
  const r = h.securityHeadline({ lock: "unlocked", garage: "open" });
  assert.equal(r.text, "Front door is unlocked. Garage is open.");
  assert.equal(r.tone, "warn");
});

test("cameras", () => {
  assert.equal(h.camerasHeadline([{ name: "Doorbell", personNow: true }]).text, "Someone at the doorbell camera now.");
  const r = h.camerasHeadline([
    { name: "Doorbell", minutesSincePerson: 4 },
    { name: "Back left", minutesSincePerson: 200 },
  ]);
  assert.equal(r.text, "Person at the doorbell camera 4 min ago.");
  assert.equal(h.camerasHeadline([{ name: "Doorbell", minutesSincePerson: 200 }]).text, "No one around.");
  assert.equal(h.camerasHeadline([{ name: "Doorbell", minutesSincePerson: null }]).sub, null);
});

test("car", () => {
  assert.equal(h.carHeadline({ location: "home", garageCarInside: true }).text, "In the garage");
  assert.equal(h.carHeadline({ location: "not_home" }).text, "Away");
  assert.equal(h.carHeadline({ location: "Work" }).text, "At Work");
  assert.equal(h.carHeadline({ location: "unavailable" }).text, "Location unknown");
  assert.equal(h.carHeadline({ location: "home", charging: "charging", limit: 80, minutesToFull: 120 }).sub, "Charging to 80% · 2 h left");
  assert.equal(h.carHeadline({ location: "home", cable: true, charging: "stopped" }).sub, "Plugged in, not charging");
  const open = h.carHeadline({ location: "home", open: ["Trunk"] });
  assert.equal(open.tone, "warn");
  assert.equal(open.sub, "Trunk open · Not plugged in");
});

test("thermostat", () => {
  assert.equal(h.thermostatHeadline({ mode: "cool", action: "idle", target: 72.5 }).text, "Holding at 72.5°");
  assert.equal(h.thermostatHeadline({ mode: "heat", action: "heating", target: 70 }).text, "Heating to 70°");
  assert.equal(h.thermostatHeadline({ mode: "off" }).text, "Thermostat is off");
  assert.equal(h.thermostatHeadline({ mode: "heat_cool", action: "idle", low: 68, high: 76 }).text, "Holding 68°–76°");
  assert.equal(h.thermostatHeadline({ mode: null }).text, "Thermostat unavailable");
});

test("rooms", () => {
  assert.equal(h.roomsHeadline([]).text, "No room temperatures yet.");
  assert.equal(h.roomsHeadline([{ name: "Living room", temp: 68.8 }]).text, "Living room is 69°.");
  assert.equal(h.roomsHeadline([{ name: "Office", temp: 74 }, { name: "Garage", temp: 66 }]).text, "Office is 8° warmer than garage.");
  assert.equal(h.roomsHeadline([{ name: "A", temp: 70 }, { name: "B", temp: 70.5 }]).text, "Every room is within a degree or two.");
  assert.equal(h.roomsHeadline([{ name: "A", temp: null }]).text, "No room temperatures yet.");
});

test("bill", () => {
  assert.equal(h.billHeadline({ toDate: 233, forecast: 356 }).text, "On pace for $356 this bill.");
  assert.equal(h.billHeadline({ toDate: null, forecast: null }).text, "No bill data.");
});

test("lights", () => {
  assert.equal(h.lightsHeadline([{ name: "Kitchen", on: false }]).text, "All lights are off.");
  assert.equal(h.lightsHeadline([{ name: "Kitchen", on: true }]).text, "1 light on: Kitchen.");
  assert.equal(h.lightsHeadline([{ name: "A", floor: "Downstairs", on: true }, { name: "B", floor: "Downstairs", on: true }]).text, "2 lights on, all downstairs.");
  assert.equal(h.lightsHeadline([{ name: "A", floor: "Downstairs", on: true }, { name: "B", floor: "Upstairs", on: true }]).text, "2 lights on, upstairs and down.");
  assert.equal(h.lightsHeadline([{ name: "A", on: null }]).text, "All lights are off.");
});
