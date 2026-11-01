'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  INDIA_STATES,
  STATE_DISTRICTS,
  ALL_LANGUAGES,
  LANGUAGE_LABELS,
  getUiStrings,
  getCropStages,
  getLocalizedStateName,
  getLocalizedDistrictName,
} from '@/lib/national-data';

const ALL_CROPS = [
  { id: 'chilli',    label: '🌶️ Chilli' },
  { id: 'cotton',    label: '☁️ Cotton' },
  { id: 'paddy',     label: '🌾 Paddy' },
  { id: 'wheat',     label: '🌿 Wheat' },
  { id: 'maize',     label: '🌽 Maize' },
  { id: 'groundnut', label: '🥜 Groundnut' },
  { id: 'sugarcane', label: '🎋 Sugarcane' },
  { id: 'soybean',   label: '🫘 Soybean' },
  { id: 'mustard',   label: '🌼 Mustard' },
  { id: 'onion',     label: '🧅 Onion' },
];

const STATE_LIST = Object.keys(INDIA_STATES).sort();

export default function HomePage() {
  const router = useRouter();

  // Field size input as string so user can clear and type decimal values without NaN issues
  const [fieldSize, setFieldSize] = useState('1');

  const [form, setForm] = useState({
    name:             '',
    phone:            '',
    state:            'Andhra Pradesh',
    district:         'Guntur',
    village:          '',
    crop:             'chilli',
    growth_stage:     '',
    field_size_acres: 1,
    language:         'English', // Default is English as requested
    location_lat:     16.3008,
    location_lon:     80.4428,
  });

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Active UI strings for the currently selected language
  const ui = getUiStrings(form.language);

  const districts = STATE_DISTRICTS[form.state] || [];
  // Dynamic growth stages in the current language
  const stages    = getCropStages(form.crop, form.language);
  const stateInfo = INDIA_STATES[form.state];

  // Initialize growth stage on mount if empty
  useEffect(() => {
    const initialStages = getCropStages(form.crop, form.language);
    if (!form.growth_stage && initialStages.length > 0) {
      setForm(f => ({ ...f, growth_stage: initialStages[0] }));
    }
  }, []);

  // When state changes: update default district, coords, main crop, and state default language
  useEffect(() => {
    if (!stateInfo) return;
    const firstDistrict = STATE_DISTRICTS[form.state]?.[0];
    const newCrop = stateInfo.mainCrops[0] || form.crop;
    const newLang = stateInfo.language || form.language;
    const newStages = getCropStages(newCrop, newLang);

    setForm(f => ({
      ...f,
      district:     firstDistrict?.name    || f.district,
      location_lat: firstDistrict?.lat     || stateInfo.lat,
      location_lon: firstDistrict?.lon     || stateInfo.lon,
      crop:         newCrop,
      language:     newLang,
      growth_stage: newStages[0] || '',
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.state]);

  // When district changes: update coordinates
  useEffect(() => {
    const d = districts.find(d => d.name === form.district);
    if (d) setForm(f => ({ ...f, location_lat: d.lat, location_lon: d.lon }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.district]);

  // Handle language change with smooth translation of currently selected growth stage
  const handleLanguageChange = (newLang: string) => {
    setForm(f => {
      const currentStages = getCropStages(f.crop, f.language);
      const newStages = getCropStages(f.crop, newLang);
      const currentIndex = currentStages.indexOf(f.growth_stage);
      const translatedStage = (currentIndex >= 0 && newStages[currentIndex])
        ? newStages[currentIndex]
        : (newStages[0] || '');

      return {
        ...f,
        language: newLang,
        growth_stage: translatedStage,
      };
    });
  };

  // Handle crop change
  const handleCropChange = (newCrop: string) => {
    setForm(f => {
      const newStages = getCropStages(newCrop, f.language);
      return {
        ...f,
        crop: newCrop,
        growth_stage: newStages[0] || '',
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim())     { setError('Please enter your name.'); return; }
    if (!form.growth_stage)    { setError('Please select crop growth stage.'); return; }
    if (!form.district)        { setError('Please select your district.'); return; }

    const parsedAcres = parseFloat(fieldSize);
    const validAcres = !isNaN(parsedAcres) && parsedAcres > 0 ? parsedAcres : 1;

    setLoading(true);
    try {
      const payload = {
        ...form,
        field_size_acres: validAcres,
      };

      const res = await fetch('/api/farmer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save profile');
      }
      const farmer = await res.json();
      localStorage.setItem('kisansaathi_farmer_id', farmer.id);
      localStorage.setItem('kisansaathi_farmer', JSON.stringify(farmer));
      router.push('/dashboard');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Navbar */}
        <nav className="navbar">
          <a className="navbar-brand" href="/">
            <div className="navbar-logo">🌾</div>
            <div>
              <div className="navbar-title">KisanSaathi</div>
              <div className="navbar-subtitle">{ui.welcome} · {form.language}</div>
            </div>
          </a>

          {/* Quick Language Switcher in Header */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>🗣️ Language:</span>
            <select
              value={form.language}
              onChange={e => handleLanguageChange(e.target.value)}
              style={{
                background: 'rgba(14, 50, 25, 0.8)',
                color: 'var(--green-300)',
                border: '1px solid var(--green-400)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {ALL_LANGUAGES.map(lang => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang] || lang}
                </option>
              ))}
            </select>
          </div>
        </nav>

        <div className="page-container" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'start', width: '100%' }}>

            {/* Left: Dynamic Hero Section */}
            <div className="animate-fade-up" style={{ animationDelay: '0.1s', paddingTop: 20 }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <span className="live-badge live">{ui.live_agent_badge}</span>
                <span className="live-badge live">20 States</span>
                <span className="live-badge live">10 Crops</span>
              </div>

              <h1 style={{ marginBottom: '20px', color: 'var(--text-primary)' }}>
                {ui.hero_title_1}{' '}
                <span style={{ background: 'linear-gradient(135deg, var(--green-300), var(--saffron-300))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  {ui.hero_title_highlight}
                </span>
              </h1>
              <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                {ui.hero_subtitle}
              </p>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '32px', lineHeight: 1.8 }}>
                {ui.hero_description}
              </p>

              {/* Data source live badges */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: 28 }}>
                {[
                  { icon: '🌦️', label: 'Open-Meteo', sub: ui.weather },
                  { icon: '🌱', label: 'NASA POWER',  sub: ui.soil },
                  { icon: '📊', label: 'Agmarknet',   sub: ui.mandi_price },
                ].map(s => (
                  <div key={s.label} className="glass-card" style={{ padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>{s.icon}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--green-300)' }}>{s.label}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Quick Language Pills */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: 4 }}>Select:</span>
                {ALL_LANGUAGES.map(l => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => handleLanguageChange(l)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 16,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: form.language === l ? 'rgba(74,191,103,0.3)' : 'rgba(74,191,103,0.08)',
                      border: `1px solid ${form.language === l ? 'var(--green-400)' : 'rgba(74,191,103,0.2)'}`,
                      color: form.language === l ? 'var(--green-300)' : 'var(--text-secondary)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {LANGUAGE_LABELS[l] || l}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Dynamic Localized Form */}
            <div className="glass-card animate-slide-in" style={{ padding: '36px', animationDelay: '0.2s' }}>
              <h2 style={{ marginBottom: '6px' }}>{ui.login_heading}</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                {ui.login_subheading}
              </p>

              {error && (
                <div className="warning-banner" style={{ marginBottom: '16px' }}>
                  <span className="icon">⚠️</span><p>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                {/* Name + Phone */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="farmer-name">{ui.name_label}</label>
                    <input id="farmer-name" className="form-input" type="text" placeholder={ui.name_placeholder}
                      value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="farmer-phone">{ui.phone_label}</label>
                    <input id="farmer-phone" className="form-input" type="tel" placeholder={ui.phone_placeholder}
                      value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                </div>

                {/* State + Language */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="state-select">{ui.state_label}</label>
                    <select id="state-select" className="form-select"
                      value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
                      {STATE_LIST.map(s => (
                        <option key={s} value={s}>
                          {form.language === 'English'
                            ? s
                            : `${getLocalizedStateName(s, form.language)} (${s})`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="language-select">{ui.language_label}</label>
                    <select id="language-select" className="form-select"
                      value={form.language} onChange={e => handleLanguageChange(e.target.value)}>
                      {ALL_LANGUAGES.map(l => (
                        <option key={l} value={l}>
                          {LANGUAGE_LABELS[l] || l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* District + Village */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="district-select">{ui.district_label}</label>
                    <select id="district-select" className="form-select"
                      value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))}>
                      {districts.map(d => (
                        <option key={d.name} value={d.name}>
                          {form.language === 'English'
                            ? d.name
                            : `${getLocalizedDistrictName(d.name, form.language)} (${d.name})`}
                        </option>
                      ))}
                      {districts.length === 0 && (
                        <option value={form.district}>
                          {form.language === 'English'
                            ? form.district
                            : `${getLocalizedDistrictName(form.district, form.language)} (${form.district})`}
                        </option>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="village-input">{ui.village_label}</label>
                    <input id="village-input" className="form-input" type="text" placeholder={ui.village_placeholder}
                      value={form.village} onChange={e => setForm(f => ({ ...f, village: e.target.value }))} />
                  </div>
                </div>

                {/* Crop selector */}
                <div className="form-group">
                  <label className="form-label">{ui.crop_label}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                    {ALL_CROPS.map(crop => (
                      <button key={crop.id} type="button"
                        id={`crop-${crop.id}`}
                        onClick={() => handleCropChange(crop.id)}
                        style={{
                          padding: '10px 6px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                          border: `2px solid ${form.crop === crop.id ? 'var(--green-400)' : 'var(--card-border)'}`,
                          background: form.crop === crop.id ? 'rgba(74,191,103,0.15)' : 'rgba(14,50,25,0.4)',
                          color: form.crop === crop.id ? 'var(--green-300)' : 'var(--text-secondary)',
                          fontSize: '0.72rem', fontWeight: 700, textAlign: 'center', transition: 'var(--transition)',
                        }}>
                        {crop.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Growth stage + Acres */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="growth-stage">{ui.stage_label}</label>
                    <select
                      id="growth-stage"
                      className="form-select"
                      required
                      value={form.growth_stage}
                      onChange={e => setForm(f => ({ ...f, growth_stage: e.target.value }))}
                    >
                      <option value="">{ui.stage_placeholder}</option>
                      {stages.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="field-size">{ui.field_size_label}</label>
                    <input
                      id="field-size"
                      className="form-input"
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 1, 2.5, 5"
                      value={fieldSize}
                      onChange={e => {
                        const val = e.target.value;
                        // Allow empty string, numbers, and single decimal point
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setFieldSize(val);
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Live telemetry coordinates summary */}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '8px 12px', background: 'rgba(74,191,103,0.05)', borderRadius: 8 }}>
                  📍 {form.language === 'English'
                    ? `${form.district}, ${form.state}`
                    : `${getLocalizedDistrictName(form.district, form.language)}, ${getLocalizedStateName(form.state, form.language)}`} · {form.location_lat.toFixed(4)}°N, {form.location_lon.toFixed(4)}°E · 🗣️ {LANGUAGE_LABELS[form.language] || form.language}
                </div>

                <button id="submit-profile" type="submit" className="btn btn-primary btn-lg"
                  disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
                  {loading ? ui.saving_btn : ui.submit_btn}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
