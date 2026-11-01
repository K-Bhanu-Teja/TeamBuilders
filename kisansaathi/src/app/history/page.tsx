'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type AdviceRecord = {
  id: string;
  created_at: string;
  advice_telugu: string;
  advice_english: string;
  weather_snapshot: Record<string, unknown>;
  price_snapshot: Record<string, unknown>;
  action_taken: boolean;
};

export default function HistoryPage() {
  const [history, setHistory] = useState<AdviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [farmerId, setFarmerId] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem('kisansaathi_farmer_id');
    setFarmerId(id);
    const url = id ? `/api/history?farmer_id=${id}` : '/api/history';
    fetch(url)
      .then(r => r.json())
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, []);

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
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/dashboard" className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
            ← Dashboard
          </Link>
        </div>
      </nav>

      <div className="page-container">
        <div className="animate-fade-up" style={{ marginBottom: 32 }}>
          <h1>📜 సలహా చరిత్ర — Advice History</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '0.9rem' }}>
            All AI advice records stored live in Supabase Postgres
            {farmerId && <span> · Filtered to your farm</span>}
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
            <h2 style={{ marginBottom: 12 }}>No advice history yet</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
              Go to the dashboard and click &quot;Get AI Advice&quot; to generate your first recommendation.
            </p>
            <Link href="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {history.map((record) => {
              const weather = record.weather_snapshot as { current?: { temperature?: number }; rainfall_next_24h?: number };
              const price = record.price_snapshot as { modal_price?: number; commodity?: string };
              return (
                <div key={record.id} className="glass-card animate-fade-up" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                        {new Date(record.created_at).toLocaleString('en-IN', {
                          dateStyle: 'medium', timeStyle: 'short'
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                            ₹{price.modal_price}/q
                          </span>
                        )}
                      </div>
                    </div>
                    {record.action_taken && (
                      <span style={{ padding: '4px 10px', background: 'rgba(74,191,103,0.15)', borderRadius: 20, fontSize: '0.72rem', color: 'var(--green-300)', border: '1px solid rgba(74,191,103,0.3)' }}>
                        ✅ Action Taken
                      </span>
                    )}
                  </div>

                  <p style={{ fontFamily: "'Noto Sans Telugu', sans-serif", fontSize: '1rem', lineHeight: 1.9, color: 'var(--text-primary)', marginBottom: 10 }}>
                    {record.advice_telugu}
                  </p>

                  {record.advice_english && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--card-border)', paddingTop: 10, marginTop: 10 }}>
                      {record.advice_english}
                    </p>
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
