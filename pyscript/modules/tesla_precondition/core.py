import re

_GENERIC = {"meeting", "lunch", "dinner", "appointment", "call",
            "practice", "doctor appointment", "event", "busy"}
_DATE_RE = re.compile(r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b")
_TIME_RE = re.compile(r"@?\s*\d{1,2}(:\d{2})?\s*[ap]m\b", re.I)
_EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF]")

def normalize_title(title: str) -> str:
    t = title or ""
    t = _EMOJI_RE.sub("", t)
    t = _DATE_RE.sub("", t)
    t = _TIME_RE.sub("", t)
    t = t.replace("@", " ")
    return re.sub(r"\s+", " ", t).strip().lower()

def memory_key(calendar_id: str, title: str) -> str:
    return f"{calendar_id}::{normalize_title(title)}"

def is_generic_title(title: str) -> bool:
    return normalize_title(title) in _GENERIC

def resolve_location(event: dict, memory: dict):
    title = event.get("title", "")
    key = memory_key(event.get("calendar_id", ""), title)
    entry = memory.get(key)
    # A skip preference (set via the "Skip" notification tap) wins outright.
    if entry and entry.get("skip"):
        return None, "skip"
    loc = (event.get("location") or "").strip()
    if loc:
        return loc, "location_field"
    if is_generic_title(title):
        return None, "asked"
    if entry:
        confirmed = [a for a in entry.get("addresses", []) if a.get("confirmed")]
        if len(confirmed) == 1:
            return confirmed[0]["address"], "remembered"
        if len(confirmed) > 1:
            return None, "asked"   # conflict
    return None, "asked"

from datetime import timedelta

def outbound_precondition_at(event_start, travel_min, buffer_min, lead_min):
    leave_by = event_start - timedelta(minutes=travel_min + buffer_min)
    return leave_by - timedelta(minutes=lead_min)

def return_precondition_at(event_end, lead_min):
    return event_end - timedelta(minutes=lead_min)

def travel_is_plausible(travel_min, head_start_min):
    # A geocode miss on a sloppy address can price a 20-minute drive at 581
    # minutes (Waze did exactly that for "Dell JCc"). An estimate longer than
    # the time left before the event starts cannot be a route we could still
    # drive, and feeding it to outbound_precondition_at pushes fire_at hours
    # into the past -- which fires the moment it is evaluated. Reject it and
    # let the caller fall back to the fixed lead.
    return travel_min <= head_start_min

def season_lead_min(base, outside_f, comfort_f):
    delta = abs(outside_f - comfort_f)
    # +1 min lead per 3F beyond a 5F deadband, capped at +15
    extra = 0 if delta <= 5 else min(15, int((delta - 5) / 3))
    return base + extra

from tesla_precondition.geo import is_fresh, co_located

def guardrail_gate_no_location(s, cfg):
    # Battery/temp/motion checks that do NOT depend on GPS. Used directly for the
    # "precondition anyway" / unanswered-timeout / stale-GPS-degrade paths where we
    # cannot (or deliberately don't) verify phone<->car co-location.
    if s.get("is_conditioning"):
        return False, "already_conditioning"
    if s.get("is_moving"):
        return False, "moving"
    soc = s.get("soc_pct")
    # Unknown SoC (car asleep / sensor unavailable) is treated as a fail-safe skip
    # rather than crashing on `None < floor`.
    if soc is None or soc < cfg["battery_floor_pct"]:
        return False, "battery"
    cabin = s.get("cabin_f")
    if cabin is not None and cfg["comfort_low_f"] <= cabin <= cfg["comfort_high_f"]:
        return False, "temp"
    return True, "ok"

def guardrail_gate(s, cfg, now):
    ok, reason = guardrail_gate_no_location(s, cfg)
    if not ok:
        return ok, reason
    max_age = cfg["gps_staleness_max_min"]
    if not (is_fresh(s.get("car_updated"), now, max_age)
            and is_fresh(s.get("phone_updated"), now, max_age)):
        return False, "stale_gps"
    if not co_located(s.get("car_lat"), s.get("car_lon"),
                      s.get("phone_lat"), s.get("phone_lon"),
                      cfg["colocation_radius_m"]):
        return False, "colocation"
    return True, "ok"

def decide(address, car_state, cfg, now):
    if not address:
        return {"action": "ask", "reason": "no_location", "address": None}
    ok, reason = guardrail_gate(car_state, cfg, now)
    return {"action": "precondition" if ok else "skip",
            "reason": reason, "address": address}

def is_actionable_event(event) -> bool:
    if event.get("all_day"):
        return False
    return bool(event.get("start")) and bool(event.get("end"))

def compute_fire_at(event, direction, travel_min, cfg, lead_min=None):
    lead = cfg["precondition_lead_min"] if lead_min is None else lead_min
    if direction == "outbound":
        return outbound_precondition_at(event["start"], travel_min,
                                        cfg["arrival_buffer_min"], lead)
    return return_precondition_at(event["end"], lead)

def pending_timed_out(deadline, now) -> bool:
    return now >= deadline
