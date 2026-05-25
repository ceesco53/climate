import logging
import os
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

from .database import get_config, set_config

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
SDM_PROJECT_ID = os.getenv("SDM_PROJECT_ID", "")
APP_HOST = os.getenv("APP_HOST", "https://climate.ingress.realmclick.com")

UPSTAIRS_DEVICE_ID = os.getenv("UPSTAIRS_DEVICE_ID", "")
DOWNSTAIRS_DEVICE_ID = os.getenv("DOWNSTAIRS_DEVICE_ID", "")

_LOCATION_MAP: dict[str, str] = {}


def _build_location_map() -> None:
    if UPSTAIRS_DEVICE_ID:
        _LOCATION_MAP[UPSTAIRS_DEVICE_ID] = "Upstairs"
    if DOWNSTAIRS_DEVICE_ID:
        _LOCATION_MAP[DOWNSTAIRS_DEVICE_ID] = "Downstairs"


_build_location_map()


def get_auth_url() -> str:
    params = {
        "redirect_uri": f"{APP_HOST}/api/auth/callback",
        "access_type": "offline",
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/sdm.service",
        "client_id": GOOGLE_CLIENT_ID,
        "prompt": "consent",
    }
    base = f"https://nestservices.google.com/partnerconnections/{SDM_PROJECT_ID}/auth"
    return f"{base}?{urlencode(params)}"


async def exchange_code(code: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": f"{APP_HOST}/api/auth/callback",
            },
        )
        resp.raise_for_status()
        tokens = resp.json()
        refresh_token = tokens.get("refresh_token", "")
        if refresh_token:
            await set_config("google_refresh_token", refresh_token)
        return tokens.get("access_token", "")


async def _get_refresh_token() -> str | None:
    token = os.getenv("GOOGLE_REFRESH_TOKEN", "")
    if token:
        return token
    return await get_config("google_refresh_token")


async def _get_access_token() -> str:
    refresh_token = await _get_refresh_token()
    if not refresh_token:
        raise RuntimeError("No Google refresh token — visit /api/auth/start to connect")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


def _parse_device(device: dict) -> dict:
    traits = device.get("traits", {})
    name: str = device["name"]
    device_id = name.split("/")[-1]

    info = traits.get("sdm.devices.traits.Info", {})
    custom_name = info.get("customName", "")
    parent_relations = device.get("parentRelations", [])
    parent_name = parent_relations[0].get("displayName", "") if parent_relations else ""
    display_name = custom_name or parent_name or device_id

    temp = traits.get("sdm.devices.traits.Temperature", {})
    humidity = traits.get("sdm.devices.traits.Humidity", {})
    hvac = traits.get("sdm.devices.traits.ThermostatHvac", {})
    mode = traits.get("sdm.devices.traits.ThermostatMode", {})
    setpoint = traits.get("sdm.devices.traits.ThermostatTemperatureSetpoint", {})

    location = _LOCATION_MAP.get(device_id)

    return {
        "device_id": device_id,
        "display_name": display_name,
        "location": location,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ambient_temp_c": temp.get("ambientTemperatureCelsius"),
        "ambient_humidity": humidity.get("ambientHumidityPercent"),
        "hvac_status": hvac.get("status"),
        "thermostat_mode": mode.get("mode"),
        "heat_setpoint_c": setpoint.get("heatCelsius"),
        "cool_setpoint_c": setpoint.get("coolCelsius"),
    }


async def fetch_all_readings() -> list[dict]:
    access_token = await _get_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://smartdevicemanagement.googleapis.com/v1/enterprises/{SDM_PROJECT_ID}/devices",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15.0,
        )
        resp.raise_for_status()
        devices = resp.json().get("devices", [])

    thermostats = [d for d in devices if "THERMOSTAT" in d.get("type", "")]
    readings = [_parse_device(d) for d in thermostats]
    logger.info("Fetched %d thermostat(s)", len(readings))
    return readings


async def is_authenticated() -> bool:
    token = await _get_refresh_token()
    return bool(token)
