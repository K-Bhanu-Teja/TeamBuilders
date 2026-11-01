import { NextRequest, NextResponse } from 'next/server';

// NASA POWER API — free, no key required
// NOTE: -999 / -99900 are NASA POWER "fill values" (missing data) — must be filtered out

const NASA_FILL_VALUE_MIN = -990; // anything below this is a fill value sentinel

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '16.3008');
  const lon = parseFloat(searchParams.get('lon') || '80.4428');

  // NASA POWER is 1–2 days delayed — fetch the last 10 days to maximize chance of real data
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // yesterday
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 9); // 10-day window

  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
  url.searchParams.set('parameters', 'GWETROOT,GWETPROF,EVPTRNS,PRECTOTCORR,T2M_MAX,T2M_MIN,RH2M');
  url.searchParams.set('community', 'AG');
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('start', fmt(startDate));
  url.searchParams.set('end', fmt(endDate));
  url.searchParams.set('format', 'JSON');

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `NASA POWER returned ${res.status}`, unavailable: true },
        { status: 502 }
      );
    }

    const raw = await res.json();
    const params = raw?.properties?.parameter;

    if (!params) {
      return NextResponse.json({ error: 'Unexpected NASA POWER response format', unavailable: true }, { status: 502 });
    }

    // Helper: get the latest date where a parameter has a real (non-fill) value
    function getLatestReal(paramObj: Record<string, number> | undefined): { date: string; value: number } | null {
      if (!paramObj) return null;
      const dates = Object.keys(paramObj).sort().reverse(); // newest first
      for (const d of dates) {
        const v = paramObj[d];
        if (v !== undefined && v > NASA_FILL_VALUE_MIN) return { date: d, value: v };
      }
      return null;
    }

    const gwetEntry = getLatestReal(params.GWETROOT);
    const gwetprofEntry = getLatestReal(params.GWETPROF);
    const evptrnsEntry = getLatestReal(params.EVPTRNS);
    const precipEntry = getLatestReal(params.PRECTOTCORR);

    const gwetroot = gwetEntry?.value;  // 0–1 fraction
    const gwetprof = gwetprofEntry?.value;
    const evptrns = evptrnsEntry?.value;  // mm/day
    const precip = precipEntry?.value;    // mm/day

    // Soil moisture as percentage (0–100)
    const soilMoisturePercent =
      gwetroot !== undefined ? Math.min(100, Math.max(0, Math.round(gwetroot * 100))) : null;

    // Irrigation need index (0–10)
    let irrigationNeed = 0;
    if (gwetroot !== undefined) {
      irrigationNeed = Math.max(0, Math.min(10,
        ((1 - gwetroot) * 6) +
        ((evptrns !== undefined && evptrns > 5) ? 3 : (evptrns !== undefined && evptrns > 3) ? 1.5 : 0) +
        ((precip !== undefined && precip < 2) ? 1 : 0)
      ));
    }

    // Build 7-day trend using only real values
    const trendDates = Object.keys(params.GWETROOT || {}).sort();
    const trend = trendDates
      .map(d => {
        const gwet = params.GWETROOT?.[d];
        const et = params.EVPTRNS?.[d];
        const rain = params.PRECTOTCORR?.[d];
        if (gwet === undefined || gwet < NASA_FILL_VALUE_MIN) return null;
        return {
          date: d,
          soil_moisture_pct: Math.min(100, Math.max(0, Math.round(gwet * 100))),
          evapotranspiration_mm: (et !== undefined && et > NASA_FILL_VALUE_MIN) ? et : null,
          rainfall_mm: (rain !== undefined && rain > NASA_FILL_VALUE_MIN) ? rain : null,
        };
      })
      .filter(Boolean);

    const latestDate = gwetEntry?.date || precipEntry?.date || fmt(endDate);

    return NextResponse.json({
      fetched_at: new Date().toISOString(),
      unavailable: soilMoisturePercent === null,
      data_date: latestDate,
      soil_moisture_percent: soilMoisturePercent,
      profile_moisture_percent: gwetprof !== undefined ? Math.min(100, Math.max(0, Math.round(gwetprof * 100))) : null,
      evapotranspiration_mm_per_day: (evptrns !== undefined) ? Math.round(evptrns * 10) / 10 : null,
      recent_rainfall_mm: (precip !== undefined) ? Math.round(precip * 10) / 10 : null,
      irrigation_need_index: Math.round(irrigationNeed * 10) / 10,
      irrigation_recommendation: irrigationNeed > 6 ? 'Irrigate today' : irrigationNeed > 3 ? 'Monitor closely' : 'Sufficient moisture',
      trend_7day: trend,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), unavailable: true },
      { status: 503 }
    );
  }
}
