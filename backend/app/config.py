"""
All user-configurable credentials are stored in SQLite, never in env vars.
The only env vars the app reads are non-sensitive deployment parameters:
  APP_HOST, DB_PATH, POLL_INTERVAL_SECONDS.
"""
import os
import time

from .database import get_config as _db_get, set_config as _db_set

_cache: dict[str, tuple[str, float]] = {}
_TTL = 60.0

# Non-sensitive deployment params that live in the pod spec, not the database.
_ENV_PARAMS: dict[str, tuple[str, str]] = {
    "app_host": ("APP_HOST", "https://climate.ingress.realmclick.com"),
    "poll_interval_seconds": ("POLL_INTERVAL_SECONDS", "300"),
}

# All credential keys stored in SQLite.
CREDENTIAL_KEYS = [
    "google_client_id",
    "google_client_secret",
    "sdm_project_id",
    "google_refresh_token",
    "upstairs_device_id",
    "downstairs_device_id",
]


async def get(key: str, default: str = "") -> str:
    now = time.monotonic()
    cached = _cache.get(key)
    if cached is not None and cached[1] > now:
        return cached[0]

    val = await _db_get(key)

    if not val:
        if key in _ENV_PARAMS:
            env_key, env_default = _ENV_PARAMS[key]
            val = os.getenv(env_key, env_default)
        else:
            val = default

    result = val or default
    _cache[key] = (result, now + _TTL)
    return result


async def set(key: str, value: str) -> None:
    if key not in CREDENTIAL_KEYS:
        raise ValueError(f"Unknown config key: {key!r}")
    await _db_set(key, value)
    _cache.pop(key, None)


async def is_set(key: str) -> bool:
    return bool(await get(key))


async def status() -> dict[str, bool]:
    return {key: await is_set(key) for key in CREDENTIAL_KEYS}
