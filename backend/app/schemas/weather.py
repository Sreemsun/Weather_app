from datetime import date

from pydantic import BaseModel, Field


class LocationResult(BaseModel):
    name: str
    state: str | None = None
    country: str
    lat: float
    lon: float


class WeatherCondition(BaseModel):
    main: str
    description: str
    icon: str


class WeatherSnapshot(BaseModel):
    city: str
    country: str | None = None
    latitude: float = Field(alias="latitude")
    longitude: float = Field(alias="longitude")
    temperature_c: int = Field(alias="temperatureC")
    feels_like_c: int = Field(alias="feelsLikeC")
    humidity: int
    pressure: int
    dew_point_c: int = Field(alias="dewPointC")
    uv_index: float = Field(alias="uvIndex")
    visibility_km: float = Field(alias="visibilityKm")
    wind_speed_kmh: float = Field(alias="windSpeedKmh")
    wind_direction: str = Field(alias="windDirection")
    wind_gust_kmh: float = Field(alias="windGustKmh")
    sunrise: str
    sunset: str
    condition: str
    description: str
    updated_at: str = Field(alias="updatedAt")


class ForecastHour(BaseModel):
    time: str
    temperature_c: int = Field(alias="temperatureC")
    feels_like_c: int = Field(alias="feelsLikeC")
    precipitation_probability: int = Field(alias="precipitationProbability")
    icon: str
    summary: str


class ForecastDay(BaseModel):
    day: str
    summary: str
    low_c: int = Field(alias="lowC")
    high_c: int = Field(alias="highC")
    icon: str
    precipitation_probability: int = Field(alias="precipitationProbability")
    sunrise: str
    sunset: str


class WeatherBundle(BaseModel):
    location: str
    current: WeatherSnapshot
    hourly: list[ForecastHour]
    daily: list[ForecastDay]


class SaveWeatherHistoryRequest(BaseModel):
    city: str = Field(default="", min_length=0)
    lat: float | None = None
    lon: float | None = None
    start_date: date = Field(alias="startDate")
    end_date: date = Field(alias="endDate")


class WeatherHistoryRecord(BaseModel):
    id: int
    location: str
    city: str
    country: str | None = None
    latitude: float = Field(alias="lat")
    longitude: float = Field(alias="lon")
    start_date: date = Field(alias="startDate")
    end_date: date = Field(alias="endDate")
    saved_at: str = Field(alias="savedAt")
    bundle: WeatherBundle
