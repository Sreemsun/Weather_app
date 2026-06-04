from __future__ import annotations

from datetime import datetime, timezone

import httpx


def _hour_label(iso: str) -> str:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%H:%M")
    except Exception:
        return iso


def _day_label(iso: str) -> str:
    try:
        dt = datetime.fromisoformat(iso)
        return dt.strftime("%A, %d %B")
    except Exception:
        return iso


async def fetch_open_meteo_range(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    """Call Open-Meteo to retrieve hourly and daily historical data for the given date range.
    Returns dict with `hourly` and `daily` lists similar to our bundle shape.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": "temperature_2m,apparent_temperature,precipitation_probability,weathercode",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset",
        "timezone": "UTC",
    }

    # ERA5 historical data is provided via the archive API endpoint.
    urls_to_try = [
        "https://archive-api.open-meteo.com/v1/era5",
        "https://archive.open-meteo.com/v1/era5",
    ]

    data = None
    async with httpx.AsyncClient(timeout=30) as client:
        last_exc = None
        for url in urls_to_try:
            try:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
                break
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                # try next URL on 404 or other status
                continue
        if data is None:
            # re-raise the last exception or a generic error
            if last_exc:
                raise last_exc
            raise RuntimeError("Open-Meteo historical API request failed")

    hourly = []
    h_times = data.get("hourly", {}).get("time", [])
    temps = data.get("hourly", {}).get("temperature_2m", [])
    feels = data.get("hourly", {}).get("apparent_temperature", [])
    pops = data.get("hourly", {}).get("precipitation_probability", [])
    wcodes = data.get("hourly", {}).get("weathercode", [])

    for i, t in enumerate(h_times):
        temp = temps[i] if i < len(temps) and temps[i] is not None else 0
        feel = feels[i] if i < len(feels) and feels[i] is not None else temp
        pop = pops[i] if i < len(pops) and pops[i] is not None else 0
        wcode = wcodes[i] if i < len(wcodes) and wcodes[i] is not None else 0
        hourly.append(
            {
                "time": _hour_label(t),
                "temperatureC": round(float(temp)),
                "feelsLikeC": round(float(feel)),
                "precipitationProbability": int(round(float(pop))) if pop is not None else 0,
                "icon": "cloud" if int(wcode) != 0 else "sun",
                "summary": "",
            }
        )

    daily = []
    d_times = data.get("daily", {}).get("time", [])
    d_max = data.get("daily", {}).get("temperature_2m_max", [])
    d_min = data.get("daily", {}).get("temperature_2m_min", [])
    d_prec = data.get("daily", {}).get("precipitation_sum", [])
    sunrise = data.get("daily", {}).get("sunrise", [])
    sunset = data.get("daily", {}).get("sunset", [])

    for i, t in enumerate(d_times):
        dmin = d_min[i] if i < len(d_min) and d_min[i] is not None else 0
        dmax = d_max[i] if i < len(d_max) and d_max[i] is not None else 0
        dprec = d_prec[i] if i < len(d_prec) and d_prec[i] is not None else 0
        sr = sunrise[i] if i < len(sunrise) and sunrise[i] is not None else ""
        ss = sunset[i] if i < len(sunset) and sunset[i] is not None else ""
        daily.append(
            {
                "date": t,
                "day": _day_label(t),
                "summary": "",
                "lowC": round(float(dmin)),
                "highC": round(float(dmax)),
                "icon": "cloud",
                "precipitationProbability": int(round(float(dprec))) if dprec is not None else 0,
                "sunrise": sr,
                "sunset": ss,
            }
        )

    return {"hourly": hourly, "daily": daily}
