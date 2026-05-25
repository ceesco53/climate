import logging
import os
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

from . import config

logger = logging.getLogger(__name__)

# APP_HOST is a non-sensitive deployment param, read from env only.
_APP_HOST = os.getenv("APP_HOST", "https://climate.ingress.realmclick.com")


async def get_auth_url() -> str:
    client_id = await config.get("google_client_id")
    project_id = await config.get("sdm_project_id")
    params = {
        "redirect_uri": f"{_APP_HOST}/api/auth/callback",
        "access_type": "offline",
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/sdm.service",
        "client_id": client_id,
        "prompt": "consent",
    }
    base = f"https://nestservices.google.com/partnerconnections/{project_id}/auth"
    return f"{base}?{urlencode(params)}"


async def exchange_code(code: str) -> None:
    client_id = await config.get("google_client_id")
    client_secret = await config.get("google_client_secret")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": f"{_APP_HOST}/api/auth/callback",
            },
        )
        resp.raise_for_status()
        tokens = resp.json()
        refresh_token = tokens.get("refresh_token", "")
        if refresh_token:
            await config.set("google_refresh_token", refresh_token)


async def _get_access_token() -> str:
    refresh_token = await config.get("google_refresh_token")
    if not refresh_token:
        raise RuntimeError("No refresh token — complete OAuth via /api/auth/start")
    client_id = await config.get("google_client_id")
    client_secret = await config.get("google_client_secret")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


async def _parse_device(device: dict) -> dict:
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

    upstairs_id = await config.get("upstairs_device_id")
    downstairs_id = await config.get("downstairs_device_id")
    if device_id == upstairs_id:
        location = "upstairs"
    elif device_id == downstairs_id:
        location = "downstairs"
    else:
        location = None

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
    project_id = await config.get("sdm_project_id")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://smartdevicemanagement.googleapis.com/v1/enterprises/{project_id}/devices",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15.0,
        )
        resp.raise_for_status()
        devices = resp.json().get("devices", [])

    thermostats = [d for d in devices if "THERMOSTAT" in d.get("type", "")]
    readings = [await _parse_device(d) for d in thermostats]
    logger.info("Fetched %d thermostat(s)", len(readings))
    return readings


async def is_authenticated() -> bool:
    return await config.is_set("google_refresh_token")


async def credentials_configured() -> bool:
    return (
        await config.is_set("google_client_id")
        and await config.is_set("google_client_secret")
        and await config.is_set("sdm_project_id")
    )
