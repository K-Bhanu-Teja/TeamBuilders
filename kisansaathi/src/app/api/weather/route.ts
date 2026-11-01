import { NextRequest, NextResponse } from 'next/server';

// Open-Meteo API — free, no key required, IMD-class forecast
// Guntur default coordinates: 16.3008° N, 80.4428° E

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat') || '16.3008';
  const lon = searchParams.get('lon') || '80.4428';

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('current', [
    'temperature_2m',
    'relative_humidity_2m',
    'apparent_temperature',
    'precipitation',
    'wind_speed_10m',
    'uv_index',
    'weather_code',
  ].join(','));
  url.searchParams.set('daily', [
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'precipitation_probability_max',
    'uv_index_max',
    'wind_speed_10m_max',
    'weather_code',
  ].join(','));
  url.searchParams.set('timezone', 'Asia/Kolkata');
  url.searchParams.set('forecast_days', '4');

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 0 }, // no caching — always live
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Open-Meteo returned ${res.status}`, unavailable: true, last_updated: null },
        { status: 502 }
      );
    }

    const raw = await res.json();

    // Normalize to our schema
    const current = raw.current;
    const daily = raw.daily;
    const fetchedAt = new Date().toISOString();

    const normalized = {
      fetched_at: fetchedAt,
      unavailable: false,
      current: {
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        apparent_temperature: current.apparent_temperature,
        precipitation_now: current.precipitation,
        wind_speed: current.wind_speed_10m,
        uv_index: current.uv_index,
        weather_code: current.weather_code,
        condition: describeWeatherCode(current.weather_code),
      },
      forecast_3day: daily.time.slice(0, 4).map((date: string, i: number) => ({
        date,
        max_temp: daily.temperature_2m_max[i],
        min_temp: daily.temperature_2m_min[i],
        rainfall_mm: daily.precipitation_sum[i],
        rain_probability: daily.precipitation_probability_max[i],
        uv_index: daily.uv_index_max[i],
        wind_max: daily.wind_speed_10m_max[i],
        condition: describeWeatherCode(daily.weather_code[i]),
      })),
      // Key derived values for agent reasoning
      rainfall_next_24h: daily.precipitation_sum[0],
      rainfall_next_48h: (daily.precipitation_sum[0] || 0) + (daily.precipitation_sum[1] || 0),
      max_temp_today: daily.temperature_2m_max[0],
      spray_safe: daily.precipitation_sum[0] < 5 && daily.wind_speed_10m_max[0] < 20,
    };

    return NextResponse.json(normalized);
  } catch (err) {
    return NextResponse.json(
      { error: String(err), unavailable: true, last_updated: null },
      { status: 503 }
    );
  }
}

function describeWeatherCode(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 49) return 'Foggy';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow/sleet';
  if (code <= 82) return 'Rain showers';
  if (code <= 84) return 'Heavy showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Unknown';
}
