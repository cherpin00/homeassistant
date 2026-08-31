from tesla_precondition.config import load_config
import tesla_precondition.core as core
import tesla_precondition.serde as serde
import tesla_precondition.persist as persist
import tesla_precondition.geo as geo
from datetime import datetime, timezone, timedelta as _td
CFG = load_config(pyscript.app_config)   # pyscript injects app_config
DATA_DIR = "/config/pyscript"
MEM_PATH = f"{DATA_DIR}/memory.json"
SCHED_PATH = f"{DATA_DIR}/schedule.json"
NEAR_MIN = 240              # only price outbound travel within this many min of event start
TRAVEL_REFRESH_MIN = 10     # reuse a cached travel estimate for this long

def _now():
    return datetime.now(timezone.utc)

def _num(entity_id):
    if not entity_id:
        return None
    try:
        return float(state.get(entity_id))
    except (TypeError, ValueError):
        return None

def _is_moving():
    spd = CFG.get("speed_sensor")
    if not spd:
        return False
    return state.get(CFG["car_tracker"]) == "not_home" and _num(spd) not in (None, 0)

def _entity_updated(entity_id):
    # hass.states.get(...).last_updated is a tz-aware (UTC) datetime.
    # Requires `hass_is_global: true` in the pyscript config (see SETUP.md).
    obj = hass.states.get(entity_id)
    return obj.last_updated if obj is not None else None

def _tracker_latlon_updated(entity_id):
    attrs = state.getattr(entity_id) or {}
    return attrs.get("latitude"), attrs.get("longitude"), _entity_updated(entity_id)

def _read_car_state(now):
    car_lat, car_lon, car_upd = _tracker_latlon_updated(CFG["car_tracker"])
    ph_lat, ph_lon, ph_upd = _tracker_latlon_updated(CFG["phone_tracker"])
    return {
        "soc_pct": _num(CFG["soc_sensor"]),
        "cabin_f": _num(CFG["cabin_temp_sensor"]),
        "outside_f": _num(CFG["outside_temp_sensor"]),
        "car_lat": car_lat, "car_lon": car_lon, "car_updated": car_upd,
        "phone_lat": ph_lat, "phone_lon": ph_lon, "phone_updated": ph_upd,
        "is_moving": _is_moving(),
        "is_conditioning": state.get(CFG["climate_entity"]) not in ("off", "unavailable", "unknown", None),
    }

def _home_latlon():
    attrs = state.getattr(CFG.get("home_zone", "zone.home")) or {}
    return attrs.get("latitude"), attrs.get("longitude")

def _car_away_from_home(car):
    # Return-trip proxy for "you drove somewhere": the car is with you (co-location is
    # checked in the guardrail gate) AND not sitting at home. Fail-safe: if we can't
    # locate home or the car, don't fire the return trip.
    hlat, hlon = _home_latlon()
    if hlat is None or car.get("car_lat") is None:
        return False
    return not geo.co_located(car["car_lat"], car["car_lon"], hlat, hlon,
                              CFG["colocation_radius_m"])

def get_travel_min(origin_latlon, dest_address):
    if None in origin_latlon:
        return None
    origin = f"{origin_latlon[0]},{origin_latlon[1]}"
    provider = CFG["travel_provider"]
    try:
        extra = {"region": CFG["waze_region"]} if provider == "waze" else {}
        resp = service.call(
            provider + "_travel_time", "get_travel_times",
            origin=origin, destination=dest_address,
            return_response=True, blocking=True,
            **extra,
        )
        routes = resp.get("routes") or []
        if not routes:
            return None
        return float(routes[0]["duration"])
    except Exception as e:
        log.warning(f"travel_time failed: {e}")
        _inc("counter.tesla_error_travel")
        return None

def ask_location(key, event_title, event_id):
    service.call("script", "notify",
        audience=CFG.get("notify_audience", "caleb"),
        severity="warn", category="vehicle", tag_suffix=f"ask_{key}",
        title="🚗 Where is this?",
        message=f"Couldn't locate '{event_title}'.",
        # Android splits the action row evenly across three buttons, so each label
        # gets ~10-11 chars before it is ellipsized. Keep them short.
        push_data={"actions": [
            {"action": f"PRECOND_ANYWAY::{event_id}", "title": "Climate on"},
            {"action": f"PRECOND_SKIP::{key}", "title": "Skip"},
            {"action": f"PRECOND_ADDR::{key}", "title": "Address",
             "behavior": "textInput", "textInputPlaceholder": "Address"},
        ]})

@event_trigger("mobile_app_notification_action")
def on_action(**kwargs):
    action = kwargs.get("action", "")
    if action.startswith("PRECOND_ANYWAY::"):
        # Design: precondition this event at a fixed lead (no travel/location).
        # Record a force flag; the loop fires it at fixed-lead time.
        event_id = action.split("::", 1)[1]
        sched = serde.loads_schedule(persist.read_text(SCHED_PATH))
        sched["pending"].setdefault(f"{event_id}::outbound", {})["force"] = True
        persist.write_text(SCHED_PATH, serde.dumps_schedule(sched))
        return
    if action.startswith("PRECOND_STOP::"):
        # Sent on the fire notification: "I'm not actually going, turn it back off."
        # The job is already in `fired`, so this direction will not re-fire. The
        # return leg stays gated on the car being away from home, which it will not
        # be if the trip never happened.
        if CFG["dry_run"]:
            log.info(f"[dry_run] STOP {action.split('::', 1)[1]}")
            return
        try:
            service.call("climate", "turn_off", entity_id=CFG["climate_entity"], blocking=True)
            log.info(f"STOPPED preconditioning ({action.split('::', 1)[1]})")
        except Exception as e:
            log.error(f"climate turn_off failed: {e}")
            _inc("counter.tesla_error_tesla_command")
            service.call("script", "notify",
                         audience=CFG.get("notify_audience", "caleb"),
                         severity="warn", category="vehicle", tag_suffix="precondition",
                         title="\U0001F697 Couldn't reach car",
                         message="Tried to stop preconditioning but the command failed.")
        return
    memory = serde.loads_memory(persist.read_text(MEM_PATH))
    if action.startswith("PRECOND_SKIP::"):
        serde.add_skip_key(memory, action.split("::", 1)[1])
    elif action.startswith("PRECOND_ADDR::"):
        key = action.split("::", 1)[1]
        addr = kwargs.get("reply_text", "").strip()
        if addr:
            serde.remember_address(memory, key, addr, _now().isoformat())
    persist.write_text(MEM_PATH, serde.dumps_memory(memory))

def _parse_dt(s):
    dt = datetime.fromisoformat(str(s))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

def _normalize_event(cal, raw):
    start = raw.get("start"); end = raw.get("end")
    all_day = "T" not in str(start)      # date-only value => all-day event
    return {
        "id": raw.get("uid") or f"{cal}:{raw.get('summary','')}:{start}",
        "calendar_id": cal.split(".")[-1],
        "title": raw.get("summary", ""),
        "location": raw.get("location", "") or "",
        "start": None if all_day else _parse_dt(start),
        "end": None if all_day else _parse_dt(end),
        "all_day": all_day,
    }

def _fetch_events(now):
    # Returns (events, all_ok). all_ok is False if ANY calendar fetch failed, so the
    # caller can skip pruning (a partial fetch must not look like "these events are gone").
    horizon = now + _td(hours=CFG["lookahead_hours"])
    out = []
    all_ok = True
    for cal in CFG["calendar_entities"]:
        try:
            resp = service.call("calendar", "get_events", entity_id=cal,
                                start_date_time=now.isoformat(),
                                end_date_time=horizon.isoformat(),
                                return_response=True, blocking=True)
        except Exception as e:
            log.warning(f"get_events failed {cal}: {e}")
            _inc("counter.tesla_error_calendar_api")
            all_ok = False
            continue
        for raw in (resp.get(cal, {}) or {}).get("events", []):
            ev = _normalize_event(cal, raw)
            if core.is_actionable_event(ev):
                out.append(ev)
    return out, all_ok

# NOTE: the "2min" literal MUST be kept in sync with CFG["loop_interval_min"]
# (pyscript @time_trigger needs a parse-time literal; the config key is documentation).
@time_trigger("period(now, 2min)")
def loop():
    try:
        _tick()
    except Exception as e:
        log.error(f"loop tick failed: {e}")
        _inc("counter.tesla_error_unexpected")

def _enabled():
    # Dashboard kill switch. Fail OPEN: a missing or unreadable toggle must not
    # silently stop preconditioning -- that failure mode (something quietly not
    # running for weeks) is exactly what this app has already been bitten by.
    # Only an explicit "off" disables it.
    ent = CFG.get("enable_toggle")
    if not ent:
        return True
    try:
        return state.get(ent) != "off"
    except Exception:
        return True

def _tick():
    if not _enabled():
        return
    now = _now()
    memory = serde.loads_memory(persist.read_text(MEM_PATH))
    sched = serde.loads_schedule(persist.read_text(SCHED_PATH))
    sched.setdefault("travel", {})   # job -> {"min": float, "at": iso}
    fired = set(sched["fired"])
    for cal in CFG["calendar_entities"]:
        try:
            homeassistant.update_entity(entity_id=cal, blocking=True)  # force fresh poll
        except Exception as e:
            log.warning(f"calendar refresh failed {cal}: {e}")
    car = _read_car_state(now)
    live_ids = set()
    events, fetch_ok = _fetch_events(now)
    for ev in events:
        live_ids.add(ev["id"])
        try:
            _process_event(ev, memory, sched, fired, car, now)
        except Exception as e:
            log.error(f"event {ev.get('id')} failed: {e}")   # don't starve other events
            _inc("counter.tesla_error_unexpected")
    if fetch_ok:                        # never prune on a partial/failed fetch
        _prune(sched, fired, live_ids)
    _merge_force_flags(sched)          # don't clobber a force flag set mid-tick
    sched["fired"] = sorted(fired)
    persist.write_text(SCHED_PATH, serde.dumps_schedule(sched))

def _process_event(ev, memory, sched, fired, car, now):
    addr, outcome = core.resolve_location(ev, memory)
    if outcome == "skip":              # explicit skip suppresses BOTH directions
        return
    # RETURN trip: no destination address needed (the car is already at the event).
    # Gate: you're with the car (co-location, in the guardrail gate) AND the car is
    # away from home — a proxy for "you actually drove there".
    rjob = f"{ev['id']}::return"
    if (rjob not in fired and now >= core.compute_fire_at(ev, "return", 0, CFG)
            and _car_away_from_home(car)):
        _fire(ev, "return", rjob, car, fired, now, resolve_outcome=None)
    # OUTBOUND trip: needs a resolved destination address.
    near = now >= ev["start"] - _td(minutes=NEAR_MIN)
    ojob = f"{ev['id']}::outbound"
    if addr is None:
        # Ask only within the near window (or keep servicing an already-pending ask/force).
        if near or sched["pending"].get(ojob):
            _handle_unresolved(ev, sched, fired, car, now)
        return
    if ojob in fired or not near:      # don't price travel every tick for far-off events
        return
    fa = _outbound_fire_at(ev, ojob, addr, car, sched, now)
    if fa is not None and now >= fa:
        _fire(ev, "outbound", ojob, car, fired, now, resolve_outcome=outcome)

def _cached_or_fetch_travel(job, addr, car, sched, now):
    cache = sched["travel"].get(job)
    if cache:
        try:
            if (now - datetime.fromisoformat(cache["at"])) <= _td(minutes=TRAVEL_REFRESH_MIN):
                return cache["min"]
        except (ValueError, TypeError, KeyError):
            pass
    t = get_travel_min((car["car_lat"], car["car_lon"]), addr)
    if t is not None:
        sched["travel"][job] = {"min": t, "at": now.isoformat()}
    return t

def _outbound_fire_at(ev, job, addr, car, sched, now):
    travel = _cached_or_fetch_travel(job, addr, car, sched, now)
    if travel is None:                          # travel API failed -> fixed-lead fallback
        travel = 0
    elif not core.travel_is_plausible(travel, (ev["start"] - now).total_seconds() / 60):
        log.warning(f"implausible travel {travel:.0f}min for '{ev['title']}' with "
                    f"{(ev['start'] - now).total_seconds() / 60:.0f}min until start "
                    f"(addr={addr!r}) -- ignoring estimate, using fixed lead")
        _inc("counter.tesla_error_travel")
        travel = 0
    mid = (CFG["comfort_low_f"] + CFG["comfort_high_f"]) / 2
    outside = car.get("outside_f")
    lead = core.season_lead_min(CFG["precondition_lead_min"],
                                outside if outside is not None else mid, mid)
    return core.compute_fire_at(ev, "outbound", travel, CFG, lead_min=lead)

def _evaluate(car, now):
    # Full guardrail gate, with the design's stale-GPS degrade: when location can't
    # be verified, fall back to a battery/temp/motion-only decision (fixed lead)
    # rather than skipping outright.
    ok, reason = core.guardrail_gate(car, CFG, now)
    if not ok and reason == "stale_gps":
        ok2, r2 = core.guardrail_gate_no_location(car, CFG)
        return (True, "stale_gps_degrade") if ok2 else (False, r2)
    return ok, reason

def _fire(ev, direction, job, car, fired, now, resolve_outcome):
    ok, reason = _evaluate(car, now)
    if resolve_outcome:
        _inc(f"counter.tesla_resolve_{resolve_outcome}")
    if ok:
        _do_precondition(ev, direction, car)
    else:
        _inc(f"counter.tesla_skip_{reason}")
        log.info(f"SKIP {ev['title']} ({direction}) reason={reason}")
    fired.add(job)                              # mark handled either way (no re-fire)

def _precond_detail(ev, direction, car):
    when = ev["end"] if direction == "return" else ev["start"]
    bits = [direction, when.strftime("%H:%M")]
    cabin = (car or {}).get("cabin_f")
    if cabin is not None:
        bits.append(f"cabin {cabin:.0f}F")
    return " · ".join(bits)

def _notify_fire(ev, detail, dry):
    # Fires were otherwise silent -- log.info only -- so the only way to see what
    # the app decided was to read the HA log. Send the dry_run variant too, so the
    # timing can be checked from the phone before it is trusted to command the car.
    verb = "Would precondition" if dry else "Preconditioning"
    service.call("script", "notify",
        audience=CFG.get("notify_audience", "caleb"),
        severity="info", category="vehicle", tag_suffix=f"fire_{ev['id']}",
        title=f"\U0001F697 {verb}: {ev['title']}",
        message=detail,
        push_data={"actions": [
            {"action": f"PRECOND_STOP::{ev['id']}", "title": "Stop"},
        ]})

def _do_precondition(ev, direction, car=None):
    _inc(f"counter.tesla_fire_{direction}")
    detail = _precond_detail(ev, direction, car)
    if CFG["dry_run"]:
        log.info(f"[dry_run] PRECONDITION {ev['title']} ({direction})")
        _notify_fire(ev, detail, dry=True)
        return
    try:
        service.call("climate", "turn_on", entity_id=CFG["climate_entity"], blocking=True)
        log.info(f"PRECONDITION {ev['title']} ({direction})")
        _notify_fire(ev, detail, dry=False)
    except Exception as e:
        log.error(f"climate turn_on failed: {e}")
        _inc("counter.tesla_error_tesla_command")
        service.call("script", "notify", audience=CFG.get("notify_audience", "caleb"),
                     severity="warn", category="vehicle", tag_suffix="precondition",
                     title="🚗 Couldn't reach car",
                     message=f"Preconditioning for {ev['title']} failed.")

def _forced_precondition(ev, direction, job, car, fired):
    # "Precondition anyway" / unanswered-timeout path: no location to verify, so use
    # the location-independent guardrails (still honors battery/temp/moving).
    ok, reason = core.guardrail_gate_no_location(car, CFG)
    if ok:
        _do_precondition(ev, direction, car)
    else:
        _inc(f"counter.tesla_skip_{reason}")
        log.info(f"SKIP forced {ev['title']} ({direction}) reason={reason}")
    fired.add(job)

def _handle_unresolved(ev, sched, fired, car, now):
    job = f"{ev['id']}::outbound"
    p = sched["pending"].get(job, {})
    if p.get("force"):                          # "Precondition anyway" was tapped
        if now >= core.compute_fire_at(ev, "outbound", 0, CFG) and job not in fired:
            _forced_precondition(ev, "outbound", job, car, fired)
        return
    deadline = ev["start"] - _td(minutes=CFG["precondition_lead_min"])
    if not p.get("asked"):                      # ask once, on first sighting
        ask_location(core.memory_key(ev["calendar_id"], ev["title"]), ev["title"], ev["id"])
        _inc("counter.tesla_resolve_asked")
        sched["pending"][job] = {"asked": True, "deadline": deadline.isoformat()}
        return
    if core.pending_timed_out(deadline, now) and job not in fired:   # timeout default
        if CFG["unanswered_ask_default"] == "precondition":
            _forced_precondition(ev, "outbound", job, car, fired)
        else:
            _inc("counter.tesla_resolve_gave_up")
            log.info(f"GAVE UP (unanswered ask) {ev['title']}")
            fired.add(job)

def _prune(sched, fired, live_ids):
    # Drop jobs whose event has left the lookahead window (prevents unbounded growth).
    def dead(job):
        return job.split("::", 1)[0] not in live_ids
    for j in [j for j in fired if dead(j)]:
        fired.discard(j)
    for store in ("pending", "travel"):
        for j in [j for j in list(sched.get(store, {})) if dead(j)]:
            del sched[store][j]

def _merge_force_flags(sched):
    # on_action may have set a force flag on disk during this tick; preserve it.
    disk = serde.loads_schedule(persist.read_text(SCHED_PATH))
    for j, p in disk.get("pending", {}).items():
        if p.get("force"):
            sched["pending"].setdefault(j, {})["force"] = True

def _inc(counter_entity):
    try:
        service.call("counter", "increment", entity_id=counter_entity)
    except Exception as e:
        log.warning(f"counter inc failed {counter_entity}: {e}")

@time_trigger("startup")
def _on_start():
    # ensure data files exist; the persisted fired/pending set is loaded each tick
    if not persist.read_text(MEM_PATH):
        persist.write_text(MEM_PATH, serde.dumps_memory({}))
    if not persist.read_text(SCHED_PATH):
        persist.write_text(SCHED_PATH, serde.dumps_schedule({}))
    log.info("tesla-precond started")
    # log.info is invisible (custom components default to WARNING), so surface a
    # disabled kill switch loudly -- otherwise "silently not running" looks
    # identical to "running fine".
    if not _enabled():
        log.warning(f"tesla-precond DISABLED by {CFG['enable_toggle']} "
                    "-- no calendar preconditioning will run until it is turned on")
