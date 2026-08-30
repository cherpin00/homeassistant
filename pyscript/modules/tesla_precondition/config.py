DEFAULTS = {
    "precondition_lead_min": 15,
    "arrival_buffer_min": 5,
    "battery_floor_pct": 20,
    "comfort_low_f": 60,
    "comfort_high_f": 75,
    "colocation_radius_m": 150,
    "gps_staleness_max_min": 30,
    "lookahead_hours": 12,
    "loop_interval_min": 2,
    "unanswered_ask_default": "skip",   # "skip" | "precondition"
    "travel_provider": "waze",          # "waze" | "google"
    "enable_toggle": "input_boolean.tesla_precondition_enabled",  # "" to disable the check
    "waze_region": "us",                # lowercase; waze_travel_time accepts au|eu|il|na|us
    "dry_run": False,
}

def load_config(user: dict) -> dict:
    cfg = dict(DEFAULTS)
    cfg.update(user or {})
    if cfg["unanswered_ask_default"] not in ("skip", "precondition"):
        raise ValueError("unanswered_ask_default must be 'skip' or 'precondition'")
    if cfg["travel_provider"] not in ("waze", "google"):
        raise ValueError("travel_provider must be 'waze' or 'google'")
    return cfg
