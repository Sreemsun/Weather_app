type Breakpoint = { cLo: number; cHi: number; iLo: number; iHi: number };

const PM25_BREAKPOINTS: Breakpoint[] = [
  { cLo: 0.0, cHi: 12.0, iLo: 0, iHi: 50 },
  { cLo: 12.1, cHi: 35.4, iLo: 51, iHi: 100 },
  { cLo: 35.5, cHi: 55.4, iLo: 101, iHi: 150 },
  { cLo: 55.5, cHi: 150.4, iLo: 151, iHi: 200 },
  { cLo: 150.5, cHi: 250.4, iLo: 201, iHi: 300 },
  { cLo: 250.5, cHi: 350.4, iLo: 301, iHi: 400 },
  { cLo: 350.5, cHi: 500.4, iLo: 401, iHi: 500 },
];

const PM10_BREAKPOINTS: Breakpoint[] = [
  { cLo: 0, cHi: 54, iLo: 0, iHi: 50 },
  { cLo: 55, cHi: 154, iLo: 51, iHi: 100 },
  { cLo: 155, cHi: 254, iLo: 101, iHi: 150 },
  { cLo: 255, cHi: 354, iLo: 151, iHi: 200 },
  { cLo: 355, cHi: 424, iLo: 201, iHi: 300 },
  { cLo: 425, cHi: 504, iLo: 301, iHi: 400 },
  { cLo: 505, cHi: 604, iLo: 401, iHi: 500 },
];

function computeIndex(c: number, breakpoints: Breakpoint[]): number | null {
  if (c === null || c === undefined || Number.isNaN(c)) return null;
  for (const bp of breakpoints) {
    if (c >= bp.cLo && c <= bp.cHi) {
      const I = ((bp.iHi - bp.iLo) / (bp.cHi - bp.cLo)) * (c - bp.cLo) + bp.iLo;
      return Math.round(I);
    }
  }
  return null;
}

export function computeUS_AQI(pm25?: number, pm10?: number): { aqi?: number; primary?: 'pm25' | 'pm10' | null } {
  const i25 = pm25 != null ? computeIndex(pm25, PM25_BREAKPOINTS) : null;
  const i10 = pm10 != null ? computeIndex(pm10, PM10_BREAKPOINTS) : null;

  if (i25 == null && i10 == null) return { aqi: undefined, primary: null };
  if (i25 == null) return { aqi: i10 ?? undefined, primary: 'pm10' };
  if (i10 == null) return { aqi: i25 ?? undefined, primary: 'pm25' };

  if (i25 >= i10) return { aqi: i25, primary: 'pm25' };
  return { aqi: i10, primary: 'pm10' };
}

export function aqiCategoryAndColor(aqi?: number): { category: string; color: string } {
  if (aqi == null) return { category: 'Unknown', color: '#888' };
  if (aqi <= 50) return { category: 'Good', color: '#55a84f' };
  if (aqi <= 100) return { category: 'Moderate', color: '#ffde33' };
  if (aqi <= 150) return { category: 'Unhealthy for Sensitive Groups', color: '#ff9933' };
  if (aqi <= 200) return { category: 'Unhealthy', color: '#cc0033' };
  if (aqi <= 300) return { category: 'Very Unhealthy', color: '#660099' };
  return { category: 'Hazardous', color: '#7e0023' };
}
