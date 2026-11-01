'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CROP_STAGES } from '@/lib/agent/prompts';

const GUNTUR_VILLAGES = [
  'Guntur', 'Narasaraopet', 'Tenali', 'Chirala', 'Mangalagiri',
  'Sattenapalli', 'Vinukonda', 'Macherla', 'Ponnur', 'Repalle',
];

const CROP_COORDS: Record<string, { lat: number; lon: number }> = {
  guntur: { lat: 16.3008, lon: 80.4428 },
  narasaraopet: { lat: 16.2327, lon: 80.0490 },
  tenali: { lat: 16.2427, lon: 80.6393 },
  chirala: { lat: 15.8192, lon: 80.3521 },
};

export default function HomePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    village: 'Guntur',
    crop: 'chilli' as 'chilli' | 'cotton' | 'paddy',
    growth_stage: '',
    field_size_acres: 1,
    location_lat: 16.3008,
    location_lon: 80.4428,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const stages = CROP_STAGES[form.crop] || [];

  const handleCropChange = (crop: 'chilli' | 'cotton' | 'paddy') => {
    setForm(f => ({
      ...f,
      crop,
      growth_stage: CROP_STAGES[crop][0],
    }));
  };

  const handleVillageChange = (village: string) => {
    const coords = CROP_COORDS[village.toLowerCase()] || CROP_COORDS.guntur;
    setForm(f => ({ ...f, village, ...coords }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Please enter your name.'); return; }
    if (!form.growth_stage) { setError('Please select the crop growth stage.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/farmer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
      {/* Hero Section */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <nav className="navbar">
          <a className="navbar-brand" href="/">
            <div className="navbar-logo">🌾</div>
            <div>
              <div className="navbar-title">KisanSaathi</div>
              <div className="navbar-subtitle">కిసాన్ సాతి — AI Farming Assistant</div>
            </div>
          </a>
          <div className="live-badge live">Live AI Agent</div>
        </nav>

        <div className="page-container" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'center', width: '100%' }}>

            {/* Left: Hero text */}
            <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <span className="live-badge live">Live Weather</span>
                <span className="live-badge live">Live Soil Data</span>
                <span className="live-badge live">Live Mandi Prices</span>
              </div>

              <h1 style={{ marginBottom: '20px', color: 'var(--text-primary)' }}>
                మీ పొలానికి{' '}
                <span style={{ background: 'linear-gradient(135deg, var(--green-300), var(--saffron-300))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  AI సలహాదారు
                </span>
              </h1>
              <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '12px', fontFamily: "'Noto Sans Telugu', sans-serif" }}>
                గుంటూరు జిల్లా రైతులకు — మిరప, పత్తి, వరి పంటలకు
              </p>
              <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '40px', lineHeight: 1.8 }}>
                Real-time weather (IMD-class), soil moisture (NASA), and mandi prices (Agmarknet) — 
                analyzed by AI and delivered in Telugu.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {[
                  { icon: '🌦️', label: 'Open-Meteo', sub: 'Live weather' },
                  { icon: '🌱', label: 'NASA POWER', sub: 'Soil moisture' },
                  { icon: '📊', label: 'Agmarknet', sub: 'Mandi prices' },
                ].map(s => (
                  <div key={s.label} className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>{s.icon}</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--green-300)' }}>{s.label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Onboarding form */}
            <div className="glass-card animate-slide-in" style={{ padding: '40px', animationDelay: '0.2s' }}>
              <h2 style={{ marginBottom: '8px' }}>మీ వివరాలు నమోదు చేయండి</h2>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '28px' }}>
                Register your farm to get personalized AI advice
              </p>

              {error && (
                <div className="warning-banner" style={{ marginBottom: '20px' }}>
                  <span className="icon">⚠️</span>
                  <p>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="farmer-name">పేరు (Name) *</label>
                    <input
                      id="farmer-name"
                      className="form-input"
                      type="text"
                      placeholder="రైతు పేరు"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="farmer-phone">Phone (Optional)</label>
                    <input
                      id="farmer-phone"
                      className="form-input"
                      type="tel"
                      placeholder="Mobile number"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="farmer-village">గ్రామం (Village)</label>
                  <select
                    id="farmer-village"
                    className="form-select"
                    value={form.village}
                    onChange={e => handleVillageChange(e.target.value)}
                  >
                    {GUNTUR_VILLAGES.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">పంట ఎంచుకోండి (Select Crop) *</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {(['chilli', 'cotton', 'paddy'] as const).map(crop => (
                      <button
                        key={crop}
                        type="button"
                        id={`crop-${crop}`}
                        onClick={() => handleCropChange(crop)}
                        style={{
                          flex: 1,
                          padding: '12px 8px',
                          borderRadius: 'var(--radius-md)',
                          border: `2px solid ${form.crop === crop ? 'var(--green-400)' : 'var(--card-border)'}`,
                          background: form.crop === crop ? 'rgba(74, 191, 103, 0.15)' : 'rgba(14, 50, 25, 0.4)',
                          color: form.crop === crop ? 'var(--green-300)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          transition: 'var(--transition)',
                        }}
                      >
                        {crop === 'chilli' ? '🌶️ మిరప' : crop === 'cotton' ? '☁️ పత్తి' : '🌾 వరి'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="growth-stage">పంట దశ (Growth Stage) *</label>
                  <select
                    id="growth-stage"
                    className="form-select"
                    value={form.growth_stage}
                    onChange={e => setForm(f => ({ ...f, growth_stage: e.target.value }))}
                    required
                  >
                    <option value="">-- దశ ఎంచుకోండి --</option>
                    {stages.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="field-size">పొలం విస్తీర్ణం (Acres)</label>
                  <input
                    id="field-size"
                    className="form-input"
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.5"
                    value={form.field_size_acres}
                    onChange={e => setForm(f => ({ ...f, field_size_acres: parseFloat(e.target.value) }))}
                  />
                </div>

                <button
                  id="submit-profile"
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={loading}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
                >
                  {loading ? (
                    <>⏳ Saving...</>
                  ) : (
                    <>🚀 AI సలహా పొందండి — Get AI Advice</>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
