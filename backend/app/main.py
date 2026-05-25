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
from .database import init_db, insert_reading, get_history, get_latest_readings
from .nest import fetch_all_readings, get_auth_url, exchange_code, is_authenticated, credentials_configured

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
                logger.info("Config incomplete — skipping poll. Visit the dashboard to set up.")
        except Exception as exc:
            logger.error("Poll failed: %s", exc)
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


app.mount("/", StaticFiles(directory="static", html=True), name="static")
