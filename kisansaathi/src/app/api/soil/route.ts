import { NextRequest, NextResponse } from 'next/server';

// NASA POWER API — free, no key required
// Provides soil wetness, evapotranspiration, precipitation corrected

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '16.3008');
  const lon = parseFloat(searchParams.get('lon') || '80.4428');

  // Get last 7 days of data (POWER is 1-day delayed)
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // yesterday (latest available)
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6);

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

    // NASA POWER uses -999 / -99900 as fill values for missing data.
    // Find the most recent date that has VALID (positive) values.
    const allDates = Object.keys(params.GWETROOT || {}).sort();
    const NASA_FILL = -900; // anything below this is a fill value

    const validDates = allDates.filter(
      (d) => (params.GWETROOT?.[d] ?? NASA_FILL) > NASA_FILL
    );
    const latest = validDates[validDates.length - 1] || allDates[allDates.length - 1];

    const gwetroot = params.GWETROOT?.[latest]; // 0–1 root zone soil wetness
    const gwetprof = params.GWETPROF?.[latest]; // 0–1 profile soil wetness
    const evptrns  = params.EVPTRNS?.[latest];  // mm/day evapotranspiration
    const precip   = params.PRECTOTCORR?.[latest]; // mm/day precipitation

    // Validate values are real (not fill)
    const validGwet = gwetroot !== undefined && gwetroot > NASA_FILL;
    const soilMoisturePercent = validGwet ? Math.round(gwetroot * 100) : null;
    const validEt   = evptrns  !== undefined && evptrns  > NASA_FILL;
    const validPr   = precip   !== undefined && precip   > NASA_FILL;

    // Irrigation need index: low soil moisture + high ET + low precip → higher need
    let irrigationNeed = 0;
    if (soilMoisturePercent !== null && validEt && validPr) {
      irrigationNeed = Math.max(0, Math.min(10,
        ((1 - gwetroot) * 6) + (evptrns > 5 ? 3 : evptrns > 3 ? 1.5 : 0) + (precip < 2 ? 1 : 0)
      ));
    }

    // 7-day trend
    // 7-day trend — only show dates with valid data
    const trend = validDates.map(d => ({
      date: d,
      soil_moisture_pct: Math.round((params.GWETROOT?.[d] ?? 0) * 100),
      evapotranspiration_mm: params.EVPTRNS?.[d] ?? 0,
      rainfall_mm: params.PRECTOTCORR?.[d] ?? 0,
    }));

    const profilePct = gwetprof !== undefined && gwetprof > NASA_FILL
      ? Math.round(gwetprof * 100)
      : null;

    return NextResponse.json({
      fetched_at: new Date().toISOString(),
      unavailable: false,
      data_date: latest,
      soil_moisture_percent: soilMoisturePercent,
      profile_moisture_percent: profilePct,
      evapotranspiration_mm_per_day: validEt ? evptrns : null,
      recent_rainfall_mm: validPr ? precip : null,
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
