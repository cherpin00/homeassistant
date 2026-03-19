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

## Working With This Repo

- **Validation**: No local validation tooling. Test changes by loading them in HA (Settings → YAML → Check Configuration, or restart HA).
- **Secrets**: Never commit `secrets.yaml`. Use `!secret key_name` references in config files.
- **Custom components**: Managed by HACS. Don't manually edit files under `custom_components/` — they get overwritten on updates.
