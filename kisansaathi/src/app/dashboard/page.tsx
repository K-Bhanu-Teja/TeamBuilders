'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type WeatherData = {
  fetched_at: string;
  unavailable: boolean;
  current?: {
    temperature: number;
    humidity: number;
    apparent_temperature: number;
    precipitation_now: number;
    wind_speed: number;
    uv_index: number;
    condition: string;
  };
  forecast_3day?: Array<{
    date: string;
    max_temp: number;
    min_temp: number;
    rainfall_mm: number;
    rain_probability: number;
    condition: string;
  }>;
  rainfall_next_24h?: number;
  max_temp_today?: number;
  spray_safe?: boolean;
};

type SoilData = {
  fetched_at: string;
  unavailable: boolean;
  data_date?: string;
  soil_moisture_percent?: number;
  evapotranspiration_mm_per_day?: number;
  irrigation_need_index?: number;
  irrigation_recommendation?: string;
};

type PriceData = {
  fetched_at: string;
  unavailable: boolean;
  cached?: boolean;
  message?: string;
  commodity?: string;
  market?: string;
  min_price?: number;
  max_price?: number;
  modal_price?: number;
  unit?: string;
};

type AdviceData = {
  success: boolean;
  advice_telugu: string;
  advice_english: string;
  safety_warnings: string[];
  generated_at: string;
  data_used?: {
    weather: Record<string, unknown>;
    soil: Record<string, unknown>;
    price: Record<string, unknown>;
  };
};

type Farmer = {
  id: string;
  name: string;
  village: string;
  crop: 'chilli' | 'cotton' | 'paddy';
  growth_stage: string;
  field_size_acres: number;
  location_lat: number;
  location_lon: number;
};

const CROP_EMOJI: Record<string, string> = { chilli: '🌶️', cotton: '☁️', paddy: '🌾' };

function LiveBadge({ fetched_at, unavailable }: { fetched_at?: string; unavailable: boolean }) {
  const time = fetched_at ? new Date(fetched_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <span className={`live-badge ${unavailable ? 'unavailable' : 'live'}`}>
      {unavailable ? `Unavailable · ${time}` : `Live · ${time}`}
    </span>
  );
}

function WeatherCard({ weather, loading }: { weather: WeatherData | null; loading: boolean }) {
  if (loading) return (
    <div className="glass-card" style={{ padding: '24px', minHeight: 220 }}>
      <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 48, width: '60%', marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 16, width: '80%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 16, width: '60%' }} />
    </div>
  );

  return (
    <div className="glass-card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          🌦️ Weather — వాతావరణం
        </h3>
        <LiveBadge fetched_at={weather?.fetched_at} unavailable={!weather || weather.unavailable} />
      </div>

      {weather?.current ? (
        <>
          <div style={{ display: 'flex', gap: 24, marginBottom: 20, alignItems: 'flex-end' }}>
            <div>
              <div className="stat-value">{weather.current.temperature}°C</div>
              <div className="stat-label">Temperature</div>
            </div>
            <div>
              <div className="stat-value">{weather.current.humidity}%</div>
              <div className="stat-label">Humidity</div>
            </div>
            <div>
              <div className="stat-value saffron">{weather.rainfall_next_24h ?? 0}mm</div>
              <div className="stat-label">Rain 24h</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <span style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(74,191,103,0.12)', fontSize: '0.78rem', color: 'var(--green-300)' }}>
              {weather.current.condition}
            </span>
            <span style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(56,189,248,0.1)', fontSize: '0.78rem', color: 'var(--sky-300)' }}>
              💨 {weather.current.wind_speed} km/h
            </span>
            <span style={{ padding: '4px 10px', borderRadius: 20, background: weather.spray_safe ? 'rgba(74,191,103,0.12)' : 'rgba(232,108,0,0.12)', fontSize: '0.78rem', color: weather.spray_safe ? 'var(--green-300)' : 'var(--saffron-300)' }}>
              {weather.spray_safe ? '✅ Spray Safe' : '⛔ No Spray'}
            </span>
          </div>

          {/* 3-day forecast strip */}
          <div style={{ display: 'flex', gap: 8 }}>
            {weather.forecast_3day?.slice(0, 3).map((d) => (
              <div key={d.date} style={{
                flex: 1, background: 'rgba(14,50,25,0.5)', borderRadius: 10,
                padding: '10px 8px', textAlign: 'center', border: '1px solid var(--card-border)'
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                  {new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' })}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--green-300)' }}>
                  {d.max_temp}°
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--sky-300)' }}>
                  {d.rainfall_mm > 0 ? `🌧️ ${d.rainfall_mm}mm` : '☀️'}
                </div>
              </div>
            ))}
          </div>
          <div className="data-source">📡 Source: Open-Meteo (IMD-class forecast)</div>
        </>
      ) : (
        <div style={{ color: 'var(--saffron-300)', fontSize: '0.9rem' }}>
          ⚠️ Live weather data unavailable. Check back shortly.
        </div>
      )}
    </div>
  );
}

function SoilCard({ soil, loading }: { soil: SoilData | null; loading: boolean }) {
  if (loading) return (
    <div className="glass-card" style={{ padding: '24px', minHeight: 220 }}>
      <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 48, width: '60%', marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 80, width: '100%' }} />
    </div>
  );

  const pct = soil?.soil_moisture_percent ?? 0;
  const moistureColor = pct > 75 ? 'var(--sky-300)' : pct > 40 ? 'var(--green-400)' : 'var(--saffron-300)';

  return (
    <div className="glass-card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          🌱 Soil — నేల తేమ
        </h3>
        <LiveBadge fetched_at={soil?.fetched_at} unavailable={!soil || soil.unavailable} />
      </div>

      {soil && soil.soil_moisture_percent !== undefined ? (
        <>
          <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
            <div>
              <div className="stat-value" style={{ background: `linear-gradient(135deg, ${moistureColor}, var(--green-300))`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {pct}%
              </div>
              <div className="stat-label">Root Zone Moisture</div>
            </div>
            <div>
              <div className="stat-value">{soil.evapotranspiration_mm_per_day?.toFixed(1)}</div>
              <div className="stat-label">ET mm/day</div>
            </div>
          </div>

          {/* Moisture bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 8, background: 'rgba(74,191,103,0.1)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: `linear-gradient(90deg, ${moistureColor}, var(--green-400))`, borderRadius: 4, transition: 'width 1s ease' }} />
            </div>
          </div>

          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            background: soil.irrigation_need_index && soil.irrigation_need_index > 6
              ? 'rgba(232,108,0,0.12)' : 'rgba(74,191,103,0.12)',
            border: `1px solid ${soil.irrigation_need_index && soil.irrigation_need_index > 6 ? 'rgba(232,108,0,0.25)' : 'rgba(74,191,103,0.2)'}`,
            fontSize: '0.85rem',
            color: soil.irrigation_need_index && soil.irrigation_need_index > 6 ? 'var(--saffron-300)' : 'var(--green-300)',
            fontWeight: 600,
          }}>
            💧 {soil.irrigation_recommendation}
          </div>
          <div className="data-source" style={{ marginTop: 12 }}>📡 Source: NASA POWER · Data for {soil.data_date}</div>
        </>
      ) : (
        <div style={{ color: 'var(--saffron-300)', fontSize: '0.9rem' }}>
          ⚠️ Live soil data unavailable. Check back shortly.
        </div>
      )}
    </div>
  );
}

function PriceCard({ price, loading, crop }: { price: PriceData | null; loading: boolean; crop: string }) {
  if (loading) return (
    <div className="glass-card" style={{ padding: '24px', minHeight: 220 }}>
      <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 48, width: '70%', marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 40, width: '100%' }} />
    </div>
  );

  return (
    <div className="glass-card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          📊 Mandi Price — మండీ ధర
        </h3>
        <LiveBadge fetched_at={price?.fetched_at} unavailable={!price || price.unavailable} />
      </div>

      {price?.cached && (
        <div className="warning-banner" style={{ marginBottom: 16 }}>
          <span className="icon">🕐</span>
          <p>{price.message}</p>
        </div>
      )}

      {price?.modal_price ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div className="stat-value saffron">₹{price.modal_price.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>/ Quintal</div>
            </div>
            <div className="stat-label">Modal Price — {price.market}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'rgba(74,191,103,0.08)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--green-300)' }}>₹{price.min_price?.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Min Price</div>
            </div>
            <div style={{ background: 'rgba(232,108,0,0.08)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--saffron-300)' }}>₹{price.max_price?.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Max Price</div>
            </div>
          </div>
          <div className="data-source">📡 Source: Data.gov.in — Agmarknet</div>
        </>
      ) : (
        <div style={{ color: 'var(--saffron-300)', fontSize: '0.9rem' }}>
          ⚠️ Live price data unavailable for {crop}.
        </div>
      )}
    </div>
  );
}

function speakTelugu(text: string, setSpeaking: (v: boolean) => void) {
  if (!window.speechSynthesis) { alert('Speech not supported in this browser.'); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);

  // Try to find a Telugu voice
  const voices = window.speechSynthesis.getVoices();
  const teluguVoice = voices.find(v => v.lang.startsWith('te') || v.lang === 'te-IN');
  const indianVoice = voices.find(v => v.lang.startsWith('hi') || v.lang.includes('IN'));
  utterance.voice = teluguVoice || indianVoice || null;
  utterance.lang = 'te-IN';
  utterance.rate = 0.85;
  utterance.pitch = 1.0;

  setSpeaking(true);
  utterance.onend = () => setSpeaking(false);
  utterance.onerror = () => setSpeaking(false);
  window.speechSynthesis.speak(utterance);
}

export default function DashboardPage() {
  const router = useRouter();
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [soil, setSoil] = useState<SoilData | null>(null);
  const [price, setPrice] = useState<PriceData | null>(null);
  const [advice, setAdvice] = useState<AdviceData | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [loadingSoil, setLoadingSoil] = useState(true);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [adviceError, setAdviceError] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('kisansaathi_farmer');
    if (!stored) { router.push('/'); return; }
    const f: Farmer = JSON.parse(stored);
    setFarmer(f);

    // Fetch all live data in parallel
    const lat = f.location_lat;
    const lon = f.location_lon;

    fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      .then(r => r.json())
      .then(setWeather)
      .catch(() => setWeather({ fetched_at: new Date().toISOString(), unavailable: true }))
      .finally(() => setLoadingWeather(false));

    fetch(`/api/soil?lat=${lat}&lon=${lon}`)
      .then(r => r.json())
      .then(setSoil)
      .catch(() => setSoil({ fetched_at: new Date().toISOString(), unavailable: true }))
      .finally(() => setLoadingSoil(false));

    fetch(`/api/prices?commodity=${f.crop}`)
      .then(r => r.json())
      .then(setPrice)
      .catch(() => setPrice({ fetched_at: new Date().toISOString(), unavailable: true }))
      .finally(() => setLoadingPrice(false));
  }, [router]);

  const getAdvice = useCallback(async () => {
    if (!farmer) return;
    setLoadingAdvice(true);
    setAdvice(null);
    setAdviceError('');

    try {
      const res = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmer_id: farmer.id,
          crop: farmer.crop,
          growth_stage: farmer.growth_stage,
          lat: farmer.location_lat,
          lon: farmer.location_lon,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Agent failed');
      }
      const data: AdviceData = await res.json();
      setAdvice(data);
    } catch (err) {
      setAdviceError(String(err));
    } finally {
      setLoadingAdvice(false);
    }
  }, [farmer]);

  if (!farmer) return null;

  return (
    <main>
      <nav className="navbar">
        <a className="navbar-brand" href="/">
          <div className="navbar-logo">🌾</div>
          <div>
            <div className="navbar-title">KisanSaathi</div>
            <div className="navbar-subtitle">కిసాన్ సాతి</div>
          </div>
        </a>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{CROP_EMOJI[farmer.crop]} {farmer.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{farmer.village} · {farmer.crop} · {farmer.field_size_acres}ac</div>
          </div>
          <Link href="/history" className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 14px' }}>
            📜 History
          </Link>
          <button className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 14px' }} onClick={() => { localStorage.clear(); router.push('/'); }}>
            🔄 Change Farm
          </button>
        </div>
      </nav>

      <div className="page-container">
        {/* Header */}
        <div className="animate-fade-up" style={{ marginBottom: 32 }}>
          <h1 style={{ marginBottom: 8 }}>
            నమస్కారం, {farmer.name}! {CROP_EMOJI[farmer.crop]}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
            {farmer.crop.charAt(0).toUpperCase() + farmer.crop.slice(1)} · {farmer.growth_stage} · {farmer.village}, Guntur
          </p>
        </div>

        {/* 3 Live Data Cards */}
        <div className="grid-3 animate-fade-up" style={{ marginBottom: 32, animationDelay: '0.1s' }}>
          <WeatherCard weather={weather} loading={loadingWeather} />
          <SoilCard soil={soil} loading={loadingSoil} />
          <PriceCard price={price} loading={loadingPrice} crop={farmer.crop} />
        </div>

        {/* AI Advice Section */}
        <div className="advice-card animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <h2 style={{ marginBottom: 8 }}>🤖 AI సలహా — KisanSaathi Advice</h2>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Claude AI analyzes live weather + soil + mandi data and gives you one prioritized action in Telugu.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              {advice && (
                <button
                  id="speak-advice"
                  className={`btn ${speaking ? 'btn-saffron' : 'btn-ghost'}`}
                  onClick={() => speaking ? window.speechSynthesis.cancel() : speakTelugu(advice.advice_telugu, setSpeaking)}
                  style={{ padding: '10px 16px' }}
                >
                  {speaking ? '⏹️ Stop' : '🔊 వినండి'}
                </button>
              )}
              <button
                id="get-advice"
                className="btn btn-primary btn-lg"
                onClick={getAdvice}
                disabled={loadingAdvice}
                style={{ minWidth: 200 }}
              >
                {loadingAdvice ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Agent reasoning...
                  </span>
                ) : (
                  <>{advice ? '🔄 Refresh Advice' : '✨ Get AI Advice'}</>
                )}
              </button>
            </div>
          </div>

          {/* Safety warnings */}
          {advice?.safety_warnings && advice.safety_warnings.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {advice.safety_warnings.map((w, i) => (
                <div key={i} className="warning-banner">
                  <span className="icon">⚠️</span>
                  <p>{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Advice content */}
          {loadingAdvice ? (
            <div style={{ padding: '32px 0' }}>
              <div className="skeleton" style={{ height: 24, width: '30%', marginBottom: 16 }} />
              <div className="skeleton" style={{ height: 20, width: '90%', marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 20, width: '75%', marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 20, width: '85%' }} />
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 20, fontSize: '0.85rem' }}>
                🤖 Agent is fetching live data and reasoning... (5–15 seconds)
              </p>
            </div>
          ) : adviceError ? (
            <div className="warning-banner">
              <span className="icon">❌</span>
              <p>Error: {adviceError}. Please try again.</p>
            </div>
          ) : advice ? (
            <div className="animate-fade-in">
              {/* Telugu advice — main output */}
              <div style={{
                background: 'rgba(14, 50, 25, 0.6)',
                borderRadius: 'var(--radius-md)',
                padding: '24px',
                marginBottom: 16,
                border: '1px solid rgba(74, 191, 103, 0.2)',
              }}>
                <div className="advice-telugu-text">{advice.advice_telugu}</div>
              </div>

              {/* English summary */}
              {advice.advice_english && (
                <div style={{
                  padding: '14px 18px',
                  background: 'rgba(74,191,103,0.08)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(74,191,103,0.15)',
                  marginBottom: 16,
                }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>English Summary</span>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{advice.advice_english}</p>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="data-source">
                  🤖 Anthropic Claude · {new Date(advice.generated_at).toLocaleTimeString('en-IN')}
                </div>
                <button
                  id="toggle-reasoning"
                  className="btn btn-ghost"
                  style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  onClick={() => setShowReasoning(s => !s)}
                >
                  {showReasoning ? '▲ Hide Reasoning' : '▼ Show AI Reasoning Chain'}
                </button>
              </div>

              {showReasoning && advice.data_used && (
                <div className="animate-fade-in" style={{
                  marginTop: 16,
                  background: 'rgba(14, 50, 25, 0.8)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px',
                  border: '1px solid var(--card-border)',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 300,
                  overflowY: 'auto',
                }}>
                  <div style={{ color: 'var(--green-300)', fontWeight: 700, marginBottom: 8, fontFamily: 'Inter' }}>Live Data Used by Agent:</div>
                  <div style={{ color: 'var(--sky-300)', marginBottom: 4 }}>// Weather snapshot</div>
                  {JSON.stringify(advice.data_used.weather, null, 2)}
                  <div style={{ color: 'var(--sky-300)', margin: '8px 0 4px' }}>// Soil snapshot</div>
                  {JSON.stringify(advice.data_used.soil, null, 2)}
                  <div style={{ color: 'var(--sky-300)', margin: '8px 0 4px' }}>// Price snapshot</div>
                  {JSON.stringify(advice.data_used.price, null, 2)}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🌾</div>
              <p style={{ fontFamily: "'Noto Sans Telugu', sans-serif", fontSize: '1.1rem', marginBottom: 8 }}>
                సలహా పొందడానికి పై బటన్ నొక్కండి
              </p>
              <p style={{ fontSize: '0.88rem' }}>Click &quot;Get AI Advice&quot; to get your personalized Telugu recommendation</p>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
