from datetime import date

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings, get_settings
from app.schemas.weather import SaveWeatherHistoryRequest, WeatherBundle, WeatherHistoryRecord, WeatherSnapshot
from app.services.openweather import fetch_current_weather, fetch_forecast, fetch_weather_bundle, resolve_current_location, resolve_location
from app.services.youtube import search_youtube
from app.services.weather_history import delete_weather_history, get_weather_history_item, init_weather_history_db, list_weather_history, save_weather_history, update_weather_history

app = FastAPI(title="PM Weather API", version="0.1.0")


@app.on_event("startup")
async def startup() -> None:
    get_settings()
    init_weather_history_db()


settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/location/current")
async def current_location() -> dict:
    try:
        return await resolve_current_location()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="Unable to detect your current location.") from exc


@app.get("/api/locations/search")
async def search_locations(q: str = Query(min_length=2), settings: Settings = Depends(get_settings)):
    try:
        results = await resolve_location(settings, q)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return [
        {
            "name": item.get("name"),
            "state": item.get("state"),
            "country": item.get("country"),
            "lat": item.get("lat"),
            "lon": item.get("lon"),
        }
        for item in results
    ]


@app.get("/api/weather/current", response_model=WeatherSnapshot)
async def current_weather(
    city: str = Query(default="", min_length=0),
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    settings: Settings = Depends(get_settings),
):
    try:
        return await fetch_current_weather(settings, city, lat, lon)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/weather/forecast")
async def forecast(
    city: str = Query(default="", min_length=0),
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    settings: Settings = Depends(get_settings),
):
    try:
        return await fetch_forecast(settings, city, lat, lon)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/weather/bundle", response_model=WeatherBundle)
async def bundle(
    city: str = Query(default="", min_length=0),
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    settings: Settings = Depends(get_settings),
):
    try:
        return await fetch_weather_bundle(settings, city, lat, lon)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/weather/aqi")
async def weather_aqi(lat: float = Query(...), lon: float = Query(...), settings: Settings = Depends(get_settings)):
    try:
        # proxy to OpenWeather Air Pollution API
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{settings.openweather_api_base_url}/air_pollution", params={"lat": lat, "lon": lon, "appid": settings.openweather_api_key})
            resp.raise_for_status()
            data = resp.json()

        if data.get("list"):
            item = data["list"][0]
            return {"aqi": item.get("main", {}).get("aqi"), "components": item.get("components", {})}

        return {"aqi": None, "components": {}}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    

@app.get('/api/videos/search')
async def videos_search(q: str = Query(min_length=1), maxResults: int = Query(default=6, ge=1, le=12), settings: Settings = Depends(get_settings)):
    try:
        items = await search_youtube(settings, q, maxResults)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return items


@app.post("/api/weather/history", response_model=WeatherHistoryRecord)
async def save_weather_history_route(payload: SaveWeatherHistoryRequest, settings: Settings = Depends(get_settings)):
    try:
        return await save_weather_history(settings, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.put("/api/weather/history/{record_id}", response_model=WeatherHistoryRecord)
async def update_weather_history_route(record_id: int, payload: SaveWeatherHistoryRequest, settings: Settings = Depends(get_settings)):
    try:
        return await update_weather_history(settings, record_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.delete("/api/weather/history/{record_id}")
async def delete_weather_history_route(record_id: int):
    try:
        deleted = delete_weather_history(record_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Saved weather record not found.")
        return {"deleted": True, "id": record_id}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/weather/history/preview", response_model=WeatherHistoryRecord)
async def preview_weather_history_route(payload: SaveWeatherHistoryRequest, settings: Settings = Depends(get_settings)):
    try:
        # return a preview (not persisted)
        from app.services.weather_history import preview_weather_history

        return await preview_weather_history(settings, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/weather/history", response_model=list[WeatherHistoryRecord])
async def list_weather_history_route(
    location: str | None = Query(default=None),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
):
    try:
        return list_weather_history(location=location, start_date=start_date, end_date=end_date)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/weather/history/{record_id}", response_model=WeatherHistoryRecord)
async def get_weather_history_route(record_id: int):
    try:
        record = get_weather_history_item(record_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Saved weather record not found.")
        return record
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
