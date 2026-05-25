import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .database import init_db, insert_reading, get_history, get_latest_readings
from .nest import fetch_all_readings, get_auth_url, exchange_code, is_authenticated

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "300"))

_poll_task: asyncio.Task | None = None
_auth_ready = False


async def _poll_loop() -> None:
    global _auth_ready
    while True:
        try:
            if await is_authenticated():
                _auth_ready = True
                readings = await fetch_all_readings()
                for reading in readings:
                    await insert_reading(reading)
            else:
                logger.warning("Not authenticated — skipping poll. Visit /api/auth/start")
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


@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/auth/start")
async def auth_start():
    return RedirectResponse(url=get_auth_url())


@app.get("/api/auth/callback")
async def auth_callback(code: str = Query(...)):
    try:
        await exchange_code(code)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Auth failed: {exc}")
    return RedirectResponse(url="/")


@app.get("/api/auth/status")
async def auth_status():
    authed = await is_authenticated()
    return {"authenticated": authed}


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
