export type WeatherKey = 'rain' | 'clouds' | 'sun' | 'snow' | 'storm';

export type LocationResult = {
  name: string;
  state?: string | null;
  country: string;
  lat: number;
  lon: number;
};

export type WeatherTheme = {
  name: string;
  summary: string;
  temperatureC: number;
  feelsLikeC: number;
  wind: string;
  location: string;
  date: string;
  time: string;
  humidity: number;
  pressure: number;
  aqi?: number;
  aqiComponents?: { pm2_5?: number; pm10?: number };
  usAqi?: number;
  usAqiCategory?: string;
  usAqiColor?: string;
  visibilityKm: number;
  uvIndex: number;
  sunrise: string;
  sunset: string;
  windGust: string;
  precipitationProbability: number;
  hourly: Array<{ time: string; temp: number; feelsLike: number; precipitationProbability: number; icon: string; summary: string }>;
  daily: Array<{ day: string; summary: string; low: number; high: number; icon: string; precipitationProbability: number; sunrise: string; sunset: string }>;
};

import { computeUS_AQI, aqiCategoryAndColor } from './aqi';

export type WeatherHistoryRecord = {
  id: number;
  location: string;
  city: string;
  country?: string | null;
  lat: number;
  lon: number;
  startDate: string;
  endDate: string;
  savedAt: string;
  summary: string;
  temperatureC?: number;
  bundle: WeatherBundleResponse;
};

type WeatherBundleResponse = {
  location: string;
  current: {
    city: string;
    country?: string | null;
    temperatureC?: number;
    temperature_c?: number;
    feelsLikeC?: number;
    feels_like_c?: number;
    humidity: number;
    pressure: number;
    dewPointC?: number;
    dew_point_c?: number;
    uvIndex?: number;
    aqi?: number;
    visibilityKm?: number;
    visibility_km?: number;
    windSpeedKmh?: number;
    wind_speed_kmh?: number;
    windDirection?: string;
    wind_direction?: string;
    windGustKmh?: number;
    wind_gust_kmh?: number;
    sunrise: string;
    sunset: string;
    condition: string;
    description: string;
    updatedAt?: string;
    updated_at?: string;
    components?: { pm2_5?: number; pm10?: number };
  };
  hourly: Array<{ time: string; temperatureC?: number; temperature_c?: number; feelsLikeC?: number; feels_like_c?: number; precipitationProbability?: number; precipitation_probability?: number; icon: string; summary: string }>;
  daily: Array<{ day: string; summary: string; lowC?: number; low_c?: number; highC?: number; high_c?: number; precipitationProbability?: number; precipitation_probability?: number; sunrise: string; sunset: string; icon: string }>;
};

export const presetCities: Record<WeatherKey, string> = {
  rain: 'Tbilisi, Georgia',
  clouds: 'Reykjavik, Iceland',
  sun: 'Lisbon, Portugal',
  snow: 'Oslo, Norway',
  storm: 'Miami, Florida',
};

export function mapConditionToThemeKey(condition: string): WeatherKey {
  const normalized = condition.toLowerCase();

  if (normalized.includes('clear') || normalized.includes('sun')) return 'sun';
  if (normalized.includes('cloud')) return 'clouds';
  if (normalized.includes('rain') || normalized.includes('drizzle')) return 'rain';
  if (normalized.includes('snow')) return 'snow';
  if (normalized.includes('storm') || normalized.includes('thunder')) return 'storm';
  if (normalized.includes('fog') || normalized.includes('mist') || normalized.includes('haze')) return 'clouds';

  return 'clouds';
}

const apiBaseUrl = import.meta.env.VITE_BACKEND_API_URL ?? 'http://localhost:8000';

export async function searchLocations(query: string): Promise<LocationResult[]> {
  const response = await fetch(`${apiBaseUrl}/api/locations/search?q=${encodeURIComponent(query)}`);

  if (!response.ok) {
    throw new Error('Location search failed.');
  }

  return (await response.json()) as LocationResult[];
}

export async function fetchCurrentLocation(): Promise<{ label: string; lat: number; lon: number }> {
  const response = await fetch(`${apiBaseUrl}/api/location/current`);

  if (!response.ok) {
    throw new Error('Unable to detect your current location.');
  }

  return (await response.json()) as { label: string; lat: number; lon: number };
}

export async function fetchWeatherTheme(city: string, coordinates?: { lat: number; lon: number }): Promise<WeatherTheme> {
  const query = new URLSearchParams();

  if (city) {
    query.set('city', city);
  }

  if (coordinates) {
    query.set('lat', String(coordinates.lat));
    query.set('lon', String(coordinates.lon));
  }

  const response = await fetch(`${apiBaseUrl}/api/weather/bundle?${query.toString()}`);

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, city));
  }

  const bundle = (await response.json()) as WeatherBundleResponse;

  // If the backend bundle lacks AQI, attempt to fetch it via proxy endpoint
  if ((bundle.current as any).aqi == null && (coordinates?.lat || (bundle.current as any).latitude)) {
    try {
      const lat = coordinates?.lat ?? (bundle.current as any).latitude ?? 0;
      const lon = coordinates?.lon ?? (bundle.current as any).longitude ?? 0;
      const aqiResp = await fetch(`${apiBaseUrl}/api/weather/aqi?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`);
      if (aqiResp.ok) {
        const j = await aqiResp.json();
        (bundle.current as any).aqi = j?.aqi ?? null;
        (bundle.current as any).components = j?.components ?? null;
      }
    } catch (e) {
      // ignore aqi fetch errors and continue
    }
  }

  return buildWeatherTheme(bundle);
}

export function buildWeatherTheme(bundle: WeatherBundleResponse): WeatherTheme {
  const currentTemperature = bundle.current.temperatureC ?? bundle.current.temperature_c ?? 0;
  const feelsLike = bundle.current.feelsLikeC ?? bundle.current.feels_like_c ?? currentTemperature;
  const currentWindSpeed = bundle.current.windSpeedKmh ?? bundle.current.wind_speed_kmh ?? 0;
  const currentWindDirection = bundle.current.windDirection ?? bundle.current.wind_direction ?? 'Calm';
  const windGust = bundle.current.windGustKmh ?? bundle.current.wind_gust_kmh ?? currentWindSpeed;
  const updatedAt = bundle.current.updatedAt ?? bundle.current.updated_at ?? new Date().toISOString();
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(updatedAt));
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(updatedAt));

  const hourly = bundle.hourly.slice(0, 24).map((entry) => ({
    time: entry.time,
    temp: Math.round(entry.temperatureC ?? entry.temperature_c ?? 0),
    feelsLike: Math.round(entry.feelsLikeC ?? entry.feels_like_c ?? entry.temperatureC ?? entry.temperature_c ?? 0),
    precipitationProbability: Math.round(entry.precipitationProbability ?? entry.precipitation_probability ?? 0),
    icon: entry.icon,
    summary: entry.summary,
  }));

  const daily = bundle.daily.map((entry) => ({
    day: entry.day,
    summary: entry.summary,
    low: Math.round(entry.lowC ?? entry.low_c ?? 0),
    high: Math.round(entry.highC ?? entry.high_c ?? 0),
    precipitationProbability: Math.round(entry.precipitationProbability ?? entry.precipitation_probability ?? 0),
    sunrise: entry.sunrise,
    sunset: entry.sunset,
    icon: entry.icon,
  }));

  // compute US EPA AQI from available components (prefer PM2.5, fallback to PM10)
  const comps = (bundle.current as any).components ?? null;
  const pm25 = comps?.pm2_5 ?? comps?.pm25 ?? null;
  const pm10 = comps?.pm10 ?? null;
  const usAqiResult = computeUS_AQI(pm25 ?? undefined, pm10 ?? undefined);
  const usAqiValue = usAqiResult.aqi;
  const aqiMeta = aqiCategoryAndColor(usAqiValue);
  // If US AQI couldn't be computed from components, but OpenWeather provided an ordinal AQI (1-5),
  // map it to an approximate US AQI value so UI and alerts can still work.
  let finalUsAqi = usAqiValue ?? undefined;
  if (finalUsAqi == null && bundle.current.aqi != null) {
    const ordinal = Number(bundle.current.aqi);
    // approximate mapping: 1->Good(25), 2->Moderate(75), 3->Unhealthy for SG(125), 4->Unhealthy(175), 5->Hazardous(350)
    const mapping: Record<number, number> = { 1: 25, 2: 75, 3: 125, 4: 175, 5: 350 };
    finalUsAqi = mapping[ordinal] ?? undefined;
  }
  const finalAqiMeta = aqiCategoryAndColor(finalUsAqi);

  return {
    name: formatConditionLabel(bundle.current.condition),
    summary: formatSummary(bundle.current.description),
    temperatureC: Math.round(currentTemperature),
    feelsLikeC: Math.round(feelsLike),
    wind: `${currentWindDirection} ${currentWindSpeed.toFixed(1)} km/h`,
    location: bundle.location,
    date,
    time,
    humidity: bundle.current.humidity,
    pressure: bundle.current.pressure,
    aqi: bundle.current.aqi ? Math.round(bundle.current.aqi as number) : undefined,
    aqiComponents: {
      pm2_5: (bundle.current as any).components?.pm2_5,
      pm10: (bundle.current as any).components?.pm10,
    },
    usAqi: finalUsAqi ?? undefined,
    usAqiCategory: finalAqiMeta.category,
    usAqiColor: finalAqiMeta.color,
    visibilityKm: Number((bundle.current.visibilityKm ?? bundle.current.visibility_km ?? 0).toFixed(1)),
    uvIndex: Number((bundle.current.uvIndex ?? (bundle.current as any).uv_index ?? 0).toFixed(1)),
    sunrise: bundle.current.sunrise,
    sunset: bundle.current.sunset,
    windGust: `${windGust.toFixed(1)} km/h`,
    precipitationProbability: Math.round(bundle.hourly[0]?.precipitationProbability ?? bundle.hourly[0]?.precipitation_probability ?? 0),
    hourly,
    daily,
  };
}

export async function saveWeatherHistory(payload: {
  city: string;
  startDate: string;
  endDate: string;
  coordinates?: { lat: number; lon: number };
}): Promise<WeatherHistoryRecord> {
  const response = await fetch(`${apiBaseUrl}/api/weather/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: payload.city,
      lat: payload.coordinates?.lat,
      lon: payload.coordinates?.lon,
      startDate: payload.startDate,
      endDate: payload.endDate,
    }),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, payload.city || 'the selected location'));
  }

  return (await response.json()) as WeatherHistoryRecord;
}

export async function updateWeatherHistory(recordId: number, payload: {
  city: string;
  startDate: string;
  endDate: string;
  coordinates?: { lat: number; lon: number };
}): Promise<WeatherHistoryRecord> {
  const response = await fetch(`${apiBaseUrl}/api/weather/history/${recordId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: payload.city,
      lat: payload.coordinates?.lat,
      lon: payload.coordinates?.lon,
      startDate: payload.startDate,
      endDate: payload.endDate,
    }),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, payload.city || 'the selected location'));
  }

  return (await response.json()) as WeatherHistoryRecord;
}

export async function deleteWeatherHistory(recordId: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/weather/history/${recordId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Unable to delete saved weather history.');
  }
}

export async function fetchWeatherRangePreview(payload: {
  city: string;
  startDate: string;
  endDate: string;
  coordinates?: { lat: number; lon: number };
}): Promise<WeatherHistoryRecord> {
  const response = await fetch(`${apiBaseUrl}/api/weather/history/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: payload.city,
      lat: payload.coordinates?.lat,
      lon: payload.coordinates?.lon,
      startDate: payload.startDate,
      endDate: payload.endDate,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    const message = text || 'Unable to fetch preview for the selected range.';
    throw new Error(message);
  }

  return (await response.json()) as WeatherHistoryRecord;
}

export async function fetchLocationVideos(query: string, maxResults = 6): Promise<Array<{id:string,title:string,channelTitle:string,publishedAt:string,thumbnail?:string}>> {
  const response = await fetch(`${apiBaseUrl}/api/videos/search?q=${encodeURIComponent(query)}&maxResults=${maxResults}`);

  if (!response.ok) {
    throw new Error('Unable to fetch videos for the location.');
  }

  return (await response.json()) as Array<{id:string,title:string,channelTitle:string,publishedAt:string,thumbnail?:string}>;
}

export async function listWeatherHistory(filters?: {
  location?: string;
  startDate?: string;
  endDate?: string;
}): Promise<WeatherHistoryRecord[]> {
  const query = new URLSearchParams();

  if (filters?.location) query.set('location', filters.location);
  if (filters?.startDate) query.set('startDate', filters.startDate);
  if (filters?.endDate) query.set('endDate', filters.endDate);

  const response = await fetch(`${apiBaseUrl}/api/weather/history?${query.toString()}`);

  if (!response.ok) {
    throw new Error('Unable to load saved weather history.');
  }

  return (await response.json()) as WeatherHistoryRecord[];
}

function formatConditionLabel(condition: string) {
  const normalized = condition.toLowerCase();

  if (normalized === 'clear') {
    return 'Clear and Bright';
  }

  if (normalized === 'clouds') {
    return 'Overcast Sky';
  }

  if (normalized === 'rain' || normalized === 'drizzle') {
    return 'Heavy Rain';
  }

  if (normalized === 'snow') {
    return 'Snowfall';
  }

  if (normalized === 'thunderstorm') {
    return 'Thunder Storm';
  }

  if (normalized === 'mist' || normalized === 'fog' || normalized === 'haze') {
    return 'Morning Fog';
  }

  return condition;
}

function formatSummary(description: string) {
  return description.charAt(0).toUpperCase() + description.slice(1);
}

export function mapConditionToIcon(condition: string) {
  const normalized = condition.toLowerCase();

  if (normalized === 'clear') return 'sun';
  if (normalized === 'clouds') return 'cloud';
  if (normalized === 'rain' || normalized === 'drizzle') return 'rain';
  if (normalized === 'snow') return 'snow';
  if (normalized === 'thunderstorm') return 'storm';
  if (normalized === 'mist' || normalized === 'fog' || normalized === 'haze') return 'fog';

  return 'cloud';
}

async function getErrorMessage(response: Response, city: string) {
  const target = city || 'the selected location';
  return `Could not load live weather for ${target}. Please check the location name or use current location.`;
}
