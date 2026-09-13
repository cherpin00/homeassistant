# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Home Assistant configuration repository for a single instance running at `ha.stone.herpin.xyz` (internal: `192.168.98.99:8123`). Behind a reverse proxy with trusted proxies on `192.168.98.0/24`. No build system or tests — this is pure YAML/config that gets loaded directly by Home Assistant.

## Repository Structure

- `configuration.yaml` — Main HA config. Uses `!include` directives to split config across files.
- `automations.yaml` — All automations (HA UI-managed format with numeric string IDs).
- `scripts.yaml` — Named scripts (key-based format, not list-based).
- `scenes.yaml` — Scene definitions (currently empty).
- `blueprints/` — Reusable automation/script templates (standard HA blueprints).
- `custom_components/` — HACS-managed integrations: **alarmo** (alarm panel), **hacs** (community store), **llmvision** (LLM-based camera image analysis).
- `secrets.yaml` — Gitignored. Referenced via `!secret` in YAML files.

## Key Conventions

**Automations format**: `automations.yaml` uses the HA UI list format — each automation is a list item with an `id` field (UI-created ones get a numeric string; hand-written ones in `automations/` use readable snake_case). Files under `automations/` are merged in by `!include_dir_merge_list`, so a new subsystem is a new file, not an edit to `automations.yaml`. There are **no YAML anchors** in this config; an earlier version of this file claimed the LLM Vision automation was fanned out across cameras with `&id001`/`*id001`, and that was never true.

**Scripts format**: `scripts.yaml` uses the manual/named format — each script is a top-level key (e.g., `test_person_registry_read:`), not a list item.

**Entity naming**: Entity IDs follow HA conventions (`binary_sensor.living_room_person`, `input_text.llm_last_event`, `camera.living_room_fluent_lens_1`). Use `entity_id` in triggers/actions, not `device_id`.

**Notify targets**: Push notifications go to `notify.mobile_app_pixel_10`. (The Pixel 8 Pro was retired; its entity is `unavailable`.)

## Core Automation: LLM Vision Smart Motion Analyzer

The most complex automation captures camera frames on motion detection, runs LLM Vision analysis, and sends AI-summarized notifications. Key details:

- Triggered by `binary_sensor.living_room_person` / `_vehicle` / `_animal`, and
  analyses `camera.living_room_fluent_lens_1`. **Those are the BACK-LEFT OUTDOOR
  camera, not an indoor one** — the Reolink TrackMix at 192.168.98.53 was renamed
  "Back Left" in HA but its entity_ids were never migrated, so all of its
  entities are still named `living_room_*`. It therefore overlaps the Security
  Camera Coordinator, which covers the same camera via
  `binary_sensor.back_left_smart_person`. What this automation adds over the
  Coordinator is vehicles and animals (the Coordinator is person-only), running
  unconditionally rather than only while armed, person recognition, and
  triggering off Reolink rather than Frigate.
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

**The laser points at the bay, not the driveway.** The Disco's time-of-flight
sensor is aimed down at the parking spot, so:

- `binary_sensor.ratgdo32disco_f9898c_vehicle_leaving` = the car left the bay.
  This is the auto-close trigger — local, instant, no cloud.
- `binary_sensor.ratgdo32disco_f9898c_vehicle_arriving` = the car is *already
  inside*. Useless for auto-open. Do not wire auto-open to it.

**Auto-open therefore runs off a phone geofence.** A `proximity` config entry
titled "Home" tracks `device_tracker.pixel_10` against `zone.home` and produces
`sensor.home_pixel_10_distance` and `sensor.home_pixel_10_direction_of_travel`.
The distance sensor reports **feet**, not meters — this instance is on imperial.
`input_number.garage_approach_distance_ft` (default 1150 ft ~ 350 m) is read
directly by the trigger's `below:`, so the radius is tunable from the UI.

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

## Frigate: facts that cost time to rediscover

- **`sensor.<cam>_review_status` vs `binary_sensor.<cam>_*_occupancy`.** Occupancy
  is Frigate's **live tracking** — it flips for objects Frigate is merely
  evaluating, including ones it later discards as false positives, which leave
  **no event, no clip and no row in `frigate.db`**. `review_status` is the
  committed review layer. If HA reacts to something and Frigate's UI shows
  nothing, this is why; check `frigate.db` directly before theorising.
- **Per-camera person thresholds matter.** `front_right` is set to `0.78`;
  `front_left` uses Frigate's default `0.7` and produces ~2.5x the occupancy
  flips. Zone filtering does **not** substitute — 83 of 93 car alerts on
  `front_left` were *inside* `front_left_property` — and a zone filter would
  break the back cameras, which report whole-frame occupancy with no zones.
- **Frigate 0.17 moved the score.** Top-level `top_score` in `/api/events` is
  `null`; the real values are `data.score` and `data.top_score`. Reading the old
  field makes every event look like `score=0` and invites a completely wrong
  root cause.
- **`/api/events` hides false positives.** Query `frigate.db` when you need to
  know whether an object existed at all.
- **The HA integration URL must be `https://frigate.stone.herpin.xyz`.** See the
  TLS note under Camera Notifications' history — the notification proxy verifies
  certificates and ignores `validate_ssl`.

## Camera Notifications

All camera notifications come from `security_camera_coordinator` in
`automations/alarm_system.yaml`, routed through `script.notify` to the
`house_admins` audience. There is deliberately **no second notification path**.

**Every tier carries a "View Live" action button** pointing at **Frigate's own
live view** (`https://frigate.stone.herpin.xyz/live`), alongside the snapshot
image the notifications already had.

**Do not point notification buttons at HA `/api/` URLs.** A
`/api/camera_proxy_stream/<cam>?token=<access_token>` link looks correct and
returns **200 from curl**, but returns **401 in the Companion app**: the app
opens it in its authenticated webview and attaches its own `Authorization`
header, and HA rejects that before ever considering the `?token=` param. Testing
from a shell will tell you it works. It does not. (Diagnosed 2026-09-13 after
three failed variants; `action: URI` itself is fine — a `/lovelace` button
proved that.) Linking to Frigate also sidesteps HA's camera `access_token`,
which rotates every few minutes and silently killed older notifications.

**Frigate auth stays enabled.** Its `session_length` is set to 30 days in
Frigate's own `config.yml`, so tapping a link is a monthly login rather than a
per-tap one. This was chosen deliberately over publishing Frigate's
unauthenticated port 5000, which would let any device on the LAN view every
camera and recording with no credentials.

Per-camera deep-linking was not confirmed for Frigate 0.17 — only `/live` (the
all-cameras dashboard) is verified. If a per-camera route exists, swapping the
three `uri:` values is a one-line change each.

**Notifications only fire while armed**, by design — every tier gates on Alarmo.
Disarmed means no camera notifications at all. That is intentional (decided
2026-09-12): security alerts when the system is disarmed are noise.

### Retired: the SgtBatten Frigate blueprint

A blueprint-driven automation (`automations/frigate_notifications.yaml` plus a
2147-line vendored blueprint) briefly ran alongside the above, triggering off the
`frigate/reviews` MQTT topic. It was removed 2026-09-12. Do not reintroduce it
without reading why:

- It was justified by a premise that turned out to be false — that the cameras
  were silent while disarmed and that this was a gap worth filling. Disarmed
  silence is the desired behaviour.
- It duplicated the Coordinator across the same five cameras, so an armed person
  produced two pushes, and it **bypassed `script.notify`** entirely, so Becca
  never received any of it.
- It was noisy: 103 notifications in 24h, 93 of them cars, before an object
  filter cut it to ~10/day.
- A blueprint cannot be embedded in an existing automation — it *generates* one,
  triggers included. That is why it had to be a separate automation, and why the
  live-stream button was folded into `alarm_system.yaml` instead: that URL needs
  no Frigate event id. Only a *clip* link needs the event id the MQTT payload
  carries, which is the one capability lost in the retirement.

## Working With This Repo

### Deploy loop

Edit locally → commit → push → pull on the box → reload. **Do not scp into
`/config`** — the SSH add-on logs you in as `cherpin` (uid 1000) and
`/homeassistant` is root-owned, so a bare write fails. (`cherpin` does have
`sudo`, but git is the sane path.)

```sh
git push origin master
bash -ic 'hapull'      # function at ~/.bashrc:152 on cap2
```

`hapull` is `ssh 100.78.91.60 "sudo git -C /homeassistant pull --ff-only"`. Note
**non-interactive bash does not source `.bashrc`**, so `bash -lc 'type hapull'`
reports it missing — use `bash -ic`. A cron also pulls every 5 min, but it does
**not** reload HA, so config lands on disk and sits inert until you reload.

### The `ha` CLI needs a LOGIN shell

```sh
ssh host 'ha core check'                     # unauthorized: missing API token
ssh -tt host "bash -l -c 'ha core check'"    # works
```

`$SUPERVISOR_TOKEN` is only exported by the login profile. Do not conclude from
the bare form that the add-on withholds it from non-root users — it withholds it
from non-login shells. With it you also get the supervisor proxy:

```sh
curl -H "Authorization: Bearer $SUPERVISOR_TOKEN" http://supervisor/core/api/states
curl -X POST -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
     http://supervisor/core/api/services/automation/reload   # or template/reload
```

Reloading beats restarting: `automation/reload` re-reads `!include_dir_merge_list
automations/`, `template/reload` re-reads `templates.yaml`. Neither bounces
Alarmo or the pyscript apps.

### Validation — and where it lies to you

- **`ha core check` is necessary but NOT sufficient.** It passes on a
  blueprint-based automation that then loads `unavailable` (e.g. an unset
  `notify_device` rendering as `device_id: False`). **Always re-check the
  entity's state after reloading**, not just the config check:
  `curl .../core/api/states/automation.<name>` — look for `on`, not `unavailable`.
- **Unit-test Jinja before shipping** by POSTing to `/core/api/template` with
  literal values substituted for `states(...)` calls. This catches logic errors
  that YAML parsing cannot, and it is fast enough to test every branch.
- **`#` inside a YAML block scalar is NOT a comment.** In `state: >`, a `#` line
  renders into the template output and corrupts the entity's value. Put such
  comments above the list item instead.
- **History API timestamps are read as LOCAL time.** A naive
  `2026-09-12T13:41:19` resolves to the future and silently returns `[]`. Append
  a URL-encoded offset: `...T13:41:19%2B00:00`.

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
