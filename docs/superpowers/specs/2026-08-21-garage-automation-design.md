# Garage Automation Subsystem — Design

**Date:** 2026-08-21
**Status:** Approved for implementation
**Hardware:** ratgdo32 disco (ESPHome), device suffix `f9898c`

## Goals

1. Open the garage automatically when Caleb drives up.
2. Close the garage automatically when the Model Y pulls out.
3. Notify with an actionable button when the door is left open too long, and
   force-close it at night if it is still open.

## Constraints Discovered

These shaped the design and are recorded so future changes do not re-derive them.

**The Disco laser watches the bay, not the driveway.** With the door closed and
the Model Y parked, `sensor.ratgdo32disco_f9898c_vehicle_distance_actual_filtered`
reads 882 mm against a 1100 mm target and `_vehicle_detected` is `on`. That is a
ceiling-mounted time-of-flight sensor pointed down at the parking spot.
Therefore:

- `binary_sensor.ratgdo32disco_f9898c_vehicle_leaving` means "the car left the
  bay" — a reliable, local, instant auto-close trigger.
- `binary_sensor.ratgdo32disco_f9898c_vehicle_arriving` means "the car entered
  the bay" — useless for auto-open, because the door was already open.

**Presence sources are weak.** Auto-open must be driven by a geofence, and the
available trackers are poor:

| Entity | Accuracy | Observed update rate |
| --- | --- | --- |
| `device_tracker.caleb_s_model_y_location` (tesla_fleet) | 0 m | ~10 min poll — too slow to be useful |
| `device_tracker.pixel_10` | 12 m | ~1–5 min; flapped home→not_home→home between 16:14 and 17:12 on 08-20 |
| `device_tracker.pixel_10_pro` (Becca) | 100 m | too coarse; out of scope |

`device_tracker.pixel_10` is the only viable trigger. Its flapping is mitigated
with a `proximity` direction-of-travel guard and a cooldown, not eliminated.

**No behavioral history exists.** The ratgdo came online 2026-08-21 18:29 and was
test-cycled at 18:49–18:51. `_vehicle_arriving` and `_vehicle_leaving` have never
fired in the recorder. Every threshold below is a starting estimate, not a tuned
value.

**No garage camera exists.** LLM Vision is not part of this subsystem.

## Safety Position

Every guard in this design is advisory. The last line of defense is the opener's
own photo-eye beam, surfaced as `binary_sensor.ratgdo32disco_f9898c_obstruction`.

- No automation closes the door without first checking `_obstruction` is `off`.
- No automation closes the door sooner than the tunable clearance delay.
- Home Assistant is not treated as a safety system, and should not become one.

## Scope

In scope: Caleb (`device_tracker.pixel_10`) and the Model Y, one bay, one door.
Out of scope: Becca's arrivals, a second bay, Prometheus counters, camera/LLM
integration.

## Entities Used

Existing, verified present on the instance:

- `cover.ratgdo32disco_f9898c_door` — `device_class: garage`, `supported_features: 15`
- `binary_sensor.ratgdo32disco_f9898c_vehicle_leaving`
- `binary_sensor.ratgdo32disco_f9898c_vehicle_detected`
- `binary_sensor.ratgdo32disco_f9898c_obstruction`
- `device_tracker.pixel_10`
- `alarm_control_panel.alarmo`
- `notify.mobile_app_pixel_10`

Note: `CLAUDE.md` documents `notify.mobile_app_pixel_8_pro` as the push target.
That device is `unavailable` and every automation in the repo actually uses
`notify.mobile_app_pixel_10`. This design uses `pixel_10` and corrects `CLAUDE.md`.

## New Infrastructure

### No new zone

An earlier draft added a passive 350 m `zone.near_home` and used a `zone` trigger.
That was rejected for two reasons:

1. A **non-passive** zone inserts a `Near Home` state into the
   `person.cherpin` → `not_home` transition that `Secure House When Phone Leaves`
   (`automations.yaml:9`) depends on. It would still fire, but perturbing a
   working security automation to add a garage feature is a bad trade.
2. Whether a **passive** zone fires a `zone` trigger is version-dependent enough
   that it should not be load-bearing here.

Instead, auto-open triggers on the proximity **distance sensor** crossing a
threshold. This touches no person state, and — because `numeric_state` accepts an
entity reference for `below:` — makes the approach radius tunable from the UI,
which a zone radius is not.

### `configuration.yaml` addition

```yaml
proximity:
  home_approach:
    zone: home
    tracked_entities:
      - device_tracker.pixel_10
    tolerance: 50
    unit_of_measurement: m
```

**This requires a full HA restart.** Everything else in this design reloads live.

After restart, verify the generated entity IDs — the expected names are
`sensor.home_approach_pixel_10_distance` and
`sensor.home_approach_pixel_10_direction_of_travel`, but the proximity platform's
naming must be confirmed against the running instance before the auto-open
automation is trusted. If they differ, update automation 1 accordingly. Both
names are now load-bearing: the distance sensor is the trigger, not just a guard.

`direction_of_travel` values are `towards`, `away_from`, `stationary`, `arrived`,
`unknown`. The auto-open guard accepts only `towards` and `arrived`.

### `input_numbers.yaml` additions

```yaml
garage_auto_close_delay_seconds:
  name: Garage Auto Close Delay (Seconds)
  min: 5
  max: 120
  step: 5
  mode: box
  unit_of_measurement: s
  initial: 25

garage_open_alert_minutes:
  name: Garage Left Open Alert (Minutes)
  min: 1
  max: 120
  step: 1
  mode: box
  unit_of_measurement: min
  initial: 15

garage_reminder_interval_minutes:
  name: Garage Reminder Interval (Minutes)
  min: 5
  max: 120
  step: 5
  mode: box
  unit_of_measurement: min
  initial: 15

garage_auto_open_cooldown_minutes:
  name: Garage Auto Open Cooldown (Minutes)
  min: 1
  max: 60
  step: 1
  mode: box
  unit_of_measurement: min
  initial: 10

# Approach radius for auto-open. Referenced directly by the numeric_state
# trigger's `below:`, so changing it here retunes auto-open with no restart
# and no file edit. 350 m gives ~26 s of warning at 30 mph against a 10.3 s
# door-open time.
garage_approach_distance_m:
  name: Garage Approach Distance (Meters)
  min: 100
  max: 1500
  step: 50
  mode: box
  unit_of_measurement: m
  initial: 350

garage_night_close_hour:
  name: Garage Night Force Close Hour
  min: 0
  max: 23
  step: 1
  mode: box
  unit_of_measurement: h
  initial: 23
```

### `input_booleans.yaml` additions

```yaml
garage_auto_open_enabled:
  name: Garage Auto Open Enabled
  icon: mdi:garage-open-variant
  initial: true

garage_auto_close_enabled:
  name: Garage Auto Close Enabled
  icon: mdi:garage-variant
  initial: true
```

## Shared Script

`script.garage_close_safely` in `scripts.yaml`. Three automations call it, so the
guard logic lives in exactly one place.

Behavior:

1. If `_obstruction` is `on`, push an "obstruction detected, not closing" notice
   and stop.
2. If the door is already `closed`, stop silently.
3. `cover.close_cover` on `cover.ratgdo32disco_f9898c_door`.
4. `wait_template` for state `closed`, timeout 30 s (closing duration is 14 s).
5. If the wait timed out, push a "garage failed to close" warning tagged
   `garage_fault`.

Accepts an optional `reason` field used in the failure notification text.

`mode: single`.

## Automations (`automations/garage.yaml`, new file)

All follow the `alarm_system.yaml` idiom: read tunables into `variables` at
trigger time so a mid-run change to an `input_number` cannot produce an
inconsistent pass.

### 1. Garage — Auto Open on Approach

- **Trigger:** `numeric_state` on `sensor.home_approach_pixel_10_distance`,
  `below: input_number.garage_approach_distance_m`. Fires only on the downward
  crossing, so it will not re-fire while you remain inside the radius — the
  hysteresis a zone trigger would have given, without the zone.
- **Conditions (all required):**
  - `input_boolean.garage_auto_open_enabled` is `on`
  - `cover.ratgdo32disco_f9898c_door` is `closed`
  - `binary_sensor.ratgdo32disco_f9898c_vehicle_detected` is `off` — if the Model
    Y is already in the bay, the arrival is on foot or in another vehicle; do not
    open
  - `sensor.home_approach_pixel_10_direction_of_travel` is `towards` or `arrived`
  - `state_attr('device_tracker.pixel_10', 'gps_accuracy') | float(999) < 100`
    — read from the tracker directly, since `trigger.to_state` here is the
    proximity sensor, which carries no accuracy attribute
- **Actions:** `cover.open_cover`; push "Garage opening — welcome home" tagged
  `garage_auto_open`; then `delay` of `garage_auto_open_cooldown_minutes`.
- **Mode:** `single`. The trailing delay holds the run open so re-triggers from
  GPS flapping are dropped — the same cooldown mechanism as
  `security_alert_cooldown_minutes`.

### 2. Garage — Auto Close on Departure

- **Trigger:** `binary_sensor.ratgdo32disco_f9898c_vehicle_leaving` → `on`.
- **Conditions:** `input_boolean.garage_auto_close_enabled` is `on`; door is not
  `closed`.
- **Actions:**
  1. `delay` of `garage_auto_close_delay_seconds` (25 s) so the car clears the apron.
  2. Re-check, and abort if any fails: `_obstruction` is `off`,
     `_vehicle_detected` is `off` (the car did not pull back in), door is still
     not `closed`.
  3. Call `script.garage_close_safely` with `reason: "auto-close after departure"`.
  4. Push "Garage closed behind you" tagged `garage_auto_close` — **only if the
     door is actually `closed`** after the script returns. The script owns the
     obstruction-abort and close-failure notifications; automation 2 must not
     claim success on top of them.
- **Mode:** `single`.

### 3. Garage — Left Open Alert

- **Trigger:** `cover.ratgdo32disco_f9898c_door` → `open`.
- **Mode:** `restart` — a fresh open restarts the clock rather than being dropped.
- **Actions:**
  1. `delay` of `garage_open_alert_minutes`.
  2. `repeat` `while` the door is not `closed`:
     - Push, tagged `garage_open`, with actions
       `GARAGE_CLOSE` ("Close Now") and `GARAGE_SNOOZE` ("Snooze 30m").
     - `wait_for_trigger` on event `mobile_app_notification_action` with
       `action: GARAGE_SNOOZE`, timeout `garage_reminder_interval_minutes`.
     - If the wait completed (snooze tapped), `delay: 30 minutes`.
       Otherwise loop immediately and re-notify.

  The 30-minute snooze is deliberately hardcoded rather than a helper, so it
  cannot drift out of sync with the "Snooze 30m" button label.
  3. After the loop exits (door closed), clear the `garage_open` notification via
     `message: clear_notification`.

No snooze helper entity is needed; `wait_for_trigger` carries the state.

### 4. Garage — Night Force Close

- **Triggers:**
  - `time_pattern` at `hours: "/1", minutes: 0, seconds: 0`, gated by a condition
    that `now().hour == states('input_number.garage_night_close_hour') | int(23)`.
    A `time_pattern` plus condition is used rather than a fixed `time` trigger so
    the hour stays tunable from the UI without a reload.
  - `alarm_control_panel.alarmo` → `armed_away`.
- **Condition:** door is not `closed`.
- **Actions:**
  1. Push "Garage still open — closing in 2 minutes" tagged `garage_night_close`,
     with action `GARAGE_CANCEL_CLOSE` ("Cancel").
  2. `wait_for_trigger` on `mobile_app_notification_action` with
     `action: GARAGE_CANCEL_CLOSE`, timeout 2 minutes.
  3. If cancelled, push "Night close cancelled" and stop.
  4. Otherwise call `script.garage_close_safely` with
     `reason: "night force-close"`.
- **Mode:** `single`.

### 5. Garage — Notification Action Handler

- **Trigger:** event `mobile_app_notification_action`, `action: GARAGE_CLOSE`.
- **Action:** call `script.garage_close_safely` with
  `reason: "closed from notification"`.
- **Mode:** `single`.

Kept as its own automation so the button still works after the alert loop in
automation 3 has exited or been restarted.

## Files Touched

| File | Change |
| --- | --- |
| `configuration.yaml` | add `proximity:` block |
| `input_numbers.yaml` | add 6 helpers |
| `input_booleans.yaml` | add 2 helpers |
| `scripts.yaml` | add `garage_close_safely` |
| `automations/garage.yaml` | new — 5 automations |
| `CLAUDE.md` | document the garage subsystem; correct the notify target |

## Testing Plan

No local validation tooling exists, so verification happens against the running
instance.

1. **Config check** — Settings → YAML → Check Configuration before restarting.
2. **Restart** — required for `proximity:`.
3. **Verify proximity entity IDs** — confirm the generated `distance` and
   `direction_of_travel` sensor names match what automation 1 references, and
   that the distance sensor reports plausible meters. This is the single most
   likely point of failure, and the distance sensor is now the trigger itself.
4. **`script.garage_close_safely`** — run directly with the door open. Confirm it
   closes and does not fire the fault notification. Run again with the door
   already closed; confirm it exits silently.
5. **Automation 3 (left-open alert)** — set `garage_open_alert_minutes` to 1,
   open the door, confirm the push arrives with both buttons. Tap Snooze, confirm
   no reminder for 30 minutes. Reopen, tap Close Now, confirm the door closes.
6. **Automation 5** — verified implicitly by step 5's Close Now tap.
7. **Automation 4** — set `garage_night_close_hour` to the next hour, leave the
   door open, confirm the warning push and the cancel path, then the close path.
8. **Automation 2 (auto-close)** — requires physically driving the car out of the
   bay. Until then, verify by manually toggling the trigger condition in
   Developer Tools → States is *not* reliable for ESPHome entities; the honest
   test is a real departure. Check the trace afterward.
9. **Automation 1 (auto-open)** — requires a real arrival. Expect to tune the
   350 m radius after roughly a week of arrivals.

## Known Risks

- **The 350 m radius is a guess.** Too large and the door opens when driving past
  on a nearby road; too small and it opens too late. Mitigated by making it
  `input_number.garage_approach_distance_m`, tunable from the UI with no reload.
- **GPS flapping may still cause false opens.** The direction-of-travel guard,
  the `_vehicle_detected` guard, and the 10-minute cooldown are three independent
  mitigations, but none is airtight.
- **`_vehicle_leaving` behavior is unverified.** It has never fired in recorded
  history. If it proves noisy or fails to fire, automation 2 needs rework —
  possibly falling back to `_vehicle_detected` transitioning `on` → `off`.
- **A restart is required**, which briefly interrupts the security automations.
- **Proximity updates only as fast as `device_tracker.pixel_10` does** (~1–5 min
  observed). The distance-sensor trigger inherits that latency exactly as a zone
  trigger would; switching away from a zone does not improve it.

## Out of Scope

- Becca's arrivals and any second bay or door.
- Prometheus counters for garage events.
- Camera or LLM Vision integration.
- Re-aiming the Disco laser outward to make `_vehicle_arriving` usable for
  auto-open. Recorded here as the option that would most improve auto-open
  reliability if the geofence approach disappoints.
