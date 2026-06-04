import React, { useEffect, useRef, useState } from 'react';
import { fetchWeatherTheme } from '../lib/weather';

export default function LocationMap({ coords, weather, height = 320 }: { coords?: { lat: number; lon: number } | null; weather?: any | null; height?: number }) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [popupWeather, setPopupWeather] = useState<any | null>(weather ?? null);

  useEffect(() => {
    // ensure Leaflet CSS is loaded
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet', '');
      document.head.appendChild(link);
    }

    function initWhenReady() {
      const L = (window as any).L;
      if (!L || !mapDivRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(mapDivRef.current, { zoomControl: true, attributionControl: false }).setView([coords?.lat ?? 0, coords?.lon ?? 0], coords ? 10 : 2);
        // place zoom control top-right for better placement in the UI
        if (mapRef.current.zoomControl) {
          mapRef.current.zoomControl.setPosition('topright');
        }
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapRef.current);
      }

      // leave marker/popup creation to separate effect that listens to popupWeather
    }

    if (!(window as any).L) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => initWhenReady();
      document.body.appendChild(script);
    } else {
      initWhenReady();
    }

    return () => {
      try {
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lon]);

  // Keep popupWeather in sync with incoming prop
  useEffect(() => {
    setPopupWeather(weather ?? null);
  }, [weather]);

  // Fetch weather when coords change and no weather prop provided
  useEffect(() => {
    let mounted = true;
    if (coords && !weather) {
      (async () => {
        try {
          const w = await fetchWeatherTheme('', coords);
          if (mounted) setPopupWeather(w);
        } catch {
          if (mounted) setPopupWeather(null);
        }
      })();
    }

    return () => { mounted = false; };
  }, [coords?.lat, coords?.lon, weather]);

  // Update marker and popup when coords or popupWeather change
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current || !coords) return;

    mapRef.current.setView([coords.lat, coords.lon], 10);

    if (!markerRef.current) {
      markerRef.current = L.marker([coords.lat, coords.lon]).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng([coords.lat, coords.lon]);
    }

    const locLabel = popupWeather?.location ?? '';
    const temp = popupWeather?.temperatureC != null ? `${Math.round(popupWeather.temperatureC)}°C` : '—';
    // Prefer the raw summary/description to show the true API value
    const cond = popupWeather?.summary ?? popupWeather?.name ?? 'Unknown';
    const popupHtml = `
      <div class="map-popup" style="min-width:180px">
        <strong>${locLabel}</strong>
        <div style="height:8px"></div>
        <div class="map-popup-row">
          <div class="map-temp">${temp}</div>
          <div class="map-cond">${cond}</div>
        </div>
      </div>
    `;

    markerRef.current.bindPopup(popupHtml);
    markerRef.current.openPopup();
  }, [coords?.lat, coords?.lon, popupWeather]);

  return (
    <div style={{ width: '100%' }}>
      <div ref={mapDivRef} style={{ height: height, width: '100%', borderRadius: 12, overflow: 'hidden' }} />
    </div>
  );
}
