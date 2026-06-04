import type { WeatherTheme } from './weather';

export function generateAlerts(weather: WeatherTheme | null): string[] {
  if (!weather) return [];
  const alerts: string[] = [];
  const summary = (weather.summary || '').toLowerCase();
  const precipProb = weather.precipitationProbability ?? 0;

  // AQI-based alerts (prioritised)
  const usAqi = weather.usAqi ?? undefined;
  if (usAqi != null) {
    if (usAqi >= 301) {
      alerts.push('Air quality is Hazardous — avoid all outdoor activity; wear a respirator if you must go outside.');
    } else if (usAqi >= 201) {
      alerts.push('Very Unhealthy air quality — avoid outdoor activity and wear a high-quality mask (N95) if outside.');
    } else if (usAqi >= 151) {
      alerts.push('Unhealthy air quality — wear a high-quality mask (N95) when outdoors and limit strenuous activity.');
    } else if (usAqi >= 101) {
      alerts.push('Air quality unhealthy for sensitive groups — consider wearing a mask and reduce prolonged outdoor exertion.');
    }
  }

  if (summary.includes('rain') || precipProb > 30) alerts.push('Carry an umbrella.');
  if ((weather.temperatureC ?? 0) >= 30) alerts.push("It's going to be hot — stay hydrated / use sun protection.");
  if ((weather.temperatureC ?? 0) <= 5) alerts.push('Very cold — wear warm clothes.');

  // extract numeric wind speed from `weather.wind` like "North 12.3 km/h"
  const windMatch = (weather.wind || '').match(/([0-9]+(?:\.[0-9]+)?)[^0-9]*km\/h/);
  const windKmh = windMatch ? parseFloat(windMatch[1]) : 0;
  if (windKmh > 36) alerts.push('Expect strong winds — secure loose items.');

  return alerts;
}
