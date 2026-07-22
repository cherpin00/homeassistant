import json

def dumps_memory(memory: dict) -> str:
    return json.dumps(memory, indent=2, sort_keys=True)

def loads_memory(text: str) -> dict:
    try:
        return json.loads(text) if text else {}
    except (ValueError, TypeError):
        return {}

def remember_address(memory: dict, key: str, address: str, last_seen: str):
    entry = memory.setdefault(key, {"addresses": []})
    for a in entry["addresses"]:
        if a["address"] == address:
            a["last_seen"] = last_seen
            a["confirmed"] = True
            return
    entry["addresses"].append({"address": address, "confirmed": True, "last_seen": last_seen})

def add_skip_key(memory: dict, key: str):
    memory.setdefault(key, {"addresses": []})["skip"] = True

def dumps_schedule(sched: dict) -> str:
    return json.dumps(sched, indent=2, sort_keys=True)

def loads_schedule(text: str) -> dict:
    try:
        d = json.loads(text) if text else {}
    except (ValueError, TypeError):
        d = {}
    d.setdefault("fired", [])     # list of "event_id::direction" (JSON has no sets)
    d.setdefault("pending", {})   # "event_id::direction" -> {"deadline": iso, "asked": bool}
    return d
