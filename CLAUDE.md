# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Home Assistant configuration repository for a single instance running at `ha.herpin.xyz` (internal: `192.168.72.110:8123`). Behind a reverse proxy with trusted proxies on `192.168.72.0/24`. No build system or tests — this is pure YAML/config that gets loaded directly by Home Assistant.

## Repository Structure

- `configuration.yaml` — Main HA config. Uses `!include` directives to split config across files.
- `automations.yaml` — All automations (HA UI-managed format with numeric string IDs).
- `scripts.yaml` — Named scripts (key-based format, not list-based).
- `scenes.yaml` — Scene definitions (currently empty).
- `blueprints/` — Reusable automation/script templates (standard HA blueprints).
- `custom_components/` — HACS-managed integrations: **alarmo** (alarm panel), **hacs** (community store), **llmvision** (LLM-based camera image analysis).
- `secrets.yaml` — Gitignored. Referenced via `!secret` in YAML files.

## Key Conventions

**Automations format**: `automations.yaml` uses the HA UI list format — each automation is a list item with a numeric `id` field. YAML anchors (`&id001` / `*id001`) are used to duplicate the LLM Vision automation across multiple camera triggers. When editing, preserve the anchor/alias structure.

**Scripts format**: `scripts.yaml` uses the manual/named format — each script is a top-level key (e.g., `test_person_registry_read:`), not a list item.

**Entity naming**: Entity IDs follow HA conventions (`binary_sensor.living_room_person`, `input_text.llm_last_event`, `camera.living_room_fluent_lens_1`). Use `entity_id` in triggers/actions, not `device_id`.

**Notify targets**: Push notifications go to `notify.mobile_app_pixel_10`. (The Pixel 8 Pro was retired; its entity is `unavailable`.)

## Core Automation: LLM Vision Smart Motion Analyzer

The most complex automation captures camera frames on motion detection, runs LLM Vision analysis, and sends AI-summarized notifications. Key details:

- Triggered by person/vehicle/animal binary sensors on the living room camera
- Frame count and capture duration controlled by `input_number` helpers (`llm_vision_max_frames`, `llm_vision_capture_duration_sec`)
- Frames saved to `/media/llmvision/events/`
- Optional person recognition system using `input_text` helpers as a JSON data store (`person_registry_metadata`, `person_<id>_data`)
- Results persisted to `input_text` helpers and sent via persistent notification + mobile push
- Runs in `single` mode (drops new triggers while running)

## Security System & Tiered Alarms

The security logic is structured into distinct escalation tiers inside `automations/alarm_system.yaml` and relies on custom virtual sensors in `templates.yaml`.

- **Smart Person Sensors**: To handle integration failures, all camera automations trigger off custom virtual sensors (`binary_sensor.*_smart_person`). These natively check Frigate's `property_person_occupancy` zones first, and gracefully fallback to raw Reolink `person` sensors if Frigate is `unavailable`.
- **Manual Override**: The `input_boolean.prefer_frigate_sensors` toggle can force the system to exclusively use Reolink if turned `off` (useful for split-brain/frozen integrations).
- **Debounce Logic**: The virtual sensors use a global `input_number.security_sensor_debounce_seconds` (default 10s) via `delay_off` to bridge hardware sensor flickering and allow continuous 15s/60s timers to complete.
- **Escalation Tiers**:
  - **Stage 0 (Immediate Awareness)**: Only triggers on `armed_away`. Instantly takes a snapshot from the `_fluent` substream, generates an AI summary, and sends an email + push notification.
  - **Stage 1 (Linger Alert)**: Triggers on `armed_home` OR `armed_away`. Requires 15s continuous occupancy. Captures a snapshot, fires a rich push notification, and plays an Alexa announcement inside the house. (AI is skipped for speed).
  - **Stage 2 (Alarm Trigger)**: Triggers on `armed_home` OR `armed_away`. Requires 60s continuous occupancy. Flips the `input_boolean.master_siren_toggle` to trigger hardware sirens.
- **Nighttime Arming**: 
  - `Auto Disarm` instantly disarms when the Pixel 8 Pro arrives home.
  - `Auto Arm Home at Night` automatically arms the perimeter at 10 PM. If you arrive home late, it disarms, waits a 15-minute grace period (for groceries/settling), and then auto-arms the house for the night.
- **Workflow / Reloading**: Changes to `templates.yaml`, `input_booleans.yaml`, or automations can be reloaded instantly via the HA Developer Tools. Changes to core setups (like the `notify.email_alert` SMTP in `configuration.yaml`) require a full HA system restart.
## Garage (ratgdo32 disco)

Device suffix `f9898c`. Lives in `automations/garage.yaml` plus
`script.garage_close_safely` in `scripts.yaml`.

**The laser points at the bay, not the driveway** — and it is unreliable in
both directions. The Disco's time-of-flight sensor is aimed down at the
parking spot, so:

- `binary_sensor.ratgdo32disco_f9898c_vehicle_arriving` = the car is *already
  inside*. Useless for auto-open. Do not wire auto-open to it.
- `binary_sensor.ratgdo32disco_f9898c_vehicle_leaving` = the car left the bay.
  It reads correctly in principle but misfires often enough in practice that
  auto-close was moved off it. Do not wire auto-close back to it.
- `binary_sensor.ratgdo32disco_f9898c_vehicle_detected` is still consulted, but
  only as an advisory "is the bay occupied" hint on auto-open.

**Both directions therefore run off a phone geofence.** A `proximity` config entry
titled "Home" tracks `device_tracker.pixel_10` against `zone.home` and produces
`sensor.home_pixel_10_distance` and `sensor.home_pixel_10_direction_of_travel`.
The distance sensor reports **feet**, not meters — this instance is on imperial.
`input_number.garage_approach_distance_ft` (default 1150 ft ~ 350 m) is read
directly by the trigger's `below:`, so the radius is tunable from the UI.

**Auto-close mirrors it.** Primary trigger is a `zone` leave on
`person.cherpin` / `zone.home` (a first-class push from the companion app, so
it lands promptly); the backstop is `sensor.home_pixel_10_distance` rising
above `input_number.garage_departure_distance_ft` (default 750 ft) for the
times the phone skips the zone-exit event. Departure radius is kept **below**
the approach radius so jitter around one threshold can never reach the other.

Guards on auto-close: enable toggle, door not closed, `person.cherpin` not
home, direction of travel not `towards`, and the same `gps_accuracy < 100`
sentinel check. There is deliberately **no** `_vehicle_detected` guard — the
trigger means "nobody is home", so a car in the bay is a reason to close, not
to abort.

Proximity was created via its **config flow**, not YAML, so it needs no restart
and is not in this repo. Recreate it with
`POST /api/config/config_entries/flow` handler `proximity` if it is ever lost.

**Guards on auto-open** (all must pass): enable toggle, door closed,
`_vehicle_detected` off (car already parked = arriving on foot), direction of
travel `towards`/`arrived`, and `gps_accuracy < 100` — 100.0 is the sentinel the
phone reports on a bad indoor fix.

**Safety**: every guard is advisory. The real protection is the opener's
photo-eye beam, surfaced as `_obstruction`, which `script.garage_close_safely`
checks before moving the door and which the auto-close path re-checks after its
clearance delay. Nothing here should be treated as a safety interlock.

**Notification actions**: `GARAGE_CLOSE`, `GARAGE_SNOOZE`, `GARAGE_CANCEL_CLOSE`
are handled by event triggers on `mobile_app_notification_action`.

## Working With This Repo

- **Validation**: No local validation tooling. Test changes by loading them in HA (Settings → YAML → Check Configuration, or restart HA).
- **Secrets**: Never commit `secrets.yaml`. Use `!secret key_name` references in config files.
- **Custom components**: Managed by HACS. Don't manually edit files under `custom_components/` — they get overwritten on updates.

## Pyscript Apps (`pyscript/apps/`)

Pyscript runs in an async event loop. Key gotchas:

**File I/O must use `file_io` module** — raw `open()` silently fails on the event loop:
```python
import file_io  # /config/pyscript/modules/file_io.py
text = file_io.read_text("/config/pyscript/myapp.json")   # blocks correctly in executor
file_io.write_text("/config/pyscript/myapp.json", text)   # atomic write via .tmp
```
`@pyscript_compile` / `@pyscript_executor` decorators only work in modules (not apps) — that's why `file_io.py` is a module.

**Current apps:**
- `apps/precondition_manual.py` — manual Tesla precondition scheduling; uses `file_io` for its JSON store at `pyscript/precondition_manual.json`
- `apps/tesla_precondition.py` — calendar-based scheduling (dry_run: true); uses `tesla_precondition/persist.py` for file I/O

**Reload without restart:** `hass.services.call("pyscript", "reload")` or via HA Developer Tools → Services.
