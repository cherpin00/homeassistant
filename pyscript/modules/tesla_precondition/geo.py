import math
from datetime import datetime, timedelta

_EARTH_M = 6_371_000.0

def haversine_m(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * _EARTH_M * math.asin(math.sqrt(a))

def is_fresh(updated: datetime, now: datetime, max_age_min: int) -> bool:
    if updated is None:
        return False
    return (now - updated) <= timedelta(minutes=max_age_min)

def co_located(lat1, lon1, lat2, lon2, radius_m: float) -> bool:
    if None in (lat1, lon1, lat2, lon2):
        return False
    return haversine_m(lat1, lon1, lat2, lon2) <= radius_m
