# Manual car precondition scheduling.
# Exposes:
#   pyscript.precondition_manual_schedule(delay_minutes=N)
#   pyscript.precondition_manual_cancel()          -- cancel all
#   pyscript.precondition_manual_cancel(schedule_id="abc123")  -- cancel one
# Polls every 30s; fires climate.turn_on with retries when due.
# Completely decoupled from the calendar-based tesla_precondition app.

import json
from datetime import datetime, timezone, timedelta
import file_io

CFG = pyscript.app_config
CLIMATE_ENTITY = CFG.get("climate_entity", "climate.caleb_s_model_y_climate")
NOTIFY_TARGET   = CFG.get("notify_target", "pixel_10")
MAX_RETRIES     = int(CFG.get("max_retries", 3))
RETRY_DELAY_SEC = int(CFG.get("retry_delay_sec", 15))
DATA_FILE       = "/config/pyscript/precondition_manual.json"


def _now():
    return datetime.now(timezone.utc)


def _read():
    text = file_io.read_text(DATA_FILE)
    if not text:
        return {"schedules": []}
    try:
        return json.loads(text)
    except Exception:
        return {"schedules": []}


def _write(data):
    file_io.write_text(DATA_FILE, json.dumps(data, indent=2))


def _new_id():
    return _now().strftime("%H%M%S%f")[:10]


def _update_sensor():
    data = _read()
    schedules = data.get("schedules", [])
    fire_times = [s["fire_at"] for s in schedules]
    state.set(
        "sensor.precond_manual_pending",
        value=len(schedules),
        new_attributes={
            "fire_times": fire_times,
            "friendly_name": "Precondition Pending",
            "icon": "mdi:car-clock",
            "unit_of_measurement": "scheduled",
        },
    )


@service
def precondition_manual_schedule(delay_minutes=None, **kwargs):
    if delay_minutes is None or int(delay_minutes) < 1:
        log.error("precondition_manual_schedule: delay_minutes is required")
        return {"error": "delay_minutes is required"}

    fire_at = _now() + timedelta(minutes=int(delay_minutes))
    schedule_id = _new_id()

    data = _read()
    data["schedules"].append({
        "id": schedule_id,
        "fire_at": fire_at.isoformat(),
        "created_at": _now().isoformat(),
    })
    _write(data)
    _update_sensor()

    service.call("counter", "increment", entity_id="counter.precond_scheduled")
    log.info(f"precondition_manual: scheduled {schedule_id} for {fire_at.isoformat()}")
    return {"schedule_id": schedule_id, "fire_at": fire_at.isoformat()}


@service
def precondition_manual_cancel(schedule_id=None, **kwargs):
    data = _read()
    before = len(data["schedules"])

    if schedule_id:
        data["schedules"] = [s for s in data["schedules"] if s["id"] != schedule_id]
    else:
        data["schedules"] = []

    removed = before - len(data["schedules"])
    _write(data)
    _update_sensor()

    if removed > 0:
        service.call("counter", "increment", entity_id="counter.precond_cancelled")
    log.info(f"precondition_manual: cancelled {removed} schedule(s)")
    return {"cancelled": removed}


@time_trigger("period(now, 30sec)")
def _tick():
    try:
        _check_schedules()
        _update_sensor()
    except Exception as e:
        log.error(f"precondition_manual tick error: {e}")


def _check_schedules():
    now = _now()
    data = _read()

    due   = [s for s in data["schedules"] if datetime.fromisoformat(s["fire_at"]).astimezone(timezone.utc) <= now]
    later = [s for s in data["schedules"] if datetime.fromisoformat(s["fire_at"]).astimezone(timezone.utc) >  now]

    if not due:
        return

    # Remove due entries before firing so a crash doesn't re-fire them
    data["schedules"] = later
    _write(data)

    for entry in due:
        _fire(entry)


def _fire(entry):
    success   = False
    last_err  = "Unknown error"
    attempt   = 0

    for attempt in range(1, MAX_RETRIES + 1):
        service.call("counter", "increment", entity_id="counter.precond_climate_call_total")
        try:
            service.call("climate", "turn_on", entity_id=CLIMATE_ENTITY, blocking=True)
            success = True
            break
        except Exception as e:
            last_err = str(e)
            log.warning(f"precondition_manual attempt {attempt}/{MAX_RETRIES} failed: {e}")
            if attempt < MAX_RETRIES:
                task.sleep(RETRY_DELAY_SEC)

    service.call("counter", "increment", entity_id="counter.precond_manual_fired")

    if success:
        service.call("counter", "increment", entity_id="counter.precond_success")
        service.call("notify", NOTIFY_TARGET,
                     title="Car is preconditioning",
                     message=f"Climate turned on (attempt {attempt} of {MAX_RETRIES})")
    else:
        service.call("counter", "increment", entity_id="counter.precond_failed")
        service.call("notify", NOTIFY_TARGET,
                     title="Precondition failed",
                     message=f"Failed after {MAX_RETRIES} attempts: {last_err}")


@time_trigger("startup")
def _on_start():
    data = _read()
    if "schedules" not in data:
        _write({"schedules": []})
        data = {"schedules": []}
    _update_sensor()
    log.info(f"precondition_manual started — {len(data['schedules'])} schedule(s) pending")
