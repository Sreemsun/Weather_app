import { useEffect, useState } from 'react';
import { buildWeatherTheme, fetchCurrentLocation, fetchWeatherTheme, listWeatherHistory, mapConditionToThemeKey, saveWeatherHistory, fetchWeatherRangePreview, searchLocations, updateWeatherHistory, deleteWeatherHistory, fetchLocationVideos, type WeatherHistoryRecord, type WeatherTheme } from './lib/weather';
import { generateAlerts } from './lib/alerts';
import AnimatedBackground from './components/AnimatedBackground';
import LocationMap from './components/LocationMap';
import { jsPDF } from 'jspdf';

type RangeKey = '5 days' | '14 days' | '30 days';
type UnitKey = 'C' | 'F';

const ranges: RangeKey[] = ['5 days'];

function sanitizeFileName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'saved_weather';
}

function formatInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return formatInputDate(value);
}

function App() {
  const [range, setRange] = useState<RangeKey>('5 days');
  const [unit, setUnit] = useState<UnitKey>('C');
  const [favorite, setFavorite] = useState(false);
  const [weather, setWeather] = useState<WeatherTheme | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState('');
  const [currentCoordinates, setCurrentCoordinates] = useState<{ lat: number; lon: number } | null>(null);
  const [archiveStartDate, setArchiveStartDate] = useState(formatInputDate(new Date()));
  const [archiveEndDate, setArchiveEndDate] = useState(shiftDays(4));
  const [savedRecords, setSavedRecords] = useState<WeatherHistoryRecord[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [savingRange, setSavingRange] = useState(false);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [selectedRangeRecord, setSelectedRangeRecord] = useState<WeatherHistoryRecord | null>(null);
  const [selectedRangeOpen, setSelectedRangeOpen] = useState(false);
  const [savedDetailOpen, setSavedDetailOpen] = useState(false);
  const [savedRecordView, setSavedRecordView] = useState<WeatherHistoryRecord | null>(null);
  
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editDialogRecord, setEditDialogRecord] = useState<WeatherHistoryRecord | null>(null);
  const [editLocationInput, setEditLocationInput] = useState('');
  const [editArchiveStartDate, setEditArchiveStartDate] = useState(formatInputDate(new Date()));
  const [editArchiveEndDate, setEditArchiveEndDate] = useState(shiftDays(4));
  const [editCoordinates, setEditCoordinates] = useState<{ lat: number; lon: number } | null>(null);
  // Videos state
  const [videos, setVideos] = useState<Array<{id:string,title:string,channelTitle:string,publishedAt:string,thumbnail?:string}>>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [videosExpanded, setVideosExpanded] = useState(false);
  const INITIAL_VIDEO_COUNT = 2;
  const EXPANDED_VIDEO_COUNT = 6;
  // Compare locations state (support multiple)
  const [compareInput, setCompareInput] = useState('');
  const [compareList, setCompareList] = useState<Array<{ label: string; lat: number; lon: number; weather?: WeatherTheme }>>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const loadWeather = async (city: string, coordinates?: { lat: number; lon: number }) => {
    setLoading(true);
    setError(null);
    setWeather(null);

    try {
      const liveWeather = await fetchWeatherTheme(city, coordinates);
      setWeather(liveWeather);
      setLocationInput(liveWeather.location);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not able to retrieve data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSavedWeatherHistory();
    // Load saved records once on mount so existing history appears immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const temperature = weather
    ? unit === 'C'
      ? `${weather.temperatureC}°C`
      : `${Math.round((weather.temperatureC * 9) / 5 + 32)}°F`
    : '--';

  const baseKey = mapConditionToThemeKey(weather?.summary ?? 'clouds');
  // derive theme key with heuristics (precipitation, summary, gusts)
  let derivedKey = baseKey;
  if (weather) {
    const summary = (weather.summary || '').toLowerCase();
    const prob = weather.precipitationProbability ?? 0;
    const hourlyProb = weather.hourly?.[0]?.precipitationProbability ?? 0;
    if (summary.includes('thunder') || summary.includes('storm')) derivedKey = 'storm';
    else if (summary.includes('snow') || weather.temperatureC <= 0) derivedKey = 'snow';
    else if (summary.includes('rain') || prob >= 20 || hourlyProb >= 25) derivedKey = 'rain';
    else if (summary.includes('clear')) derivedKey = 'sun';
  }

  const themeKey = derivedKey as typeof baseKey;
  const backgroundClass = `theme theme-${themeKey}`;
  const emptyMessage = loading
    ? `Loading weather data${locationInput ? ` for ${locationInput}` : ''}…`
    : error
      ? 'Not able to retrieve data.'
      : 'Enter a location to load weather';
  const statusMessage = loading ? 'Updating live data…' : error ? 'Check location' : weather ? 'Live weather' : 'Enter a location';

  

  const handleLocationSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const city = locationInput.trim();

    if (!city) {
      setError('Enter a city or country first.');
      return;
    }

    setLoading(true);
    setError(null);
    setWeather(null);
    setEditingRecordId(null);

    void (async () => {
      try {
        const locations = await searchLocations(city);

        if (!locations.length) {
          setLoading(false);
          setError('Location not found. Try a nearby city.');
          return;
        }

        const location = locations[0];
        const label = [location.name, location.state, location.country].filter(Boolean).join(', ');
        setLocationInput(label);
        setCurrentCoordinates({ lat: location.lat, lon: location.lon });
        await loadWeather(label, { lat: location.lat, lon: location.lon });
      } catch {
        setLoading(false);
        setError('Location search failed. Please try again.');
      }
    })();
  };

  const handleUseCurrentLocation = () => {
    setLoading(true);
    setError(null);
    setWeather(null);
    setLocationInput('Detecting current location…');
    setEditingRecordId(null);

    void (async () => {
      try {
        const currentLocation = await fetchCurrentLocation();
        const coords = { lat: currentLocation.lat, lon: currentLocation.lon };

        if (!coords.lat && !coords.lon) {
          throw new Error('Unable to detect your current location. Please search a city instead.');
        }

        setLocationInput(currentLocation.label || 'Current location');
        setCurrentCoordinates(coords);
        await loadWeather('', coords);
      } catch {
        setLoading(false);
        setError('Unable to detect your current location. Please search a city instead.');
        setLocationInput('');
      }
    })();
  };

  const handleAddCompare = async (event?: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (event && 'preventDefault' in event) event.preventDefault();
    const city = compareInput.trim();
    if (!city) {
      setCompareError('Enter a city or country to compare.');
      return;
    }

    setCompareLoading(true);
    setCompareError(null);

    try {
      const locations = await searchLocations(city);
      if (!locations.length) {
        setCompareError('Location not found.');
        return;
      }

      const loc = locations[0];
      const label = [loc.name, loc.state, loc.country].filter(Boolean).join(', ');

      // avoid duplicates
      if (compareList.some((c) => c.label === label)) {
        setCompareError('Location already in comparison list.');
        return;
      }

      const liveWeather = await fetchWeatherTheme(label, { lat: loc.lat, lon: loc.lon });

      setCompareList((cur) => [...cur, { label, lat: loc.lat, lon: loc.lon, weather: liveWeather }]);
      setCompareInput('');
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Unable to load compare location.');
    } finally {
      setCompareLoading(false);
    }
  };

  const handleRemoveCompare = (label?: string) => {
    if (!label) {
      setCompareList([]);
      setCompareInput('');
      setCompareError(null);
      return;
    }
    setCompareList((cur) => cur.filter((c) => c.label !== label));
  };

  const handleExportComparisonPdf = (compareItem: { label: string; lat: number; lon: number; weather?: WeatherTheme }) => {
    if (!weather || !compareItem.weather) return;
    const a = weather;
    const b = compareItem.weather;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    let y = margin;
    const W = doc.internal.pageSize.getWidth();

    const title = `Comparison: ${a.location} vs ${b.location}`;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, y);
    y += 24;

    const addRow = (label: string, left: string, right: string) => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(label, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(left, margin + 120, y);
      doc.text(right, margin + W / 2 + 20, y);
      y += 14;
    };

    addRow('Temperature', `${a.temperatureC}°C`, `${b.temperatureC}°C`);
    addRow('AQI (US)', a.usAqi != null ? `${a.usAqi} (${a.usAqiCategory})` : 'N/A', b.usAqi != null ? `${b.usAqi} (${b.usAqiCategory})` : 'N/A');
    addRow('Summary', a.summary, b.summary);
    addRow('Wind', a.wind, b.wind);
    addRow('Humidity', `${a.humidity}%`, `${b.humidity}%`);

    // deltas
    const tempDelta = b.temperatureC - a.temperatureC;
    const aqiDelta = (b.usAqi ?? 0) - (a.usAqi ?? 0);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Deltas', margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.text(`Temperature delta: ${tempDelta > 0 ? '+' : ''}${tempDelta}°C`, margin, y);
    doc.text(`AQI delta: ${aqiDelta > 0 ? '+' : ''}${aqiDelta}`, margin + 260, y);

    const filename = `${sanitizeFileName(a.location)}_vs_${sanitizeFileName(b.location)}.pdf`;
    doc.save(filename);
    setSavedMessage(`Downloaded comparison PDF for ${a.location} vs ${b.location}.`);
  };

  const handleSaveWeatherRange = () => {
    const city = locationInput.trim();

    if (!city) {
      setSavedError('Search a location first, then save the date range.');
      return;
    }

    if (archiveEndDate < archiveStartDate) {
      setSavedError('End date must be on or after start date.');
      return;
    }

    setSavingRange(true);
    setSavedError(null);
    setSavedMessage(null);
    const coords = currentCoordinates;
    void (async () => {
      try {
        // If we don't have coordinates, attempt to resolve the location first
        let useCoords = coords;
        if (!useCoords) {
          try {
            const resolved = await searchLocations(city);
            if (resolved.length) {
              useCoords = { lat: resolved[0].lat, lon: resolved[0].lon };
              setCurrentCoordinates(useCoords);
            }
          } catch {
            // ignore, let backend try to resolve by city
          }
        }

        const payload = {
          city,
          startDate: archiveStartDate,
          endDate: archiveEndDate,
          coordinates: useCoords ?? undefined,
        };

        const record = editingRecordId
          ? await updateWeatherHistory(editingRecordId, payload)
          : await saveWeatherHistory(payload);

        setSelectedRangeRecord(record);
        setSelectedRangeOpen(true);
        setEditingRecordId(record.id);
        setSavedMessage(`${editingRecordId ? 'Updated' : 'Saved'} ${record.location} from ${record.startDate} to ${record.endDate}.`);
        loadSavedWeatherHistory();
      } catch (err) {
        setSavedError(err instanceof Error ? err.message : 'Unable to save weather history.');
      } finally {
        setSavingRange(false);
      }
    })();
  };

  const handleFetchRangePreview = () => {
    const city = (locationInput.trim() || weather?.location || '').trim();

    if (!city) {
      setSavedError('Search or load a location first, then fetch the date range.');
      return;
    }

    if (archiveEndDate < archiveStartDate) {
      setSavedError('End date must be on or after start date.');
      return;
    }

    setFetchingPreview(true);
    setSavedError(null);
    setSavedMessage(null);
    setEditingRecordId(null);

    void (async () => {
      try {
        // Try to get coordinates client-side first so backend can use them
        let useCoords = currentCoordinates;
        if (!useCoords && locationInput.trim()) {
          try {
            const resolved = await searchLocations(locationInput.trim());
            if (resolved.length) {
              useCoords = { lat: resolved[0].lat, lon: resolved[0].lon };
              setCurrentCoordinates(useCoords);
            } else {
              setSavedError(JSON.stringify({ detail: `No location found for ${locationInput.trim()}` }));
              setFetchingPreview(false);
              return;
            }
          } catch (e) {
            // if client-side geocode fails, we'll still call preview with city
          }
        }

        const record = await fetchWeatherRangePreview({
          city,
          startDate: archiveStartDate,
          endDate: archiveEndDate,
          coordinates: useCoords ?? undefined,
        });
        setSelectedRangeRecord(record);
        setSelectedRangeOpen(true);
        setSavedMessage(`Previewed ${record.location} from ${record.startDate} to ${record.endDate}.`);
      } catch (err) {
        setSavedError(err instanceof Error ? err.message : 'Unable to fetch preview for the range.');
      } finally {
        setFetchingPreview(false);
      }
    })();
  };

  const loadSavedWeatherHistory = () => {
    setSavedLoading(true);
    setSavedError(null);

    void (async () => {
      try {
        const records = await listWeatherHistory();
        setSavedRecords(records);
        setSavedMessage(records.length ? `Loaded ${records.length} saved record${records.length === 1 ? '' : 's'}.` : 'No saved weather records saved yet.');
      } catch (err) {
        setSavedError(err instanceof Error ? err.message : 'Unable to load saved weather history.');
      } finally {
        setSavedLoading(false);
      }
    })();
  };

  const handleOpenSavedRecord = (record: WeatherHistoryRecord) => {
    setSavedRecordView(record);
    setSavedDetailOpen(true);
    setSavedMessage(`Opened saved weather for ${record.location}.`);
  };

  const handleDownloadSavedRecordPdf = (record: WeatherHistoryRecord) => {
    const theme = buildWeatherTheme(record.bundle);
    const alerts = generateAlerts(theme);
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let cursorY = margin;

    const ensureSpace = (neededHeight: number) => {
      if (cursorY + neededHeight > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }
    };

    const addHeading = (text: string) => {
      ensureSpace(28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(text, margin, cursorY);
      cursorY += 22;
    };

    const addSubheading = (text: string) => {
      ensureSpace(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(text, margin, cursorY);
      cursorY += 16;
    };

    const addLine = (label: string, value: string) => {
      ensureSpace(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`${label}:`, margin, cursorY);
      doc.setFont('helvetica', 'normal');
      doc.text(value, margin + 110, cursorY);
      cursorY += 14;
    };

    const addParagraph = (text: string) => {
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
      ensureSpace(lines.length * 14 + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(lines, margin, cursorY);
      cursorY += lines.length * 14 + 6;
    };

    const addBullet = (text: string) => {
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2 - 14);
      ensureSpace(lines.length * 14 + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('•', margin, cursorY);
      doc.text(lines, margin + 14, cursorY);
      cursorY += lines.length * 14 + 4;
    };

    addHeading('Saved Weather Data');
    addLine('Location', record.location);
    addLine('Saved at', record.savedAt.slice(0, 19).replace('T', ' '));
    addLine('Range', `${record.startDate} to ${record.endDate}`);
    addLine('Condition', theme.summary);
    addLine('Temperature', `${theme.temperatureC}°C`);
    addLine('Feels like', `${theme.feelsLikeC}°C`);
    addLine('Wind', theme.wind);
    addLine('Humidity', `${theme.humidity}%`);
    addLine('Pressure', `${theme.pressure} hPa`);
    addLine('AQI', theme.usAqi != null ? `${theme.usAqi} (${theme.usAqiCategory})` : 'N/A');
    addLine('Visibility', `${theme.visibilityKm} km`);
    addLine('UV index', String(theme.uvIndex));

    addSubheading('Summary');
    addParagraph(record.summary || theme.summary);

    if (alerts.length) {
      addSubheading('Alerts');
      alerts.forEach(addBullet);
    }

    addSubheading('Daily Forecast');
    theme.daily.slice(0, 7).forEach((day) => {
      addParagraph(`${day.day} - ${day.summary} | Low ${day.low}°C / High ${day.high}°C | Rain ${day.precipitationProbability}%`);
    });

    addSubheading('Hourly Forecast');
    theme.hourly.slice(0, 12).forEach((hour) => {
      addParagraph(`${hour.time} - ${hour.summary} | ${hour.temp}°C | Rain ${hour.precipitationProbability}%`);
    });

    doc.save(`${sanitizeFileName(record.location)}_${record.startDate}_to_${record.endDate}.pdf`);
    setSavedMessage(`Downloaded PDF for ${record.location}.`);
  };

  

  const handleEditSavedRecord = (record: WeatherHistoryRecord) => {
    setEditDialogRecord(record);
    setEditLocationInput(record.location);
    setEditArchiveStartDate(record.startDate);
    setEditArchiveEndDate(record.endDate);
    setEditCoordinates({ lat: Number(record.lat), lon: Number(record.lon) });
  };

  // Load a small set of videos for the current location (called when location/weather changes)
  const loadVideosForLocation = async (loc: string, max = INITIAL_VIDEO_COUNT) => {
    if (!loc) {
      setVideos([]);
      return;
    }

    setVideosLoading(true);
    setVideosError(null);

    try {
      const list = await fetchLocationVideos(loc, max);
      setVideos(list || []);
    } catch (err) {
      setVideosError(err instanceof Error ? err.message : 'Unable to fetch videos.');
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  };

  const closeEditDialog = () => {
    setEditDialogRecord(null);
  };

  const handleSaveEditDialog = () => {
    if (!editDialogRecord) return;

    const city = editLocationInput.trim();
    if (!city) {
      setSavedError('Enter a location before updating the record.');
      return;
    }

    if (editArchiveEndDate < editArchiveStartDate) {
      setSavedError('End date must be on or after start date.');
      return;
    }

    setSavedError(null);
    setSavedMessage(null);
    setSavingRange(true);

    void (async () => {
      try {
        let useCoords = editCoordinates;
        if (!useCoords) {
          try {
            const resolved = await searchLocations(city);
            if (resolved.length) {
              useCoords = { lat: resolved[0].lat, lon: resolved[0].lon };
              setEditCoordinates(useCoords);
            }
          } catch {
            // fall back to backend city resolution
          }
        }

        const updated = await updateWeatherHistory(editDialogRecord.id, {
          city,
          startDate: editArchiveStartDate,
          endDate: editArchiveEndDate,
          coordinates: useCoords ?? undefined,
        });

        setSavedRecords((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
        setSavedRecordView(updated);
        setSavedDetailOpen(true);
        setArchiveStartDate(updated.startDate);
        setArchiveEndDate(updated.endDate);
        setLocationInput(updated.location);
        setCurrentCoordinates({ lat: updated.lat, lon: updated.lon });
        setSavedMessage(`Updated ${updated.location} from ${updated.startDate} to ${updated.endDate}.`);
        closeEditDialog();
      } catch (err) {
        setSavedError(err instanceof Error ? err.message : 'Unable to update weather history.');
      } finally {
        setSavingRange(false);
      }
    })();
  };

  const handleDeleteSavedRecord = (record: WeatherHistoryRecord) => {
    setSavedError(null);
    setSavedMessage(null);

    if (!window.confirm(`Delete saved weather for ${record.location} (${record.startDate} to ${record.endDate})?`)) {
      return;
    }

    void (async () => {
      try {
        await deleteWeatherHistory(record.id);
        setSavedRecords((current) => current.filter((item) => item.id !== record.id));
        if (savedRecordView?.id === record.id) {
          setSavedRecordView(null);
          setSavedDetailOpen(false);
        }
        if (selectedRangeRecord?.id === record.id) {
          setSelectedRangeRecord(null);
          setSelectedRangeOpen(false);
          setEditingRecordId(null);
        }
        setSavedMessage(`Deleted saved weather for ${record.location}.`);
        loadSavedWeatherHistory();
      } catch (err) {
        setSavedError(err instanceof Error ? err.message : 'Unable to delete saved weather history.');
      }
    })();
  };

  const selectedRangeTheme = selectedRangeRecord ? buildWeatherTheme(selectedRangeRecord.bundle) : null;
  const savedRecordTheme = savedRecordView ? buildWeatherTheme(savedRecordView.bundle) : null;

  useEffect(() => {
    // Auto-load two videos when a location is successfully loaded
    const loc = weather?.location || locationInput || '';
    if (loc) {
      void loadVideosForLocation(loc, INITIAL_VIDEO_COUNT);
    } else {
      setVideos([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather?.location]);

  // Compare summary: hottest location and worst AQI among main + compareList
  const compareSummary = (() => {
    const items: Array<{ label: string; temp?: number | null; aqi?: number | null }> = [];
    if (weather) items.push({ label: weather.location ?? 'Main', temp: weather.temperatureC ?? null, aqi: weather.usAqi ?? null });
    for (const c of compareList) {
      if (c.weather) items.push({ label: c.label, temp: c.weather.temperatureC ?? null, aqi: c.weather.usAqi ?? null });
    }
    if (!items.length) return null;
    const byTemp = items.filter((it) => typeof it.temp === 'number');
    const byAqi = items.filter((it) => typeof it.aqi === 'number');
    const hottest = byTemp.length ? byTemp.reduce((a, b) => ( (b.temp ?? -Infinity) > (a.temp ?? -Infinity) ? b : a )) : null;
    const worstAqi = byAqi.length ? byAqi.reduce((a, b) => ( (b.aqi ?? -Infinity) > (a.aqi ?? -Infinity) ? b : a )) : null;
    return { hottest, worstAqi } as { hottest: { label: string; temp?: number | null } | null; worstAqi: { label: string; aqi?: number | null } | null };
  })();

  return (
    <main className={backgroundClass}>
      <AnimatedBackground themeKey={themeKey} />

      <section className="shell">
        <div className="canvas">
          <div className="hero-panel">
            <header className="hero-topbar">
              <div className="date-pill">
                <span>{weather?.date ?? '—'}</span>
                <span>{weather?.time ?? '—'}</span>
              </div>
              <button className="ghost-button" type="button" onClick={() => setFavorite((value) => !value)}>
                {favorite ? 'Saved' : 'Save location'}
              </button>
              <span className="status-pill">{statusMessage}</span>
            </header>

            <div className="hero-copy">
              <p className="eyebrow">Current weather</p>
              <h1>{weather?.summary ?? 'Enter a location'}</h1>
              {weather ? null : <p className="summary">{emptyMessage}</p>}
            </div>

            <div className="hero-map" style={{ marginTop: 12 }}>
              <LocationMap coords={currentCoordinates} weather={weather} height={340} />
            </div>

            <div className="hero-temperature">{temperature}</div>

            {weather ? (
              <>
                <div className="hero-meta">
                  <span>Wind {weather.wind}</span>
                  <span>Feels like {unit === 'C' ? `${weather.feelsLikeC}°C` : `${Math.round((weather.feelsLikeC * 9) / 5 + 32)}°F`}</span>
                  <span>Visibility {weather.visibilityKm} km</span>
                </div>

                {/* Alerts are shown in the sidebar now. */}

                <div className="detail-grid">
                  <article className="detail-card"><span>Humidity</span><strong>{weather.humidity}%</strong></article>
                  <article className="detail-card"><span>Pressure</span><strong>{weather.pressure} hPa</strong></article>
                  <article className="detail-card"><span>Air quality (AQI)</span><strong>{weather.usAqi ? (<span style={{ display: 'inline-block', padding: '6px 10px', borderRadius: 8, background: weather.usAqiColor ?? '#888', color: '#000' }}>{weather.usAqi} — {weather.usAqiCategory}</span>) : (weather.aqi ? `${weather.aqi} — ${(() => { switch(weather.aqi){ case 1: return 'Good'; case 2: return 'Fair'; case 3: return 'Moderate'; case 4: return 'Poor'; case 5: return 'Very Poor'; default: return 'Unknown'; } })()}` : 'N/A')}</strong></article>
                  <article className="detail-card"><span>UV index</span><strong>{weather.uvIndex}</strong></article>
                  <article className="detail-card"><span>Gusts</span><strong>{weather.windGust}</strong></article>
                  <article className="detail-card"><span>Rain chance</span><strong>{weather.precipitationProbability}%</strong></article>
                  <article className="detail-card"><span>Sunrise</span><strong>{weather.sunrise}</strong></article>
                  <article className="detail-card"><span>Sunset</span><strong>{weather.sunset}</strong></article>
                </div>

                <div className="hourly-strip">
                  {weather.hourly.map((slot) => (
                    <article key={`${slot.time}-${slot.temp}`} className="hour-card">
                      <span className="hour-time">{slot.time}</span>
                      <span className={`weather-icon icon-${slot.icon}`} aria-hidden="true" />
                      <strong>{unit === 'C' ? `${slot.temp}°` : `${Math.round((slot.temp * 9) / 5 + 32)}°`}</strong>
                      <span className="hour-summary">{slot.summary}</span>
                      <span className="hour-rain">{slot.precipitationProbability}% rain</span>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>{emptyMessage}</p>
              </div>
            )}
          </div>

          <aside className="sidebar">
            <div className="sidebar-header">
              <form className="location-form" onSubmit={handleLocationSearch}>
                <label className="location-label" htmlFor="location-input">
                  Location
                </label>
                <input
                  id="location-input"
                  className="location-input"
                  type="text"
                  value={locationInput}
                  onChange={(event) => setLocationInput(event.target.value)}
                  placeholder="Enter a city or country"
                />
                <div className="location-actions">
                  <button className="location-button" type="submit">
                    Search
                  </button>
                  <button className="location-button secondary" type="button" onClick={handleUseCurrentLocation}>
                    Use current location
                  </button>
                </div>
              </form>

              <div className="controls">
                <button className="icon-button" type="button">↺</button>
                <button className="icon-button" type="button">⌕</button>
                <button className="unit-toggle" type="button" onClick={() => setUnit(unit === 'C' ? 'F' : 'C')}>
                  {unit}°
                </button>
              </div>
            </div>
            

              {error ? <p className="error-banner">{error}</p> : null}

            <div className="sidebar-temperature">{temperature}</div>
            <p className="sidebar-summary">{weather?.wind ?? emptyMessage}</p>

            {/* Small alert under the wind summary, above the forecast tabs */}
            {weather ? (() => {
              const alerts = generateAlerts(weather);
              if (!alerts || !alerts.length) return null;
              return (
                <div className="sidebar-alert">
                  {alerts.length === 1 ? (
                    <div className="alert">{alerts[0]}</div>
                  ) : (
                    <ul className="alert-bullets">
                      {alerts.map((a) => (
                        <li key={a} className="alert-item">{a}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })() : null}

            <div className="divider" />

            <section>
              <div className="section-header">
                <h2>The Next Days Forecast</h2>
              </div>
              <div className="range-tabs" role="tablist" aria-label="Forecast range">
                {ranges.map((item) => (
                  <button
                    key={item}
                    className={item === range ? 'tab active' : 'tab'}
                    type="button"
                    onClick={() => setRange(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="forecast-list">
                {weather ? weather.daily.map((day) => (
                  <article key={day.day} className="forecast-row">
                    <span className={`weather-icon icon-${day.icon}`} aria-hidden="true" />
                    <div className="forecast-copy">
                      <strong>{day.day}</strong>
                      <span>{day.summary} · {day.precipitationProbability}% rain · {day.sunrise} / {day.sunset}</span>
                    </div>
                    <div className="forecast-temps">
                      <span>{unit === 'C' ? `${day.low}°` : `${Math.round((day.low * 9) / 5 + 32)}°`}</span>
                      <span>{unit === 'C' ? `${day.high}°` : `${Math.round((day.high * 9) / 5 + 32)}°`}</span>
                    </div>
                  </article>
                )) : <p className="empty-state-inline">{emptyMessage}</p>}
              </div>

              {/* Compare section moved below Videos */}
            </section>

            <div className="sidebar-bottom-note">
              <p>Saved ranges and history are available in the bottom window.</p>
            </div>
          </aside>
        </div>
        <div className="bottom-window">
          <section className="bottom-section">
            <div className="section-header">
              <h2>Weather Range Explorer</h2>
            </div>

            <div className="archive-card">
              <div className="section-header compact">
                <h2>Choose a date range for the selected location</h2>
              </div>
              <div className="date-range-grid">
                <label className="date-field">
                  <span>Start date</span>
                  <input type="date" value={archiveStartDate} onChange={(event) => setArchiveStartDate(event.target.value)} />
                </label>
                <label className="date-field">
                  <span>End date</span>
                  <input type="date" value={archiveEndDate} onChange={(event) => setArchiveEndDate(event.target.value)} />
                </label>
              </div>
              <div className="archive-actions">
                <button className="location-button" type="button" onClick={handleSaveWeatherRange} disabled={savingRange}>
                  {savingRange ? 'Saving…' : editingRecordId ? 'Update range in database' : 'Save range to database'}
                </button>
                <button className="location-button" type="button" onClick={handleFetchRangePreview} disabled={fetchingPreview}>
                  {fetchingPreview ? 'Fetching…' : 'Fetch range data'}
                </button>
              </div>
              <p className="archive-help">Choose the dates here, then fetch the range to show its data in the Selected Range panel.</p>
              {savedMessage ? <p className="archive-success">{savedMessage}</p> : null}
              {savedError ? <p className="archive-error">{savedError}</p> : null}
            </div>
            

            <div className="section-header">
              <h2>Selected Range Data</h2>
            </div>

            {selectedRangeRecord && selectedRangeTheme ? (
              <div className="selected-range-panel">
                <div className="selected-range-header">
                  <div>
                    <strong>{selectedRangeRecord.location}</strong>
                    <div className="saved-card-meta">{selectedRangeRecord.startDate} → {selectedRangeRecord.endDate}</div>
                  </div>
                  <button className="location-button secondary collapse-button" type="button" onClick={() => setSelectedRangeOpen(false)}>
                    Collapse
                  </button>
                </div>

                {selectedRangeOpen ? (
                  <div className="selected-range-details">
                    <div className="range-result-summary">
                      <article className="detail-card"><span>Condition</span><strong>{selectedRangeTheme.summary}</strong></article>
                      <article className="detail-card"><span>Temperature</span><strong>{selectedRangeTheme.temperatureC}°C</strong></article>
                      <article className="detail-card"><span>Humidity</span><strong>{selectedRangeTheme.humidity}%</strong></article>
                      <article className="detail-card"><span>Rain chance</span><strong>{selectedRangeTheme.precipitationProbability}%</strong></article>
                    </div>

                    <div className="range-result-subtitle">Daily range data</div>
                    <div className="range-result-list">
                      {selectedRangeTheme.daily.map((day) => (
                        <article key={`${selectedRangeRecord.id}-${day.day}`} className="range-result-row">
                          <span className={`weather-icon icon-${day.icon}`} aria-hidden="true" />
                          <div className="forecast-copy">
                            <strong>{day.day}</strong>
                            <span>{day.summary} · {day.precipitationProbability}% rain · {day.sunrise} / {day.sunset}</span>
                          </div>
                          <div className="forecast-temps">
                            <span>{unit === 'C' ? `${day.low}°` : `${Math.round((day.low * 9) / 5 + 32)}°`}</span>
                            <span>{unit === 'C' ? `${day.high}°` : `${Math.round((day.high * 9) / 5 + 32)}°`}</span>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="range-result-subtitle">Hourly range data</div>
                    <div className="range-hourly-strip">
                      {selectedRangeTheme.hourly.slice(0, 12).map((slot) => (
                        <article key={`${selectedRangeRecord.id}-${slot.time}-${slot.temp}`} className="hour-card compact">
                          <span className="hour-time">{slot.time}</span>
                          <span className={`weather-icon icon-${slot.icon}`} aria-hidden="true" />
                          <strong>{unit === 'C' ? `${slot.temp}°` : `${Math.round((slot.temp * 9) / 5 + 32)}°`}</strong>
                          <span className="hour-summary">{slot.summary}</span>
                          <span className="hour-rain">{slot.precipitationProbability}% rain</span>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="empty-state-inline">Fetch a date range to view its data here.</p>
            )}

            {/* Videos section moved to its own bottom window section */}

            <div className="section-header">
              <h2>Saved Weather Data</h2>
            </div>

            {/* manual video button removed — videos now load automatically when a location is loaded */}

            <div className="saved-list">
              {savedDetailOpen && savedRecordView ? (
                <div className="selected-range-panel saved-record-view">
                  <div className="selected-range-header">
                    <div>
                      <strong>{savedRecordView.location}</strong>
                      <div className="saved-card-meta">{savedRecordView.startDate} → {savedRecordView.endDate}</div>
                    </div>
                    <button className="location-button secondary collapse-button" type="button" onClick={() => { setSavedRecordView(null); setSavedDetailOpen(false); }}>
                      Collapse
                    </button>
                  </div>

                  <div className="selected-range-details">
                    <div className="range-result-summary">
                      <article className="detail-card"><span>Condition</span><strong>{savedRecordTheme?.summary}</strong></article>
                      <article className="detail-card"><span>Temperature</span><strong>{savedRecordTheme?.temperatureC}°C</strong></article>
                      <article className="detail-card"><span>Humidity</span><strong>{savedRecordTheme?.humidity}%</strong></article>
                      <article className="detail-card"><span>Rain chance</span><strong>{savedRecordTheme?.precipitationProbability}%</strong></article>
                    </div>

                    <div className="range-result-subtitle">Daily range data</div>
                    <div className="range-result-list">
                      {savedRecordTheme?.daily.map((day) => (
                        <article key={`${savedRecordView.id}-${day.day}`} className="range-result-row">
                          <span className={`weather-icon icon-${day.icon}`} aria-hidden="true" />
                          <div className="forecast-copy">
                            <strong>{day.day}</strong>
                            <span>{day.summary} · {day.precipitationProbability}% rain · {day.sunrise} / {day.sunset}</span>
                          </div>
                          <div className="forecast-temps">
                            <span>{unit === 'C' ? `${day.low}°` : `${Math.round((day.low * 9) / 5 + 32)}°`}</span>
                            <span>{unit === 'C' ? `${day.high}°` : `${Math.round((day.high * 9) / 5 + 32)}°`}</span>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="range-result-subtitle">Hourly range data</div>
                    <div className="range-hourly-strip">
                      {savedRecordTheme?.hourly.slice(0, 12).map((slot) => (
                        <article key={`${savedRecordView.id}-${slot.time}-${slot.temp}`} className="hour-card compact">
                          <span className="hour-time">{slot.time}</span>
                          <span className={`weather-icon icon-${slot.icon}`} aria-hidden="true" />
                          <strong>{unit === 'C' ? `${slot.temp}°` : `${Math.round((slot.temp * 9) / 5 + 32)}°`}</strong>
                          <span className="hour-summary">{slot.summary}</span>
                          <span className="hour-rain">{slot.precipitationProbability}% rain</span>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {savedRecords.length ? savedRecords.map((record) => (
                <div key={record.id} className="saved-card-wrap">
                  <button className="saved-card" type="button" onClick={() => handleOpenSavedRecord(record)}>
                    <div className="saved-card-top">
                      <strong>{record.location}</strong>
                      <span>{record.savedAt.slice(0, 10)}</span>
                    </div>
                    <span className="saved-card-meta">{record.startDate} → {record.endDate}</span>
                    <span className="saved-card-meta">{record.summary}</span>
                  </button>
                  <div className="saved-card-actions">
                    <button className="location-button secondary" type="button" onClick={() => handleEditSavedRecord(record)}>
                      Edit
                    </button>
                    <button className="location-button secondary" type="button" onClick={() => handleDownloadSavedRecordPdf(record)}>
                      PDF
                    </button>
                    <button className="location-button secondary" type="button" onClick={() => handleDeleteSavedRecord(record)}>
                      Delete
                    </button>
                  </div>
                </div>
              )) : <p className="empty-state-inline">No saved weather history loaded yet.</p>}
            </div>

            {editDialogRecord ? (
              <div className="edit-modal-backdrop" role="presentation" onClick={closeEditDialog}>
                <div className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-range-title" onClick={(event) => event.stopPropagation()}>
                  <div className="edit-modal-header">
                    <div>
                      <p className="eyebrow">Edit saved range</p>
                      <h3 id="edit-range-title">{editDialogRecord.location}</h3>
                    </div>
                    <button className="ghost-button" type="button" onClick={closeEditDialog}>Close</button>
                  </div>

                  <div className="edit-modal-grid">
                    <label className="field-group">
                      <span>Location</span>
                      <input
                        value={editLocationInput}
                        onChange={(event) => setEditLocationInput(event.target.value)}
                        className="text-input"
                        placeholder="City, Country"
                      />
                    </label>

                    <label className="field-group">
                      <span>Start date</span>
                      <input
                        type="date"
                        value={editArchiveStartDate}
                        onChange={(event) => setEditArchiveStartDate(event.target.value)}
                        className="text-input"
                      />
                    </label>

                    <label className="field-group">
                      <span>End date</span>
                      <input
                        type="date"
                        value={editArchiveEndDate}
                        onChange={(event) => setEditArchiveEndDate(event.target.value)}
                        className="text-input"
                      />
                    </label>
                  </div>

                  <p className="edit-modal-note">
                    Changing the location or dates will refresh the stored weather bundle for this record.
                  </p>

                  <div className="edit-modal-actions">
                    <button className="location-button secondary" type="button" onClick={closeEditDialog}>
                      Cancel
                    </button>
                    <button className="location-button" type="button" onClick={handleSaveEditDialog} disabled={savingRange}>
                      {savingRange ? 'Updating…' : 'Save changes'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            
          </section>
        </div>
        <div className="bottom-window">
          <section className="bottom-section">
            <div className="section-header">
              <h2>Videos related to {weather?.location || locationInput || 'this place'}</h2>
            </div>

            <div className="archive-card">
              <div className="videos-inline">
                {videosLoading ? (
                  <p>Loading videos…</p>
                ) : videosError ? (
                  <p className="archive-error">{videosError}</p>
                ) : videos.length ? (
                  <div className="videos-list-inline">
                    {videos.map((v) => (
                      <article key={v.id} className="video-row-inline">
                        <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">
                          <img src={v.thumbnail} alt={v.title} className="video-thumb" />
                        </a>
                        <div className="video-copy">
                          <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer"><strong>{v.title}</strong></a>
                          <div className="video-meta">{v.channelTitle} · {new Date(v.publishedAt).toLocaleDateString()}</div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state-inline">No videos available for this location.</p>
                )}

                <div style={{ marginTop: 12 }}>
                  {!videosExpanded ? (
                    <button
                      className="location-button"
                      type="button"
                      disabled={videosLoading || !(weather?.location || locationInput)}
                      onClick={async () => {
                        setVideosExpanded(true);
                        const loc = weather?.location || locationInput || '';
                        await loadVideosForLocation(loc, EXPANDED_VIDEO_COUNT);
                      }}
                    >
                      {videosLoading ? 'Loading…' : 'Show more videos'}
                    </button>
                  ) : (
                    <button
                      className="location-button"
                      type="button"
                      onClick={() => {
                        setVideosExpanded(false);
                        setVideos((v) => v.slice(0, INITIAL_VIDEO_COUNT));
                      }}
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Compare section — inserted inside .shell to match layout */}
        <div style={{ width: '100%' }}>
          <section className="bottom-section compare-bottom">
            <div className="archive-card">
              <div className="section-header">
                <h2>Compare Locations</h2>
              </div>
              {compareSummary ? (
                <div className="compare-summary-block">
                  {compareSummary.hottest ? (
                    <div className="compare-summary-line">Hottest: <strong>{compareSummary.hottest.label}</strong>{compareSummary.hottest.temp != null ? ` — ${compareSummary.hottest.temp}°C` : ''}</div>
                  ) : null}
                  {compareSummary.worstAqi ? (
                    <div className="compare-summary-line">Worst AQI: <strong>{compareSummary.worstAqi.label}</strong>{compareSummary.worstAqi.aqi != null ? ` — ${compareSummary.worstAqi.aqi}` : ''}</div>
                  ) : null}
                </div>
              ) : null}

              <div className="compare-layout">
                <div className="compare-left">
                  <div className="compare-card main-card">
                    <strong>Main</strong>
                    {weather ? (
                      <>
                        <div style={{ marginTop: 8 }}>{weather.location}</div>
                        <div style={{ fontSize: '2rem', marginTop: 6 }}>{weather.temperatureC}°C</div>
                        <div style={{ color: 'var(--muted)', marginTop: 6 }}>{weather.summary}</div>
                        <div style={{ marginTop: 8 }}>AQI: {weather.usAqi ?? 'N/A'}</div>
                      </>
                    ) : <div className="empty-state-inline">Load a main location first.</div>}
                  </div>
                </div>

                <div className="compare-right">
                  <div className="compare-card target-card">
                    <strong>Compare With</strong>
                    <form className="compare-form" onSubmit={handleAddCompare} style={{ marginTop: 10 }}>
                      <input
                        className="location-input"
                        placeholder="Add city to compare"
                        value={compareInput}
                        onChange={(e) => setCompareInput(e.target.value)}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="location-button" type="submit" disabled={compareLoading}>Add</button>
                        <button className="location-button secondary" type="button" onClick={() => handleRemoveCompare()}>Clear</button>
                      </div>
                    </form>

                    {compareError ? <p className="error-banner">{compareError}</p> : null}

                    <div className="compare-list" style={{ marginTop: 12 }}>
                      {compareList.length ? compareList.map((c) => (
                        <div key={c.label} className="compare-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong>{c.label}</strong>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="location-button" type="button" onClick={() => handleExportComparisonPdf(c)} disabled={!weather || !c.weather}>Export</button>
                              <button className="location-button secondary" type="button" onClick={() => handleRemoveCompare(c.label)}>Remove</button>
                            </div>
                          </div>
                      {c.weather ? (
                        <>
                          <div style={{ marginTop: 8 }}>{c.weather.location}</div>
                          <div style={{ fontSize: '1.5rem', marginTop: 6 }}>{c.weather.temperatureC}°C</div>
                          <div style={{ color: 'var(--muted)', marginTop: 6 }}>{c.weather.summary}</div>
                          <div style={{ marginTop: 8 }}>AQI: {c.weather.usAqi ?? 'N/A'}</div>
                          {weather ? (() => {
                            const tempDelta = c.weather!.temperatureC - weather.temperatureC;
                            const aqiDelta = (c.weather!.usAqi ?? 0) - (weather.usAqi ?? 0);
                            return (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontWeight: 700 }}>Delta</div>
                                <div className="compare-delta" style={{ marginTop: 6 }}>
                                  <span style={{ color: tempDelta > 0 ? '#ffb366' : '#88e090', fontWeight: 700 }}>{tempDelta > 0 ? '+' : ''}{tempDelta}°C</span>
                                  <span style={{ color: aqiDelta > 0 ? '#ff6b6b' : '#88e090', fontWeight: 700 }}>{aqiDelta > 0 ? '+' : ''}{aqiDelta} AQI</span>
                                </div>
                                <div className="compare-conclusion" style={{ color: tempDelta > 0 ? '#ffb366' : '#88e090' }}>
                                  {tempDelta === 0 ? 'Same temperature' : (tempDelta > 0 ? `Hotter by ${tempDelta}°C` : `Cooler by ${Math.abs(tempDelta)}°C`)}
                                  {aqiDelta !== 0 ? ` · ${aqiDelta > 0 ? 'Worse AQI by +' : 'Better AQI by '}${Math.abs(aqiDelta)}` : ''}
                                </div>
                              </div>
                            );
                          })() : null}
                        </>
                      ) : <div className="empty-state-inline">Loading…</div>}
                        </div>
                      )) : (
                        <div className="compare-card"><div className="empty-state-inline">No compare locations added.</div></div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>

    </main>
  );
}

export default App;
