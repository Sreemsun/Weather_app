from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

from app.core.config import Settings
from app.schemas.weather import SaveWeatherHistoryRequest
from app.services.openweather import fetch_weather_bundle

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "weather_history.sqlite3"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_weather_history_db() -> None:
    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS saved_weather_ranges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                location TEXT NOT NULL,
                city TEXT NOT NULL,
                country TEXT,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                bundle_json TEXT NOT NULL,
                saved_at TEXT NOT NULL
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_saved_weather_ranges_location ON saved_weather_ranges(location)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_saved_weather_ranges_dates ON saved_weather_ranges(start_date, end_date)")


def _row_to_record(row: sqlite3.Row) -> dict:
    bundle = json.loads(row["bundle_json"])
    current = bundle.get("current", {})
    return {
        "id": row["id"],
        "location": row["location"],
        "city": row["city"],
        "country": row["country"],
        "lat": row["lat"],
        "lon": row["lon"],
        "startDate": row["start_date"],
        "endDate": row["end_date"],
        "savedAt": row["saved_at"],
        "bundle": bundle,
        "summary": current.get("description") or current.get("condition") or "Saved weather",
        "temperatureC": current.get("temperatureC"),
    }


def _normalize_saved_query(value: str | None) -> str:
    return value.strip().lower() if value else ""


def _build_saved_record(record_id: int, payload: SaveWeatherHistoryRequest, bundle: dict, saved_at: str) -> dict:
    location = bundle["location"]
    current = bundle["current"]
    return {
        "id": record_id,
        "location": location,
        "city": current.get("city") or payload.city or location,
        "country": current.get("country"),
        "lat": float(current.get("latitude", payload.lat or 0.0)),
        "lon": float(current.get("longitude", payload.lon or 0.0)),
        "startDate": payload.start_date.isoformat(),
        "endDate": payload.end_date.isoformat(),
        "savedAt": saved_at,
        "bundle": bundle,
        "summary": current.get("description") or current.get("condition") or "Saved weather",
        "temperatureC": current.get("temperatureC"),
    }


async def save_weather_history(settings: Settings, payload: SaveWeatherHistoryRequest) -> dict:
    if payload.end_date < payload.start_date:
        raise ValueError("End date must be on or after start date.")

    # Fetch a bundle covering the requested date range (includes historical days when possible)
    from app.services.openweather import fetch_weather_range

    bundle = await fetch_weather_range(settings, payload.city, payload.start_date, payload.end_date, payload.lat, payload.lon)
    saved_at = datetime.now(timezone.utc).isoformat()
    record = _build_saved_record(0, payload, bundle, saved_at)

    with _connect() as connection:
        cursor = connection.execute(
            """
            INSERT INTO saved_weather_ranges (
                location, city, country, lat, lon, start_date, end_date, bundle_json, saved_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["location"],
                record["city"],
                record["country"],
                float(record["lat"]),
                float(record["lon"]),
                payload.start_date.isoformat(),
                payload.end_date.isoformat(),
                json.dumps(bundle, ensure_ascii=False),
                saved_at,
            ),
        )
        record_id = cursor.lastrowid

    record["id"] = record_id
    return record


async def update_weather_history(settings: Settings, record_id: int, payload: SaveWeatherHistoryRequest) -> dict:
    if payload.end_date < payload.start_date:
        raise ValueError("End date must be on or after start date.")

    from app.services.openweather import fetch_weather_range

    bundle = await fetch_weather_range(settings, payload.city, payload.start_date, payload.end_date, payload.lat, payload.lon)
    saved_at = datetime.now(timezone.utc).isoformat()
    record = _build_saved_record(record_id, payload, bundle, saved_at)

    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE saved_weather_ranges
            SET location = ?, city = ?, country = ?, lat = ?, lon = ?, start_date = ?, end_date = ?, bundle_json = ?, saved_at = ?
            WHERE id = ?
            """,
            (
                record["location"],
                record["city"],
                record["country"],
                float(record["lat"]),
                float(record["lon"]),
                payload.start_date.isoformat(),
                payload.end_date.isoformat(),
                json.dumps(bundle, ensure_ascii=False),
                saved_at,
                record_id,
            ),
        )
        if cursor.rowcount == 0:
            raise ValueError(f"Saved weather record {record_id} not found.")

    return record


def delete_weather_history(record_id: int) -> bool:
    with _connect() as connection:
        cursor = connection.execute("DELETE FROM saved_weather_ranges WHERE id = ?", (record_id,))
        return cursor.rowcount > 0


async def preview_weather_history(settings: Settings, payload: SaveWeatherHistoryRequest) -> dict:
    """Fetch the bundle for the provided location/date range but do not persist it."""
    if payload.end_date < payload.start_date:
        raise ValueError("End date must be on or after start date.")

    from app.services.openweather import fetch_weather_range

    bundle = await fetch_weather_range(settings, payload.city, payload.start_date, payload.end_date, payload.lat, payload.lon)
    location = bundle["location"]
    current = bundle["current"]
    preview_at = datetime.now(timezone.utc).isoformat()

    # Return same shape as save but with id = 0 and no DB insert
    return {
        "id": 0,
        "location": location,
        "city": current.get("city") or payload.city or location,
        "country": current.get("country"),
        "lat": float(current.get("latitude", payload.lat or 0.0)),
        "lon": float(current.get("longitude", payload.lon or 0.0)),
        "startDate": payload.start_date.isoformat(),
        "endDate": payload.end_date.isoformat(),
        "savedAt": preview_at,
        "bundle": bundle,
        "summary": current.get("description") or current.get("condition") or "Preview weather",
        "temperatureC": current.get("temperatureC"),
    }


def list_weather_history(location: str | None = None, start_date: date | None = None, end_date: date | None = None, limit: int = 50) -> list[dict]:
    clauses = ["1 = 1"]
    params: list[object] = []

    query = _normalize_saved_query(location)
    if query:
        clauses.append("LOWER(location) LIKE ?")
        params.append(f"%{query}%")

    if start_date is not None:
        clauses.append("end_date >= ?")
        params.append(start_date.isoformat())

    if end_date is not None:
        clauses.append("start_date <= ?")
        params.append(end_date.isoformat())

    params.append(limit)

    sql = f"""
        SELECT *
        FROM saved_weather_ranges
        WHERE {' AND '.join(clauses)}
        ORDER BY saved_at DESC, id DESC
        LIMIT ?
    """

    with _connect() as connection:
        rows = connection.execute(sql, params).fetchall()

    return [_row_to_record(row) for row in rows]


def get_weather_history_item(record_id: int) -> dict | None:
    with _connect() as connection:
        row = connection.execute("SELECT * FROM saved_weather_ranges WHERE id = ?", (record_id,)).fetchone()

    if row is None:
        return None

    return _row_to_record(row)
