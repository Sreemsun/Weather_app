from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx

from app.core.config import Settings


def _wind_direction(degrees: float | None) -> str:
    if degrees is None:
        return "Calm"

    directions = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"]
    return directions[round(degrees / 45) % len(directions)]


def _condition_label(condition: str) -> str:
    normalized = condition.lower()

    if normalized == "clear":
        return "Clear and Bright"
    if normalized == "clouds":
        return "Overcast Sky"
    if normalized in {"rain", "drizzle"}:
        return "Heavy Rain"
    if normalized == "snow":
        return "Snowfall"
    if normalized == "thunderstorm":
        return "Thunder Storm"
    if normalized in {"mist", "fog", "haze"}:
        return "Morning Fog"

    return condition


def _condition_icon(condition: str) -> str:
    normalized = condition.lower()

    if normalized == "clear":
        return "sun"
    if normalized == "clouds":
        return "cloud"
    if normalized in {"rain", "drizzle"}:
        return "rain"
    if normalized == "snow":
        return "snow"
    if normalized == "thunderstorm":
        return "storm"
    if normalized in {"mist", "fog", "haze"}:
        return "fog"

    return "cloud"


def _format_timestamp(timestamp: int, timezone_offset: int) -> datetime:
    return datetime.fromtimestamp(timestamp + timezone_offset, tz=timezone.utc)


def _format_hour(timestamp: int, timezone_offset: int) -> str:
    return _format_timestamp(timestamp, timezone_offset).strftime("%H:%M")


def _format_day(timestamp: int, timezone_offset: int) -> str:
    return _format_timestamp(timestamp, timezone_offset).strftime("%A, %d %B")


def _format_date(timestamp: int, timezone_offset: int) -> str:
    return _format_timestamp(timestamp, timezone_offset).strftime("%Y-%m-%d %H:%M")


def _parse_city(city: str) -> tuple[str, str | None]:
    parts = [part.strip() for part in city.split(",") if part.strip()]
    if len(parts) >= 2:
        return parts[0], parts[-1]
    return city.strip(), None


def _location_label(name: str, state: str | None, country: str | None) -> str:
    parts = [name]
    if state:
        parts.append(state)
    if country:
        parts.append(country)
    return ", ".join(part for part in parts if part)


def _profile_for_city(city: str) -> dict[str, object]:
    normalized = city.lower()

    if any(token in normalized for token in ["rain", "tbilisi", "london", "mumbai"]):
        return {"condition": "Heavy Rain", "description": "heavy rain", "temp": 11, "wind": 38.9, "icon": "rain", "pressure": 996, "humidity": 84, "dew_point": 9, "uv": 2.1, "visibility": 8200, "gust": 58.3, "precip": 82}
    if any(token in normalized for token in ["sun", "lisbon", "dubai", "cairo"]):
        return {"condition": "Clear and Bright", "description": "clear sky", "temp": 27, "wind": 11.4, "icon": "sun", "pressure": 1017, "humidity": 34, "dew_point": 10, "uv": 8.4, "visibility": 10000, "gust": 18.7, "precip": 4}
    if any(token in normalized for token in ["snow", "oslo", "helsinki", "reykjavik"]):
        return {"condition": "Snowfall", "description": "light snow", "temp": -4, "wind": 22.1, "icon": "snow", "pressure": 1008, "humidity": 71, "dew_point": -7, "uv": 0.8, "visibility": 6400, "gust": 33.4, "precip": 46}
    if any(token in normalized for token in ["storm", "miami", "houston", "bangalore"]):
        return {"condition": "Thunder Storm", "description": "thunderstorm", "temp": 15, "wind": 41.8, "icon": "storm", "pressure": 1001, "humidity": 88, "dew_point": 13, "uv": 3.6, "visibility": 7200, "gust": 62.4, "precip": 78}

    return {"condition": "Overcast Sky", "description": "scattered clouds", "temp": 18, "wind": 17.2, "icon": "cloud", "pressure": 1012, "humidity": 62, "dew_point": 9, "uv": 4.2, "visibility": 9100, "gust": 24.1, "precip": 24}


def _mock_hourly(base_temp: int, icon: str, precip: int) -> list[dict]:
    hours: list[dict] = []
    now = datetime.now(timezone.utc)
    offsets = [-2, -2, -1, -1, 0, 0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0, 0, -1, -1, -2, -2, -1, 0]

    for index in range(24):
        dt = now + timedelta(hours=index)
        hours.append(
            {
                "time": dt.strftime("%H:%M"),
                "temperatureC": base_temp + offsets[index],
                "feelsLikeC": base_temp + offsets[index] + 1,
                "precipitationProbability": precip if index < 10 else max(0, precip - 35),
                "icon": icon if index < 6 else ("cloud" if icon != "sun" else "sun"),
                "summary": _condition_label({"sun": "clear", "cloud": "clouds", "rain": "rain", "snow": "snow", "storm": "thunderstorm"}.get(icon, "cloud")),
            }
        )

    return hours


def _mock_daily(base_temp: int, icon: str, summary: str, precip: int) -> list[dict]:
    offsets = [0, -1, -1, 0, 1, 2, 1]
    daily: list[dict] = []
    now = datetime.now(timezone.utc)

    for index, offset in enumerate(offsets):
        day = (now + timedelta(days=index)).strftime("%A, %d %B")
        daily.append(
            {
                "day": day,
                "summary": summary if index == 0 else ("Partly Cloudy" if icon == "cloud" else summary),
                "lowC": base_temp + offset - 3,
                "highC": base_temp + offset + 4,
                "icon": icon if index == 0 else ("cloud" if icon != "sun" else "sun"),
                "precipitationProbability": precip if index == 0 else max(0, precip - 20),
                "sunrise": "06:12",
                "sunset": "19:48",
            }
        )

    return daily


def _build_mock_bundle(city: str) -> dict:
    name, country = _parse_city(city)
    profile = _profile_for_city(city)
    base_temp = int(profile["temp"])
    updated_at = datetime.now(timezone.utc)

    location = _location_label(name, None, country)

    current = {
        "city": name,
        "country": country,
        "latitude": 0.0,
        "longitude": 0.0,
        "temperatureC": base_temp,
        "feelsLikeC": base_temp + 1,
        "humidity": profile["humidity"],
        "pressure": profile["pressure"],
        "dewPointC": profile["dew_point"],
        "aqi": 2,
        "uvIndex": profile["uv"],
        "visibilityKm": round(float(profile["visibility"]) / 1000, 1),
        "windSpeedKmh": profile["wind"],
        "windDirection": "West" if profile["icon"] == "rain" else "North-West",
        "windGustKmh": profile["gust"],
        "sunrise": "06:12",
        "sunset": "19:48",
        "condition": profile["condition"],
        "description": profile["description"].capitalize(),
        "updatedAt": updated_at.isoformat(),
    }

    return {
        "location": location,
        "current": current,
        "hourly": _mock_hourly(base_temp, profile["icon"], int(profile["precip"])),
        "daily": _mock_daily(base_temp, profile["icon"], profile["condition"], int(profile["precip"])),
    }


def _build_location_from_geocode(item: dict) -> dict:
    return {
        "name": item.get("name", "Unknown location"),
        "state": item.get("state"),
        "country": item.get("country"),
        "lat": item.get("lat", 0.0),
        "lon": item.get("lon", 0.0),
    }


def _build_coords_params(city: str | None, lat: float | None, lon: float | None) -> dict:
    params: dict[str, object] = {"units": "metric", "appid": True}
    if lat is not None and lon is not None:
        params["lat"] = lat
        params["lon"] = lon
    elif city:
        params["q"] = city

    return params


async def resolve_location_by_coordinates(settings: Settings, lat: float, lon: float) -> list[dict]:
    if not settings.openweather_api_key:
        return [{"name": "Current location", "state": None, "country": "", "lat": lat, "lon": lon}]

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{settings.openweather_geo_base_url}/reverse",
            params={"lat": lat, "lon": lon, "limit": 5, "appid": settings.openweather_api_key},
        )
        response.raise_for_status()
        return [_build_location_from_geocode(item) for item in response.json()]


def _dew_point_c(temperature_c: float, humidity: float) -> float:
    a = 17.27
    b = 237.7
    alpha = ((a * temperature_c) / (b + temperature_c)) + (humidity / 100.0)
    return (b * alpha) / (a - alpha)


async def _fetch_live_current(settings: Settings, city: str | None = None, lat: float | None = None, lon: float | None = None) -> dict:
    params: dict[str, object] = {"units": "metric", "appid": settings.openweather_api_key}
    if lat is not None and lon is not None:
        params["lat"] = lat
        params["lon"] = lon
    elif city:
        params["q"] = city

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{settings.openweather_api_base_url}/weather",
            params=params,
        )
        response.raise_for_status()
        data = response.json()

        # Try to fetch air pollution (AQI) for the requested coordinates
        aqi_val = None
        try:
            async with httpx.AsyncClient(timeout=10) as aq_client:
                aq_resp = await aq_client.get(
                    f"{settings.openweather_api_base_url}/air_pollution",
                    params={"lat": latitude, "lon": longitude, "appid": settings.openweather_api_key},
                )
                aq_resp.raise_for_status()
                aq_json = aq_resp.json()
                if aq_json.get("list"):
                    aqi_val = aq_json["list"][0].get("main", {}).get("aqi")
        except Exception:
            aqi_val = None

    weather = data["weather"][0]
    # attempt to fetch AQI (Air Quality Index) from OpenWeather Air Pollution API
    aqi_val = None
    if settings.openweather_api_key:
        try:
            async with httpx.AsyncClient(timeout=10) as client_aq:
                aq_resp = await client_aq.get(
                    f"{settings.openweather_api_base_url}/air_pollution",
                    params={"lat": data.get("coord", {}).get("lat", 0.0), "lon": data.get("coord", {}).get("lon", 0.0), "appid": settings.openweather_api_key},
                )
                aq_resp.raise_for_status()
                aq_json = aq_resp.json()
                if aq_json.get("list"):
                    aqi_val = aq_json["list"][0].get("main", {}).get("aqi")
        except Exception:
            aqi_val = None
    return {
        "city": data["name"],
        "country": data["sys"].get("country"),
        "latitude": data.get("coord", {}).get("lat", 0.0),
        "longitude": data.get("coord", {}).get("lon", 0.0),
        "temperatureC": round(data["main"]["temp"]),
        "feelsLikeC": round(data["main"]["feels_like"]),
        "humidity": data["main"]["humidity"],
        "pressure": data["main"]["pressure"],
        "dewPointC": round(_dew_point_c(float(data["main"]["temp"]), float(data["main"]["humidity"]))),
        "aqi": aqi_val,
        "uvIndex": 0.0,
        "visibilityKm": round(float(data.get("visibility", 0)) / 1000, 1),
        "windSpeedKmh": round(float(data["wind"].get("speed", 0.0)) * 3.6, 1),
        "windDirection": _wind_direction(data["wind"].get("deg")),
        "windGustKmh": round(float(data["wind"].get("gust", data["wind"].get("speed", 0.0))) * 3.6, 1),
        "sunrise": _format_hour(data["sys"]["sunrise"], data["timezone"]),
        "sunset": _format_hour(data["sys"]["sunset"], data["timezone"]),
        "condition": _condition_label(weather["main"]),
        "description": weather["description"].capitalize(),
        "updatedAt": _format_date(data["dt"], data["timezone"]),
    }


async def _fetch_live_forecast(settings: Settings, city: str | None = None, lat: float | None = None, lon: float | None = None) -> dict:
    params: dict[str, object] = {"units": "metric", "appid": settings.openweather_api_key}
    if lat is not None and lon is not None:
        params["lat"] = lat
        params["lon"] = lon
    elif city:
        params["q"] = city

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{settings.openweather_api_base_url}/forecast",
            params=params,
        )
        response.raise_for_status()
        data = response.json()

    timezone_offset = data["city"]["timezone"]
    hourly = []
    daily_map: dict[str, dict] = {}

    for entry in data["list"][:8]:
        condition = entry["weather"][0]["main"]
        hourly.append(
            {
                "time": _format_hour(entry["dt"], timezone_offset),
                "temperatureC": round(entry["main"]["temp"]),
                "feelsLikeC": round(entry["main"].get("feels_like", entry["main"]["temp"])),
                "precipitationProbability": round(float(entry.get("pop", 0.0)) * 100),
                "icon": _condition_icon(condition),
                "summary": entry["weather"][0]["description"].capitalize(),
            }
        )

    if hourly:
        expanded_hourly: list[dict] = []
        for index in range(24):
            source = hourly[min(index // 3, len(hourly) - 1)]
            expanded_hourly.append(
                {
                    "time": _format_hour(data["list"][0]["dt"] + index * 3600, timezone_offset),
                    "temperatureC": source["temperatureC"],
                    "feelsLikeC": source["feelsLikeC"],
                    "precipitationProbability": source["precipitationProbability"],
                    "icon": source["icon"],
                    "summary": source["summary"],
                }
            )
    else:
        expanded_hourly = _mock_hourly(18, "cloud", 0)

    for entry in data["list"]:
        condition = entry["weather"][0]["main"]
        day_key = _format_day(entry["dt"], timezone_offset)
        daily_entry = daily_map.setdefault(
            day_key,
            {
                "day": day_key,
                "summary": entry["weather"][0]["description"].capitalize(),
                "lowC": round(entry["main"]["temp_min"]),
                "highC": round(entry["main"]["temp_max"]),
                "icon": _condition_icon(condition),
                "precipitationProbability": round(float(entry.get("pop", 0.0)) * 100),
                "sunrise": _format_hour(entry.get("dt", 0), timezone_offset),
                "sunset": _format_hour(entry.get("dt", 0), timezone_offset),
            },
        )
        daily_entry["lowC"] = min(daily_entry["lowC"], round(entry["main"]["temp_min"]))
        daily_entry["highC"] = max(daily_entry["highC"], round(entry["main"]["temp_max"]))

    return {
        "location": data["city"]["name"],
        "hourly": expanded_hourly,
        "daily": list(daily_map.values())[:5],
    }


async def resolve_location(settings: Settings, query: str) -> list[dict]:
    if not settings.openweather_api_key:
        name, country = _parse_city(query)
        return [{"name": name, "state": None, "country": country or "", "lat": 0.0, "lon": 0.0}]

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{settings.openweather_geo_base_url}/direct",
            params={"q": query, "limit": 5, "appid": settings.openweather_api_key},
        )
        response.raise_for_status()
        results = [_build_location_from_geocode(item) for item in response.json()]

        # If OpenWeather returns no results, try a fallback to OpenStreetMap Nominatim
        if not results:
            try:
                nom = await client.get("https://nominatim.openstreetmap.org/search", params={"q": query, "format": "json", "limit": 5})
                nom.raise_for_status()
                nom_items = nom.json()
                nom_results = []
                for item in nom_items:
                    nom_results.append({
                        "name": item.get("display_name", query),
                        "state": None,
                        "country": item.get("display_name", "").split(",")[-1].strip() if item.get("display_name") else "",
                        "lat": float(item.get("lat", 0.0)),
                        "lon": float(item.get("lon", 0.0)),
                    })
                if nom_results:
                    return nom_results
            except Exception:
                # ignore nominatim failures and return original empty results
                pass

        return results


async def resolve_current_location() -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        providers = [
            "https://ipapi.co/json/",
            "https://ipinfo.io/json",
        ]

        data = None
        for url in providers:
            try:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
                break
            except Exception:
                continue

        if data is None:
            raise RuntimeError("Unable to detect your current location.")

    city = data.get("city") or "Current location"
    region = data.get("region") or None
    country = data.get("country_name") or data.get("country") or None
    latitude = float(data.get("latitude") or 0.0)
    longitude = float(data.get("longitude") or 0.0)

    if not latitude and not longitude and data.get("loc"):
        try:
            lat_text, lon_text = str(data["loc"]).split(",", 1)
            latitude = float(lat_text)
            longitude = float(lon_text)
        except Exception:
            pass

    if not latitude and not longitude:
        raise RuntimeError("Unable to detect your current location.")

    return {
        "label": _location_label(city, region, country),
        "city": city,
        "region": region,
        "country": country,
        "lat": latitude,
        "lon": longitude,
    }


async def _resolve_bundle(settings: Settings, city: str | None = None, lat: float | None = None, lon: float | None = None) -> dict:
    if not settings.openweather_api_key:
        return _build_mock_bundle(city)
    try:
        if lat is not None and lon is not None:
            locations = await resolve_location_by_coordinates(settings, lat, lon)
        else:
            locations = await resolve_location(settings, city or "")
        if not locations:
            raise ValueError(f"No location found for {city or 'the selected coordinates'}")

        location = locations[0]
        latitude = location["lat"]
        longitude = location["lon"]

        async with httpx.AsyncClient(timeout=20) as client:
            params: dict[str, object] = {
                "units": "metric",
                "appid": settings.openweather_api_key,
                "exclude": "minutely,alerts",
            }

            if lat is not None and lon is not None:
                params["lat"] = lat
                params["lon"] = lon
            else:
                params["lat"] = latitude
                params["lon"] = longitude

            response = await client.get(
                settings.openweather_onecall_base_url,
                params=params,
            )
            response.raise_for_status()
            data = response.json()

        timezone_offset = data.get("timezone_offset", 0)
        current_weather = data["current"]["weather"][0] if data["current"].get("weather") else {"main": "Clouds", "description": "cloudy"}
        condition = current_weather.get("main", "Clouds")
        description = current_weather.get("description", "cloudy").capitalize()
        current_timestamp = data["current"]["dt"]
        sunrise_timestamp = data["current"].get("sunrise", current_timestamp)
        sunset_timestamp = data["current"].get("sunset", current_timestamp)
        location_name = _location_label(location["name"], location.get("state"), location.get("country"))

        bundle = {
            "location": location_name,
            "current": {
                "city": location["name"],
                "country": location.get("country"),
                "latitude": latitude,
                "longitude": longitude,
                "temperatureC": round(data["current"]["temp"]),
                "feelsLikeC": round(data["current"]["feels_like"]),
                "humidity": data["current"]["humidity"],
                "pressure": data["current"]["pressure"],
                "dewPointC": round(data["current"].get("dew_point", data["current"]["feels_like"])),
                "aqi": aqi_val,
                "uvIndex": round(float(data["current"].get("uvi", 0.0)), 1),
                "visibilityKm": round(float(data["current"].get("visibility", 0)) / 1000, 1),
                "windSpeedKmh": round(float(data["current"].get("wind_speed", 0.0)) * 3.6, 1),
                "windDirection": _wind_direction(data["current"].get("wind_deg")),
                "windGustKmh": round(float(data["current"].get("wind_gust", data["current"].get("wind_speed", 0.0))) * 3.6, 1),
                "sunrise": _format_hour(sunrise_timestamp, timezone_offset),
                "sunset": _format_hour(sunset_timestamp, timezone_offset),
                "condition": condition,
                "description": description,
                "updatedAt": _format_date(current_timestamp, timezone_offset),
            },
            "hourly": [],
            "daily": [],
        }

        for entry in data.get("hourly", [])[:24]:
            weather = entry["weather"][0] if entry.get("weather") else {"main": "Clouds", "description": "cloudy"}
            bundle["hourly"].append(
                {
                    "time": _format_hour(entry["dt"], timezone_offset),
                    "temperatureC": round(entry["temp"]),
                    "feelsLikeC": round(entry.get("feels_like", entry["temp"])),
                    "precipitationProbability": round(float(entry.get("pop", 0.0)) * 100),
                    "icon": _condition_icon(weather.get("main", "Clouds")),
                    "summary": weather.get("description", weather.get("main", "Clouds")).capitalize(),
                }
            )

        for entry in data.get("daily", [])[:7]:
            weather = entry["weather"][0] if entry.get("weather") else {"main": "Clouds", "description": "cloudy"}
            bundle["daily"].append(
                {
                    "day": _format_day(entry["dt"], timezone_offset),
                    "summary": weather.get("description", weather.get("main", "Clouds")).capitalize(),
                    "lowC": round(entry["temp"]["min"]),
                    "highC": round(entry["temp"]["max"]),
                    "icon": _condition_icon(weather.get("main", "Clouds")),
                    "precipitationProbability": round(float(entry.get("pop", 0.0)) * 100),
                    "sunrise": _format_hour(entry.get("sunrise", current_timestamp), timezone_offset),
                    "sunset": _format_hour(entry.get("sunset", current_timestamp), timezone_offset),
                }
            )

        return bundle
    except httpx.HTTPStatusError:
        current = await _fetch_live_current(settings, city, lat, lon)
        forecast = await _fetch_live_forecast(settings, city, lat, lon)
        return {"location": f"{current['city']}, {current['country']}" if current.get("country") else current["city"], "current": current, "hourly": forecast["hourly"], "daily": forecast["daily"]}


async def fetch_weather_bundle(settings: Settings, city: str, lat: float | None = None, lon: float | None = None) -> dict:
    return await _resolve_bundle(settings, city, lat, lon)


async def _fetch_historical_day(settings: Settings, lat: float, lon: float, timestamp: int) -> dict:
    params = {"lat": lat, "lon": lon, "dt": int(timestamp), "units": "metric", "appid": settings.openweather_api_key}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(f"{settings.openweather_onecall_base_url}/timemachine", params=params)
        response.raise_for_status()
        return response.json()


async def fetch_weather_range(settings: Settings, city: str, start_date: "date", end_date: "date", lat: float | None = None, lon: float | None = None) -> dict:
    """Fetch weather data covering the requested date range.
    This will use the One Call current/forecast bundle for recent/future days and
    call the Time Machine endpoint for historical dates (one request per day).
    Note: historical Time Machine access may be limited by the OpenWeather plan.
    """
    # Resolve base bundle for forecast/current
    base = await _resolve_bundle(settings, city, lat, lon)

    # Build date list from start_date to end_date inclusive
    days = []
    cur = start_date
    from datetime import timedelta as _td

    while cur <= end_date:
        days.append(cur)
        cur = cur + _td(days=1)

    combined_daily: list[dict] = []
    combined_hourly: list[dict] = []
    # map of date (YYYY-MM-DD) -> daily entry for deterministic coverage
    combined_daily_map: dict[str, dict] = {}

    today_utc = datetime.now(timezone.utc).date()

    # For each requested day, if it's in the future or today use base.daily when possible,
    # otherwise call time machine for historical days.
    for day in days:
        date_key = day.isoformat()
        if day >= today_utc:
            # try to find matching day in base.daily by string match of formatted day
            matched = None
            for d in base.get("daily", []):
                if isinstance(d.get("day"), str) and d.get("day").startswith(day.strftime("%A, %d %B")):
                    matched = d
                    break
            if matched:
                # set a machine-friendly date key
                entry = dict(matched)
                entry.setdefault("date", day.isoformat())
                # ensure primary temperature field (use highC when available)
                entry.setdefault("temperature", entry.get("highC", entry.get("lowC", entry.get("temperatureC", 0))))
                combined_daily_map[date_key] = entry
            else:
                # fallback to a simple entry using current values
                entry = {
                    "date": day.isoformat(),
                    "day": day.strftime("%A, %d %B"),
                    "summary": base["current"].get("description", ""),
                    "lowC": base["current"].get("temperatureC", 0),
                    "highC": base["current"].get("temperatureC", 0),
                    "icon": "cloud",
                    "precipitationProbability": 0,
                    "sunrise": base["current"].get("sunrise"),
                    "sunset": base["current"].get("sunset"),
                }
                entry["temperature"] = entry.get("highC", entry.get("lowC", 0))
                combined_daily_map[date_key] = entry
            # for hourly, include base.hourly if it matches day
            for h in base.get("hourly", []):
                # hourly times are 'HH:MM' strings; we cannot robustly map them here, skip
                continue
        else:
            # historical: need coordinates
            latitude = lat or base.get("current", {}).get("latitude")
            longitude = lon or base.get("current", {}).get("longitude")
            if not latitude or not longitude:
                raise ValueError("Missing coordinates for historical data retrieval.")
            # Use noon UTC of the day as timestamp
            ts = int(datetime(day.year, day.month, day.day, 12, tzinfo=timezone.utc).timestamp())
            try:
                hist = await _fetch_historical_day(settings, float(latitude), float(longitude), ts)
            except httpx.HTTPStatusError as exc:
                # If unauthorized or forbidden, try Open-Meteo fallback for the remaining range
                status = None
                try:
                    status = exc.response.status_code
                except Exception:
                    status = None

                if status in (401, 403):
                    from app.services.open_meteo import fetch_open_meteo_range
                    from fastapi import HTTPException

                    # fetch the remaining historical span (from this day to last historical day)
                    rem_start = day.strftime("%Y-%m-%d")
                    # clamp rem_end to today UTC because Open-Meteo archive does not accept future dates
                    rem_end_date = min(end_date, today_utc)
                    rem_end = rem_end_date.strftime("%Y-%m-%d")
                    try:
                        om = await fetch_open_meteo_range(float(latitude), float(longitude), rem_start, rem_end)
                    except Exception as e:
                        # network/DNS or remote error when contacting Open-Meteo
                        raise HTTPException(status_code=502, detail=f"Open-Meteo request failed: {e}")

                        # convert and append - map by ISO date if available
                        for d in om.get("daily", []):
                            d_date = d.get("date")
                            if d_date:
                                entry = dict(d)
                                entry.setdefault("temperature", entry.get("highC", entry.get("lowC", 0)))
                                combined_daily_map[d_date] = entry
                            else:
                                # fallback: use day string as key (not ideal)
                                combined_daily.append(d)
                        for h in om.get("hourly", []):
                            combined_hourly.append(h)

                    # we've consumed remaining historical days
                    break
                # otherwise re-raise so caller can handle rate limits or other errors
                raise

            # Build a daily summary from hourly
            hours = hist.get("hourly", [])
            if not hours:
                continue
            temps = [int(h.get("temp", 0)) for h in hours]
            pops = [int(round(float(h.get("pop", 0.0)) * 100)) for h in hours if h.get("pop") is not None]
            summary = hours[0].get("weather", [{}])[0].get("description", "").capitalize()
            entry = {
                "date": date_key,
                "day": day.strftime("%A, %d %B"),
                "summary": summary,
                "lowC": min(temps),
                "highC": max(temps),
                "icon": _condition_icon(hours[0].get("weather", [{}])[0].get("main", "Clouds")),
                "precipitationProbability": max(pops) if pops else 0,
                "sunrise": "",
                "sunset": "",
            }
            entry["temperature"] = entry.get("highC", entry.get("lowC", 0))
            combined_daily_map[date_key] = entry
            for h in hours:
                weather = h.get("weather", [{}])[0]
                combined_hourly.append(
                    {
                        "time": _format_hour(h.get("dt", 0), 0),
                        "temperatureC": round(h.get("temp", 0)),
                        "feelsLikeC": round(h.get("feels_like", h.get("temp", 0))),
                        "precipitationProbability": round(float(h.get("pop", 0.0)) * 100),
                        "icon": _condition_icon(weather.get("main", "Clouds")),
                        "summary": weather.get("description", "").capitalize(),
                    }
                )

    # Ensure every requested day is present in order
    ordered_daily: list[dict] = []
    for day in days:
        key = day.isoformat()
        if key in combined_daily_map:
            ordered_daily.append(combined_daily_map[key])
        else:
            # fallback to base.daily match or current values
            matched = None
            for d in base.get("daily", []):
                if isinstance(d.get("day"), str) and d.get("day").startswith(day.strftime("%A, %d %B")):
                    matched = dict(d)
                    break
            if matched:
                matched.setdefault("date", key)
                matched.setdefault("temperature", matched.get("highC", matched.get("lowC", 0)))
                ordered_daily.append(matched)
            else:
                entry = {
                    "date": key,
                    "day": day.strftime("%A, %d %B"),
                    "summary": base["current"].get("description", ""),
                    "lowC": base["current"].get("temperatureC", 0),
                    "highC": base["current"].get("temperatureC", 0),
                    "icon": "cloud",
                    "precipitationProbability": 0,
                    "sunrise": base["current"].get("sunrise"),
                    "sunset": base["current"].get("sunset"),
                }
                entry["temperature"] = entry.get("highC", entry.get("lowC", 0))
                ordered_daily.append(entry)

    if not combined_hourly:
        combined_hourly = base.get("hourly", [])

    return {"location": base.get("location"), "current": base.get("current"), "hourly": combined_hourly, "daily": ordered_daily}


async def fetch_current_weather(settings: Settings, city: str, lat: float | None = None, lon: float | None = None) -> dict:
    if not settings.openweather_api_key:
        return _build_mock_bundle(city)["current"]
    try:
        return await _fetch_live_current(settings, city, lat, lon)
    except httpx.HTTPStatusError:
        return (await _resolve_bundle(settings, city, lat, lon))["current"]


async def fetch_forecast(settings: Settings, city: str, lat: float | None = None, lon: float | None = None) -> dict:
    if not settings.openweather_api_key:
        bundle = _build_mock_bundle(city)
        return {"location": bundle["location"], "hourly": bundle["hourly"], "daily": bundle["daily"]}
    try:
        forecast = await _fetch_live_forecast(settings, city, lat, lon)
        return {"location": city, "hourly": forecast["hourly"], "daily": forecast["daily"]}
    except httpx.HTTPStatusError:
        bundle = await _resolve_bundle(settings, city, lat, lon)
        return {"location": bundle["location"], "hourly": bundle["hourly"], "daily": bundle["daily"]}