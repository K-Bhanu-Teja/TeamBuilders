'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getUiStrings,
  getHistoryUiStrings,
  ALL_LANGUAGES,
  LANGUAGE_LABELS,
  getLocalizedStateName,
  getLocalizedDistrictName,
} from '@/lib/national-data';

type AdviceRecord = {
  id: string;
  created_at: string;
  advice_telugu: string;
  advice_english: string;
  weather_snapshot: Record<string, unknown>;
  price_snapshot: Record<string, unknown>;
  action_taken: boolean;
};

type Farmer = {
  id: string;
  name: string;
  crop: string;
  state: string;
  district: string;
  language: string;
};

const LANGUAGE_CODES: Record<string, string> = {
  English:   'en-IN',
  Telugu:    'te-IN',
  Hindi:     'hi-IN',
  Tamil:     'ta-IN',
  Marathi:   'mr-IN',
  Punjabi:   'pa-IN',
  Kannada:   'kn-IN',
  Bengali:   'bn-IN',
  Gujarati:  'gu-IN',
  Malayalam: 'ml-IN',
  Odia:      'or-IN',
  Assamese:  'as-IN',
};

function speakInLanguage(text: string, language: string, onSpeakingChange: (speaking: boolean) => void) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const targetCode = LANGUAGE_CODES[language] || 'en-IN';
  const prefix = targetCode.split('-')[0].toLowerCase();
  const voices = window.speechSynthesis.getVoices();

  const exactVoice = voices.find(v =>
    v.lang.toLowerCase() === targetCode.toLowerCase() ||
    v.lang.toLowerCase().replace('_', '-') === targetCode.toLowerCase()
  );
  const langVoice = voices.find(v => v.lang.toLowerCase().startsWith(prefix));

  if (exactVoice || langVoice) {
    utterance.voice = exactVoice || langVoice || null;
  }
  utterance.lang = targetCode;
  utterance.rate = 0.85;
  utterance.pitch = 1.0;

  onSpeakingChange(true);
  utterance.onend = () => onSpeakingChange(false);
  utterance.onerror = () => onSpeakingChange(false);
  window.speechSynthesis.speak(utterance);
}

export default function HistoryPage() {
  const [history, setHistory] = useState<AdviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [language, setLanguage] = useState<string>('English');
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  useEffect(() => {
    // Load farmer profile
    const rawFarmer = localStorage.getItem('kisansaathi_farmer');
    const id = localStorage.getItem('kisansaathi_farmer_id');
    if (rawFarmer) {
      try {
        const parsed = JSON.parse(rawFarmer);
        setFarmer(parsed);
        if (parsed.language) setLanguage(parsed.language);
      } catch (e) {
        console.warn('Failed to parse farmer profile:', e);
      }
    }

    const url = id ? `/api/history?farmer_id=${id}` : '/api/history';
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setHistory(data);
        else setHistory([]);
      })
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, []);

  const ui = getUiStrings(language);
  const hui = getHistoryUiStrings(language);

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    if (farmer) {
      const updated = { ...farmer, language: newLang };
      setFarmer(updated);
      localStorage.setItem('kisansaathi_farmer', JSON.stringify(updated));
    }
    // Stop any audio when language changes
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
    }
  };

  return (
    <main>
      <nav className="navbar">
        <a className="navbar-brand" href="/">
          <div className="navbar-logo">🌾</div>
          <div>
            <div className="navbar-title">KisanSaathi</div>
            <div className="navbar-subtitle">{ui.welcome} · {language}</div>
          </div>
        </a>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {farmer && (
            <div style={{ textAlign: 'right', display: 'none', md: 'block' } as React.CSSProperties}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{farmer.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {language === 'English'
                  ? `${farmer.district}, ${farmer.state}`
                  : `${getLocalizedDistrictName(farmer.district, language)}, ${getLocalizedStateName(farmer.state, language)}`}
              </div>
            </div>
          )}

          {/* Language Selector */}
          <select
            value={language}
            onChange={e => handleLanguageChange(e.target.value)}
            style={{
              background: 'rgba(14, 50, 25, 0.8)',
              color: 'var(--green-300)',
              border: '1px solid var(--green-400)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '0.82rem',
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

          <Link href="/dashboard" className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
            ← {hui.dashboard}
          </Link>
        </div>
      </nav>

      <div className="page-container">
        <div className="animate-fade-up" style={{ marginBottom: 32 }}>
          <h1>📜 {hui.history_title}</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '0.9rem' }}>
            {hui.history_subtitle}
            {farmer && <span> · {hui.filtered_desc}</span>}
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="glass-card" style={{ padding: 24, minHeight: 100 }}>
                <div className="skeleton" style={{ height: 16, width: '30%', marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 40, width: '90%' }} />
              </div>
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="glass-card" style={{ padding: '60px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>📭</div>
            <h2 style={{ marginBottom: 12 }}>{hui.no_history_title}</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
              {hui.no_history_desc}
            </p>
            <Link href="/dashboard" className="btn btn-primary">{hui.back_to_dashboard}</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {history.map((record) => {
              const weather = record.weather_snapshot as { current?: { temperature?: number }; rainfall_next_24h?: number };
              const price = record.price_snapshot as { modal_price?: number; commodity?: string };
              const isSpeaking = speakingId === record.id;

              return (
                <div key={record.id} className="glass-card animate-fade-up" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                        {new Date(record.created_at).toLocaleString('en-IN', {
                          dateStyle: 'medium', timeStyle: 'short'
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {weather?.current?.temperature !== undefined && (
                          <span style={{ padding: '3px 8px', background: 'rgba(56,189,248,0.1)', borderRadius: 12, fontSize: '0.72rem', color: 'var(--sky-300)' }}>
                            🌡️ {weather.current.temperature}°C
                          </span>
                        )}
                        {weather?.rainfall_next_24h !== undefined && (
                          <span style={{ padding: '3px 8px', background: 'rgba(56,189,248,0.1)', borderRadius: 12, fontSize: '0.72rem', color: 'var(--sky-300)' }}>
                            🌧️ {weather.rainfall_next_24h}mm
                          </span>
                        )}
                        {price?.modal_price && (
                          <span style={{ padding: '3px 8px', background: 'rgba(232,108,0,0.1)', borderRadius: 12, fontSize: '0.72rem', color: 'var(--saffron-300)' }}>
                            ₹{price.modal_price.toLocaleString('en-IN')}/q
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {/* Audio read aloud button */}
                      <button
                        type="button"
                        onClick={() => {
                          if (isSpeaking) {
                            window.speechSynthesis.cancel();
                            setSpeakingId(null);
                          } else {
                            speakInLanguage(
                              record.advice_telugu || record.advice_english,
                              language,
                              (spk) => setSpeakingId(spk ? record.id : null)
                            );
                          }
                        }}
                        className={`btn ${isSpeaking ? 'btn-saffron' : 'btn-ghost'}`}
                        style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                      >
                        {isSpeaking ? `⏹️ ${ui.stop}` : `🔊 ${ui.listen}`}
                      </button>

                      {record.action_taken && (
                        <span style={{ padding: '4px 10px', background: 'rgba(74,191,103,0.15)', borderRadius: 20, fontSize: '0.72rem', color: 'var(--green-300)', border: '1px solid rgba(74,191,103,0.3)' }}>
                          ✅ {hui.action_taken}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Localized Advice in the recorded native language */}
                  <p style={{ fontSize: '1.02rem', lineHeight: 1.8, color: 'var(--text-primary)', marginBottom: 12 }}>
                    {record.advice_telugu}
                  </p>

                  {/* English Summary */}
                  {record.advice_english && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--card-border)', paddingTop: 10, marginTop: 10 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{ui.english_summary}: </span>
                      {record.advice_english}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
