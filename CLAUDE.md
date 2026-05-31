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

**Notify targets**: Push notifications go to `notify.mobile_app_pixel_8_pro`.

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
## Working With This Repo

- **Validation**: No local validation tooling. Test changes by loading them in HA (Settings → YAML → Check Configuration, or restart HA).
- **Secrets**: Never commit `secrets.yaml`. Use `!secret key_name` references in config files.
- **Custom components**: Managed by HACS. Don't manually edit files under `custom_components/` — they get overwritten on updates.
