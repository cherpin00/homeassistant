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

## Frigate Camera Notifications

`automations/frigate_notifications.yaml`, driven by the vendored SgtBatten
blueprint at `blueprints/automation/SgtBatten/frigate_notifications.yaml`
(v0.14.0.2y). Triggers off the `frigate/reviews` MQTT topic and sends one
actionable push per alert, with a thumbnail that updates in place as Frigate
captures a better frame.

**It notifies regardless of alarm state, deliberately.** It first shipped gated
on Alarmo being `disarmed`, reasoning that Stage 0/1/2 in
`automations/alarm_system.yaml` already cover the armed case. That was wrong in
practice: Alarmo sits at `armed_home` essentially permanently — one state change
in seven days, with `auto_disarm_when_phone_arrives` not having fired in over a
week — so the gated automation triggered and then silently suppressed itself
every time. **Check state history, not just automation logic, before scoping
anything to an alarm state.** Accepted trade-off: a genuine `armed_away` event
produces this push *and* Stage 0's AI push for the same person. To dial it back,
re-add `state_filter: true` listing both `armed_home` and `disarmed` — not
`disarmed` alone, which is the version that didn't work.

**This is the one notification path that does NOT go through `script.notify`,
by design.** The blueprint calls `notify.<service>` directly in ~10 places with
its own rich payload, and `script.notify` is a script rather than a notify
service, so the blueprint's `notify_group` input cannot target it. The
alternatives were owning a 2147-line fork of upstream forever, or
hand-rebuilding the blueprint against the router and losing the live-updating
thumbnail. The inconsistency was judged cheaper than either. Consequence: this
path reaches one device, and `notify_roster.yaml` does not apply to it — adding
Becca means building a notify group and repointing `notify_group`.


**Known duplication, unresolved.** This automation and `security_camera_coordinator`
now cover the same five outdoor cameras for the same object (person), so while
armed a single person produces two pushes. The coordinator's goes through
`script.notify` to `house_admins` (Caleb **and Becca**); this one goes only to
Caleb's phone. The open question is whether to fold the live-stream button into
`alarm_system.yaml`'s existing `push_data` — which `garage.yaml` already does for
its action buttons — and retire this automation entirely. A blueprint cannot be
embedded in an existing automation (it generates a whole automation, triggers
included), but the live-stream URL needs no Frigate event id, so folding it in is
a few lines. Only the *clip* link needs the event id that the MQTT payload carries.

Settings worth knowing before you change them:

| Setting | Value | Why not the default |
|---|---|---|
| `review_severity` | `[alert]` | Default is alerts **and** detections — a firehose across five cameras |
| `labels` | `[person]` | Measured over 24h: **103 alerts, 93 of them cars**, 85 on `front_left` alone (it watches the road). Zone filtering does not help — 83 car alerts were *inside* `front_left_property` — and would actively hurt, since `back_left`/`back_right` person events carry no zones (whole-frame `back_*_person_occupancy`). Object filter is the only discriminator that works. |
| `cooldown` | `120` (seconds) | Blueprint default is `0`, i.e. no rate limit at all |
| `base_url` | `https://ha.stone.herpin.xyz` | Optional per the blueprint, but **required** for Android to render thumbnails |

**Action Button 2 is "View Live", not the default "View Snapshot"** — the
notification already embeds the snapshot. It uses the blueprint's own "View
Stream" preset, HA's MJPEG proxy for whichever camera fired. Its `access_token`
is baked in at send time and HA rotates it every few minutes, so tapping a
notification older than ~5 minutes returns **403** (measured: fresh token 200,
20-minute-old token 403). Accepted — the button exists for acting in the moment.
The durable alternative, if this becomes annoying, is a Lovelace camera view
addressed by a **relative** path, which the Companion app opens in-session so
nothing can expire. Note the blueprint's "Open Frigate" presets
(`/ccab4aaf_frigate/dashboard`) are for the Frigate **add-on** and 404 here.

**`notify_device` must be a real device id, not the blueprint's default.** The
blueprint carries `device_id: !input notify_device` in the branch used when no
notify group is set. HA validates the *entire* automation at load, dead branches
included, so the input's `false` default fails with `Unknown device 'False'` and
the automation loads `unavailable`. Note `ha core check` passes anyway — only an
automation reload surfaces it. Delivery still goes via `notify_group`, so the id
is there purely to satisfy validation.

**The Frigate config entry URL must be `https://frigate.stone.herpin.xyz`, not
the raw IP.** HA's notification proxy verifies TLS and offers no way to turn that
off — the config entry's `validate_ssl: False` covers only the integration's own
API calls, *not* the proxy. Frigate serves `:8971` with a self-signed cert, so
while the integration looked perfectly healthy (cameras recording, events
flowing), every notification thumbnail and clip returned **502**:

    hass_web_proxy_lib: Reverse proxy error for /api/frigate/notifications/...
    Cannot connect to host 192.168.98.251:8971 ssl:True
    [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: self-signed certificate

Pointing the entry at the Coolify Traefik hostname gives a real Let's Encrypt
cert that verifies, with nothing disabled anywhere. Fixed 2026-09-10. The
trade-off accepted: the integration now depends on the Coolify host (192.168.98.70)
being up, where before it talked straight to the Frigate VM. Do **not** "fix" a
recurrence by setting `tls: enabled: false` in Frigate or by publishing Frigate's
unauthenticated port 5000 — both were considered and are strictly worse.

**Other dependencies that break it silently.** The integration's "unauthenticated
notification event proxy" must stay enabled or thumbnails and clips 401 (note:
**401**, as distinct from the 502 above — useful for telling the two apart). It is
not set explicitly; `options` is `{}` and it defaults to `True` in
`custom_components/frigate/views.py`. It also needs Frigate and HA on the same
MQTT broker; Frigate's `mqtt.host` points at this instance.

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
