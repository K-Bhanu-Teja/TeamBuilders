-- KisanSaathi Database Schema
-- Run this in Supabase SQL Editor to initialize the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- TABLE: farmer_profiles
-- ==========================================
CREATE TABLE IF NOT EXISTS farmer_profiles (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name            TEXT NOT NULL,
  phone           TEXT,
  village         TEXT NOT NULL,
  crop            TEXT NOT NULL CHECK (crop IN ('chilli', 'cotton', 'paddy')),
  growth_stage    TEXT NOT NULL,
  field_size_acres DECIMAL(6,2) DEFAULT 1.0,
  location_lat    DECIMAL(9,6) NOT NULL DEFAULT 16.3008,
  location_lon    DECIMAL(9,6) NOT NULL DEFAULT 80.4428,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- TABLE: advice_history
-- ==========================================
CREATE TABLE IF NOT EXISTS advice_history (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  farmer_id       UUID REFERENCES farmer_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  weather_snapshot JSONB,
  soil_snapshot   JSONB,
  price_snapshot  JSONB,
  advice_telugu   TEXT NOT NULL,
  advice_english  TEXT,
  action_taken    BOOLEAN DEFAULT FALSE
);

-- Index for fast lookup by farmer
CREATE INDEX IF NOT EXISTS idx_advice_farmer_id ON advice_history(farmer_id);
CREATE INDEX IF NOT EXISTS idx_advice_created_at ON advice_history(created_at DESC);

-- ==========================================
-- TABLE: price_cache
-- ==========================================
CREATE TABLE IF NOT EXISTS price_cache (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  commodity       TEXT NOT NULL UNIQUE,
  market          TEXT,
  min_price       DECIMAL(10,2),
  max_price       DECIMAL(10,2),
  modal_price     DECIMAL(10,2),
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- ROW LEVEL SECURITY (optional for demo)
-- ==========================================
-- For the hackathon, we'll allow all access through service role key
-- In production, enable RLS with proper policies

ALTER TABLE farmer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE advice_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_cache ENABLE ROW LEVEL SECURITY;

-- Allow all for service role (API routes use service key)
CREATE POLICY "Service role full access" ON farmer_profiles FOR ALL USING (true);
CREATE POLICY "Service role full access" ON advice_history FOR ALL USING (true);
CREATE POLICY "Service role full access" ON price_cache FOR ALL USING (true);
