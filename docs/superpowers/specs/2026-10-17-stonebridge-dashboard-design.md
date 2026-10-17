# Stonebridge dashboard — design

Date: 2026-10-17 · Status: approved for planning

## Intent

Caleb saw an r/homeassistant dashboard (illustrated house, plain-English
headlines on every card, one consistent dark design) and wants his own phone
dashboard to look and feel like that, using the devices this house really has.
A static concept board was approved first; this document turns it into a live
dashboard.

The point is a dashboard that is pleasant to glance at on the phone **and** easy
to keep extending — Caleb plans to add room temperature sensors and door/window
contact sensors later, and a floor-plan card after that.

## Goals

- A new YAML dashboard, **Stonebridge**, in the HA app, with six views:
  Home, Lights & fans, Climate, Model Y, Security, Cameras.
- Every card opens with a **one-line plain-English headline** computed from live
  state ("All quiet at home.", "Someone at the doorbell 4 min ago."), then
  detail, then controls.
- Real, live state and real controls (lock, alarm, garage, lights, fans, car).
- Visual language from the concept board: dark navy, one teal accent for
  "fine", amber for "needs attention", red for alerts, rounded cards, SVG
  illustrations.
- **Cheap to extend**: new sensors are added by editing dashboard YAML only, no
  card code changes.

## Non-goals (for this project)

- The floor-plan card (temperature heat-map / doors-and-windows map). Separate
  later project; needs a layout sketch from Caleb. The config shape below is
  designed so it can reuse the same sensor lists.
- Replacing or editing existing dashboards (the default one, `tesla-car`).
- Visual (UI) card editors — cards are configured in YAML only.
- Anything needing HACS frontend plugins.
- New automations or helpers.

## Anti-goals (failure even if it "works")

- **A control that can be triggered by accident.** Unlock, disarm, and garage
  open must take a confirming second tap. (The deadbolt has no door-position
  sensor — see the repo CLAUDE.md "Lock-up" section — so a stray unlock is not
  self-correcting.)
- **Claiming a state the house cannot sense.** No "doors shut" / "windows shut"
  until contact sensors exist. Absent data renders as absent, never as "fine".
- Breaking HA config or the existing dashboards.
- A build step or toolchain this repo does not already have (it has none).

## Constraints and facts (from live HA, 2026-10-17)

- HA at `192.168.98.99:8123`; `lovelace: mode: storage` with one YAML dashboard
  already (`tesla-car`). `/homeassistant/www` exists, so `/local/` is served.
- Deploy loop is the repo's: branch → PR → merge → `hapull` → reload
  (see CLAUDE.md "Working With This Repo"). Live `/config` currently has
  **uncommitted UI edits** to `automations.yaml` and `scenes.yaml`; this project
  must not touch those files.
- Entities available (verified live):

| Area | Entities |
|---|---|
| Alarm | `alarm_control_panel.alarmo` (no code required) |
| Front door | `lock.assure_2_biometric_deadbolt`, `binary_sensor.assure_2_biometric_deadbolt_lock_jammed`; DoorSense entities are `unknown` — do not use |
| Garage | `cover.ratgdo32disco_f9898c_door`, `light.ratgdo32disco_f9898c_light`, `lock.ratgdo32disco_f9898c_lock_remotes`, `binary_sensor.ratgdo32disco_f9898c_obstruction`; close via `script.garage_close_safely` |
| People | `person.cherpin`, `person.becca` (`person.dherpin` exists but is not a resident — exclude) |
| Weather | `weather.home`, `sensor.outside_temperature` |
| Thermostat | `climate.ecobee_9505_stonebridge` (current temp, humidity, target, hvac_action, presets home/away/sleep) |
| Other temps | `sensor.i_9psl_temperature` / `_humidity`, `sensor.caleb_s_3rd_echo_dot_temperature` (rooms unknown — Caleb to name) |
| Energy | `sensor.stonebridge_austing_energy_current_bill_electric_cost_to_date`, `..._forecasted_cost`, `..._typical_monthly_electric_cost` |
| Lights | 13 indoor Z-Wave lights (two are `light.s2_dimmer` = Living room main, `light.s2_dimmer_2` = Office main; `light.bed_3_ligh` is misspelled in HA), `light.master_bath_light` currently `unavailable`, 4 camera floodlights, `scene.movie` |
| Fans | `switch.{master,master_bath,guest_bath,bed_1,bed_2,bed_3}_fan`, `switch.{master,guest}_bath_vanity` |
| Model Y | battery, range, charging, charge cable, charge limit, inside/outside temp, lock, sentry, climate, windows/doors binary sensors, trunk/frunk/charge-port covers, flash/honk buttons, `device_tracker.caleb_s_model_y_location`, `sensor.caleb_s_model_y_time_to_arrival`, `input_boolean.tesla_precondition_enabled`. **No tyre-pressure entities are exposed.** |
| Cameras | `camera.{doorbell,front_left,front_right,back_left,back_right}`; person occupancy `binary_sensor.<cam>_person_occupancy` (note: Back Left's *Reolink* entities are named `living_room_*`, but its Frigate ones are `back_left_*` — use the Frigate ones) |
| Roomba | `vacuum.roomba`, `binary_sensor.roomba_bin_full`. `sensor.roomba_battery` reads 0 while cleaning — **do not display battery** |

## Decided design

### Shape

- **Vanilla JavaScript custom elements, ES modules, no build step**, served
  from `www/stonebridge/` → `/local/stonebridge/`. One entry module imports the
  shared pieces and every card and registers them as `custom:stonebridge-*`.
- **Loaded via `frontend: extra_module_url`** in `configuration.yaml` (git
  managed), not a storage-mode Lovelace resource (UI-only, not in git). The URL
  carries a version query (`?v=N`) bumped on every change so the Companion app
  does not serve stale code. Adding `extra_module_url` and the new dashboard
  entry requires **one HA restart**; after that, card changes need only a
  version bump + `hapull` + app refresh.
- **Dashboard**: `dashboards/stonebridge.yaml`, registered under
  `lovelace: dashboards:` next to `tesla-car` (`stonebridge`, sidebar on, not
  admin-only).

### Layering (what makes it cheap to change)

1. `theme.js` — the one stylesheet: colours, radius, type scale, card/tile/chip
   classes. Every card adopts it. No card defines its own palette.
2. `headlines.js` — **pure functions** from plain state objects to headline
   strings. No DOM, no `hass`. Unit-tested with `node --test` (Node 20 is on
   cap2; tests run locally, nothing ships to HA).
3. `base.js` — shared card base: `setConfig`, `hass` setter that **re-renders
   only when one of the card's configured entities changed**, entity-missing
   handling, and a `confirm`-style two-tap helper for sensitive actions.
4. One file per card. Cards read entity IDs **only from their YAML config**;
   none are hard-coded.

### Cards (one per view unless noted)

- **Home** — SVG house illustration (night/day by `sun.sun`; upstairs window lit
  when any upstairs light on; door light; lock dot), greeting + weather,
  headline, then tiles: Alarm, Front door, Garage, Roomba, Lights on count,
  Who's home.
- **Security** — Alarmo state in the centre ring with lock / garage / cameras
  around it; headline; Home / Away / Disarm buttons (Disarm two-tap); rows for
  deadbolt (jammed shown in red), garage, garage remotes. An `openings:` list
  (empty now) renders a Doors & windows row when populated.
- **Cameras** — headline from person-occupancy last-changed; doorbell large
  with live view, other four as refreshing snapshots with "Person · 4m" badges.
  Live view uses HA's own `picture-entity` card created via
  `loadCardHelpers()`, so streaming and auth stay HA's problem.
- **Model Y** — top-down SVG car (doors/trunk/frunk/windows highlighted when
  open), battery %, range, charge-limit marker, charging line, status chips,
  preconditioning line, buttons Climate / Trunk / Port / Flash (trunk open
  two-tap). A `tyres:` config block is optional and the tyre labels render only
  if given.
- **Climate** — ecobee dial + headline; `rooms:` list (name → temperature
  sensor, optional humidity) drives the "room by room" list and its comparison
  headline; Austin Energy bill tile (cost to date vs forecast). The `rooms:`
  list is the extension point for Caleb's future sensors and the future floor
  plan.
- **Lights & fans** — headline (count + where), scene buttons (`scene.movie`,
  all on, all off for configured lights), lights grouped by `floors:` in config,
  fans/vanities as secondary toggles. Unavailable entities shown dimmed, not
  hidden.

### Behaviour rules

- Missing / `unavailable` / `unknown` entity → the element shows "—" or is
  omitted; headlines never assert a state they could not read.
- Sensitive actions (unlock, disarm, garage open, trunk open) require a second
  tap within 4 s; the button visibly changes to "Tap again to …".
- Garage close goes through `script.garage_close_safely`, not `cover.close_cover`.
- Times are relative ("4 min ago") and refresh each minute.

## Left to the builder

- Exact SVG artwork, spacing, and icon choice (follow the concept board).
- View type (masonry vs sections) as long as it reads as a single column on a
  phone.
- How headlines phrase edge cases, within the rules above.
- Test granularity beyond: every headline function has tests covering its
  branches, including missing data.

## Calls made without explicit sign-off (Caleb to check)

- Dashboard name "Stonebridge" and `stonebridge` URL path.
- `extra_module_url` instead of a Lovelace resource (needs one HA restart).
- Roomba battery hidden; `person.dherpin` excluded from "who's home".
- Climate shows ecobee + the two unnamed sensors only once Caleb names their
  rooms; until then the room list holds the ecobee alone.
- Energy bill tile lives on Climate.
- Floor assignment of lights is a first guess (bedrooms, master, office, guest
  bath, hallway upstairs; the rest downstairs) — one-line YAML fixes.
