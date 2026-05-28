import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config as cfg
from .database import (
    init_db, insert_reading, get_history, get_latest_readings,
    insert_govee_reading, get_govee_history, get_latest_govee_readings,
)
from .nest import fetch_all_readings, get_auth_url, exchange_code, is_authenticated, credentials_configured
from .govee import fetch_all_readings as govee_fetch, is_configured as govee_configured, list_devices_raw

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "300"))

_poll_task: asyncio.Task | None = None


async def _poll_loop() -> None:
    while True:
        try:
            if await credentials_configured() and await is_authenticated():
                readings = await fetch_all_readings()
                for reading in readings:
                    await insert_reading(reading)
            else:
                logger.info("Nest config incomplete — skipping Nest poll.")

            if await govee_configured():
                govee_readings = await govee_fetch()
                for reading in govee_readings:
                    await insert_govee_reading(reading)
            else:
                logger.info("Govee not configured — skipping Govee poll.")
        except Exception:
            logger.exception("Poll failed")
        await asyncio.sleep(POLL_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    global _poll_task
    _poll_task = asyncio.create_task(_poll_loop())
    yield
    if _poll_task:
        _poll_task.cancel()


app = FastAPI(title="Climate Dashboard", lifespan=lifespan)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ── Config ────────────────────────────────────────────────────────────────────

class ConfigPayload(BaseModel):
    # All fields optional so the client can send only what changed.
    google_client_id: str | None = None
    google_client_secret: str | None = None
    sdm_project_id: str | None = None
    upstairs_device_id: str | None = None
    downstairs_device_id: str | None = None
    govee_api_key: str | None = None
    govee_device_labels: str | None = None    # JSON: {"device_id": "label"}
    govee_selected_devices: str | None = None # JSON: ["device_id", ...]


@app.get("/api/config/status")
async def config_status():
    """Returns which credential keys are present — never their values."""
    return await cfg.status()


@app.post("/api/config")
async def save_config(payload: ConfigPayload):
    """Persist credential values to the SQLite config store."""
    updates = payload.model_dump(exclude_none=True)
    for key, value in updates.items():
        if value:
            await cfg.set(key, value)
    return {"ok": True, "saved": list(updates.keys())}


# ── OAuth ─────────────────────────────────────────────────────────────────────

@app.get("/api/auth/start")
async def auth_start():
    if not await credentials_configured():
        raise HTTPException(status_code=400, detail="Credentials not configured. Save them via the dashboard first.")
    return RedirectResponse(url=await get_auth_url())


@app.get("/api/auth/callback")
async def auth_callback(code: str = Query(...)):
    try:
        await exchange_code(code)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Auth failed: {exc}")
    return RedirectResponse(url="/")


@app.get("/api/auth/status")
async def auth_status():
    return {
        "credentials_configured": await credentials_configured(),
        "authenticated": await is_authenticated(),
    }


# ── Devices & History ─────────────────────────────────────────────────────────

@app.get("/api/devices")
async def get_devices():
    try:
        rows = await get_latest_readings()
        return {"devices": rows, "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/api/history")
async def get_device_history(
    device_id: str = Query(...),
    hours: int = Query(default=24, ge=1, le=720),
):
    rows = await get_history(device_id, hours)
    return {"device_id": device_id, "hours": hours, "readings": rows}


# ── Govee ─────────────────────────────────────────────────────────────────────

@app.get("/api/govee/devices")
async def get_govee_devices():
    import json as _json
    rows = await get_latest_govee_readings()
    selected_raw = await cfg.get("govee_selected_devices", "")
    if selected_raw:
        try:
            selected = set(_json.loads(selected_raw))
            rows = [r for r in rows if r["device_id"] in selected]
        except Exception:
            pass
    return {"devices": rows, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/govee/history")
async def get_govee_device_history(
    device_id: str = Query(...),
    hours: int = Query(default=24, ge=1, le=720),
):
    rows = await get_govee_history(device_id, hours)
    return {"device_id": device_id, "hours": hours, "readings": rows}


@app.get("/api/govee/discover")
async def govee_discover():
    """Call Govee API live — used during setup to verify key and list devices."""
    if not await govee_configured():
        return {"devices": []}
    try:
        raw = await list_devices_raw()
        return {
            "devices": [
                {"device_id": d.get("device"), "device_name": d.get("deviceName"), "sku": d.get("sku")}
                for d in raw
            ]
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


app.mount("/", StaticFiles(directory="static", html=True), name="static")
