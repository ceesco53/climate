import json
import logging
import uuid
from datetime import datetime, timezone

import httpx

from . import config

logger = logging.getLogger(__name__)

_BASE = "https://openapi.api.govee.com/router/api/v1"


async def _api_key() -> str:
    key = await config.get("govee_api_key")
    if not key:
        raise RuntimeError("Govee API key not configured")
    return key


async def _device_labels() -> dict[str, str]:
    raw = await config.get("govee_device_labels", "{}")
    try:
        return json.loads(raw)
    except Exception:
        return {}


async def list_devices_raw() -> list[dict]:
    """Return raw device list from Govee API."""
    api_key = await _api_key()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_BASE}/user/devices",
            headers={"Govee-API-Key": api_key},
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()

    # Govee API returns devices under data.devices or data (list)
    if isinstance(data.get("data"), list):
        return data["data"]
    if isinstance(data.get("data"), dict):
        return data["data"].get("devices") or []
    return []


def _extract_cap(state_resp: dict, instance: str):
    caps = (state_resp.get("payload") or {}).get("capabilities") or []
    for cap in caps:
        if cap.get("instance") == instance:
            return (cap.get("state") or {}).get("value")
    return None


async def _selected_device_ids() -> set[str] | None:
    """Returns the set of selected device IDs, or None if not configured (poll all)."""
    raw = await config.get("govee_selected_devices", "")
    if not raw:
        return None
    try:
        ids = json.loads(raw)
        return set(ids) if ids else set()
    except Exception:
        return None


async def fetch_all_readings() -> list[dict]:
    api_key = await _api_key()
    labels = await _device_labels()
    selected = await _selected_device_ids()
    devices = await list_devices_raw()

    if selected is not None:
        devices = [d for d in devices if d.get("device") in selected]

    readings: list[dict] = []
    async with httpx.AsyncClient() as client:
        for device in devices:
            sku = device.get("sku", "")
            device_id = device.get("device", "")
            device_name = device.get("deviceName") or device_id

            try:
                resp = await client.post(
                    f"{_BASE}/device/state",
                    headers={"Govee-API-Key": api_key, "Content-Type": "application/json"},
                    json={
                        "requestId": str(uuid.uuid4()),
                        "payload": {"sku": sku, "device": device_id},
                    },
                    timeout=15.0,
                )
                resp.raise_for_status()
            except Exception as exc:
                logger.warning("Govee state fetch failed for %s: %s", device_id, exc)
                continue

            state = resp.json()
            temp = _extract_cap(state, "sensorTemperature")
            humidity = _extract_cap(state, "sensorHumidity")
            battery = _extract_cap(state, "sensorBattery")
            online_raw = _extract_cap(state, "online")
            online: int | None = None
            if online_raw is not None:
                online = 1 if str(online_raw).lower() in {"1", "true", "online"} else 0

            readings.append({
                "device_id": device_id,
                "device_name": device_name,
                "sku": sku,
                "location": labels.get(device_id) or device_name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "temperature_c": temp,
                "humidity": humidity,
                "battery": battery,
                "online": online,
            })

    logger.info("Fetched %d Govee sensor(s)", len(readings))
    return readings


async def is_configured() -> bool:
    return await config.is_set("govee_api_key")
