import aiosqlite
import os

DB_PATH = os.getenv("DB_PATH", "/data/climate.db")


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS thermostat_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                location TEXT,
                timestamp TEXT NOT NULL,
                ambient_temp_c REAL,
                ambient_humidity REAL,
                hvac_status TEXT,
                thermostat_mode TEXT,
                heat_setpoint_c REAL,
                cool_setpoint_c REAL
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_device_timestamp
            ON thermostat_readings(device_id, timestamp)
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS govee_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                device_name TEXT NOT NULL,
                sku TEXT,
                location TEXT,
                timestamp TEXT NOT NULL,
                temperature_c REAL,
                humidity REAL,
                battery INTEGER,
                online INTEGER
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_govee_device_timestamp
            ON govee_readings(device_id, timestamp)
        """)
        await db.commit()


async def get_config(key: str) -> str | None:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT value FROM config WHERE key = ?", (key,))
        row = await cur.fetchone()
        return row[0] if row else None


async def set_config(key: str, value: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (key, value)
        )
        await db.commit()


async def insert_reading(reading: dict) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO thermostat_readings
                (device_id, display_name, location, timestamp, ambient_temp_c,
                 ambient_humidity, hvac_status, thermostat_mode, heat_setpoint_c, cool_setpoint_c)
            VALUES
                (:device_id, :display_name, :location, :timestamp, :ambient_temp_c,
                 :ambient_humidity, :hvac_status, :thermostat_mode, :heat_setpoint_c, :cool_setpoint_c)
            """,
            reading,
        )
        await db.commit()


async def get_history(device_id: str, hours: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """
            SELECT device_id, display_name, location, timestamp,
                   ambient_temp_c, ambient_humidity, hvac_status,
                   thermostat_mode, heat_setpoint_c, cool_setpoint_c
            FROM thermostat_readings
            WHERE device_id = ?
              AND timestamp >= datetime('now', ? || ' hours')
            ORDER BY timestamp ASC
            """,
            (device_id, f"-{hours}"),
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def insert_govee_reading(reading: dict) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO govee_readings
                (device_id, device_name, sku, location, timestamp,
                 temperature_c, humidity, battery, online)
            VALUES
                (:device_id, :device_name, :sku, :location, :timestamp,
                 :temperature_c, :humidity, :battery, :online)
            """,
            reading,
        )
        await db.commit()


async def get_govee_history(device_id: str, hours: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """
            SELECT device_id, device_name, sku, location, timestamp,
                   temperature_c, humidity, battery, online
            FROM govee_readings
            WHERE device_id = ?
              AND timestamp >= datetime('now', ? || ' hours')
            ORDER BY timestamp ASC
            """,
            (device_id, f"-{hours}"),
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def get_latest_govee_readings() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """
            SELECT r.device_id, r.device_name, r.sku, r.location, r.timestamp,
                   r.temperature_c, r.humidity, r.battery, r.online
            FROM govee_readings r
            INNER JOIN (
                SELECT device_id, MAX(timestamp) AS max_ts
                FROM govee_readings
                GROUP BY device_id
            ) latest ON r.device_id = latest.device_id AND r.timestamp = latest.max_ts
            """
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def get_latest_readings() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """
            SELECT r.device_id, r.display_name, r.location, r.timestamp,
                   r.ambient_temp_c, r.ambient_humidity, r.hvac_status,
                   r.thermostat_mode, r.heat_setpoint_c, r.cool_setpoint_c
            FROM thermostat_readings r
            INNER JOIN (
                SELECT device_id, MAX(timestamp) AS max_ts
                FROM thermostat_readings
                GROUP BY device_id
            ) latest ON r.device_id = latest.device_id AND r.timestamp = latest.max_ts
            """
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]
