-- Run this in Supabase → SQL Editor

CREATE TABLE babies (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  dob TEXT,
  gender TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE babies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own babies" ON babies FOR ALL USING (auth.uid() = user_id);

CREATE TABLE diaper_logs (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  baby_id TEXT,
  event_type TEXT,
  event_time TEXT,
  changed BOOLEAN,
  change_time TEXT,
  delay_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE diaper_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own diaper_logs" ON diaper_logs FOR ALL USING (auth.uid() = user_id);

CREATE TABLE feeding_logs (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  baby_id TEXT,
  type TEXT,
  start_time BIGINT,
  end_time BIGINT,
  left_secs INTEGER,
  right_secs INTEGER,
  total_secs INTEGER,
  bottle_qty REAL,
  milk_type TEXT,
  unit TEXT,
  burped BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE feeding_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own feeding_logs" ON feeding_logs FOR ALL USING (auth.uid() = user_id);

CREATE TABLE sleep_logs (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  baby_id TEXT,
  start_time BIGINT,
  end_time BIGINT,
  total_secs INTEGER,
  wakeups INTEGER,
  notes TEXT,
  is_nap BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own sleep_logs" ON sleep_logs FOR ALL USING (auth.uid() = user_id);

CREATE TABLE growth_logs (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  baby_id TEXT,
  weight REAL,
  height REAL,
  head_circ REAL,
  unit TEXT,
  height_unit TEXT,
  notes TEXT,
  date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE growth_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own growth_logs" ON growth_logs FOR ALL USING (auth.uid() = user_id);

CREATE TABLE medicine_logs (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  baby_id TEXT,
  name TEXT,
  dose TEXT,
  unit TEXT,
  status TEXT,
  notes TEXT,
  time TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE medicine_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own medicine_logs" ON medicine_logs FOR ALL USING (auth.uid() = user_id);

CREATE TABLE vaccination_logs (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  baby_id TEXT,
  name TEXT,
  due_date TEXT,
  completed BOOLEAN DEFAULT false,
  completed_date TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE vaccination_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own vaccination_logs" ON vaccination_logs FOR ALL USING (auth.uid() = user_id);
