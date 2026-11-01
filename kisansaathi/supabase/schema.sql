-- KisanSaathi National Database Schema (v3 — All India & Multi-Language)
-- Run this in Supabase SQL Editor → New Query → Run

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================================
-- OPTION A: If you already ran previous schema, run these MIGRATION queries:
-- =========================================================================
ALTER TABLE IF EXISTS farmer_profiles ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'Andhra Pradesh';
ALTER TABLE IF EXISTS farmer_profiles ADD COLUMN IF NOT EXISTS district TEXT DEFAULT 'Guntur';
ALTER TABLE IF EXISTS farmer_profiles ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'Telugu';
ALTER TABLE IF EXISTS farmer_profiles DROP CONSTRAINT IF EXISTS farmer_profiles_crop_check;

-- =========================================================================
-- OPTION B: Fresh Install (Clean Slate)
-- =========================================================================
CREATE TABLE IF NOT EXISTS farmer_profiles (
  id                UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  name              TEXT         NOT NULL,
  phone             TEXT,
  state             TEXT         NOT NULL DEFAULT 'Andhra Pradesh',
  district          TEXT         NOT NULL DEFAULT 'Guntur',
  village           TEXT         DEFAULT '',
  crop              TEXT         NOT NULL,
  growth_stage      TEXT         NOT NULL,
  field_size_acres  DECIMAL(6,2) DEFAULT 1.0,
  language          TEXT         NOT NULL DEFAULT 'Telugu',
  location_lat      DECIMAL(9,6) NOT NULL DEFAULT 16.3008,
  location_lon      DECIMAL(9,6) NOT NULL DEFAULT 80.4428,
  created_at        TIMESTAMPTZ  DEFAULT NOW()
);

-- ==========================================
-- TABLE: advice_history
-- ==========================================
CREATE TABLE IF NOT EXISTS advice_history (
  id               UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  farmer_id        UUID        REFERENCES farmer_profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  weather_snapshot JSONB,
  soil_snapshot    JSONB,
  price_snapshot   JSONB,
  advice_telugu    TEXT        NOT NULL, -- stores localized advice in farmer's language
  advice_english   TEXT,
  action_taken     BOOLEAN     DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_advice_farmer_id  ON advice_history(farmer_id);
CREATE INDEX IF NOT EXISTS idx_advice_created_at ON advice_history(created_at DESC);

-- ==========================================
-- TABLE: price_cache
-- ==========================================
CREATE TABLE IF NOT EXISTS price_cache (
  id          UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  commodity   TEXT         NOT NULL UNIQUE, -- crop__state format
  market      TEXT,
  min_price   DECIMAL(10,2),
  max_price   DECIMAL(10,2),
  modal_price DECIMAL(10,2),
  fetched_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ==========================================
-- ROW LEVEL SECURITY
-- ==========================================
ALTER TABLE farmer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE advice_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_cache      ENABLE ROW LEVEL SECURITY;

-- Allow all operations via service role / anon key for the hackathon
DROP POLICY IF EXISTS "allow_all_farmer_profiles" ON farmer_profiles;
DROP POLICY IF EXISTS "allow_all_advice_history"  ON advice_history;
DROP POLICY IF EXISTS "allow_all_price_cache"     ON price_cache;

CREATE POLICY "allow_all_farmer_profiles" ON farmer_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_advice_history"  ON advice_history  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_price_cache"     ON price_cache     FOR ALL USING (true) WITH CHECK (true);
