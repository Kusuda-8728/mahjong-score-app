-- 麻雀スコアアプリ用 matches テーブル
-- Supabase SQL Editor で実行してください

-- 対局データ（1対局 = 1レコード）
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),

  -- 対局日（ユーザーが設定した日付）
  game_date DATE NOT NULL,

  -- プレイヤー情報（A,B,C,D の順）
  player_a TEXT NOT NULL,
  player_b TEXT NOT NULL,
  player_c TEXT NOT NULL,
  player_d TEXT NOT NULL,

  -- 最終スコア（持ち点）
  score_a NUMERIC NOT NULL DEFAULT 0,
  score_b NUMERIC NOT NULL DEFAULT 0,
  score_c NUMERIC NOT NULL DEFAULT 0,
  score_d NUMERIC NOT NULL DEFAULT 0,

  -- 最終順位（1-4）
  rank_a INTEGER CHECK (rank_a BETWEEN 1 AND 4),
  rank_b INTEGER CHECK (rank_b BETWEEN 1 AND 4),
  rank_c INTEGER CHECK (rank_c BETWEEN 1 AND 4),
  rank_d INTEGER CHECK (rank_d BETWEEN 1 AND 4),

  -- トビ（4位かつ持ち点マイナス）フラグ
  tobi_a BOOLEAN DEFAULT FALSE,
  tobi_b BOOLEAN DEFAULT FALSE,
  tobi_c BOOLEAN DEFAULT FALSE,
  tobi_d BOOLEAN DEFAULT FALSE,

  -- チップ数（チップルールなしの場合は NULL）
  chip_a INTEGER,
  chip_b INTEGER,
  chip_c INTEGER,
  chip_d INTEGER,

  -- ルール設定
  uma_type TEXT DEFAULT '10-30',       -- 10-20, 10-30, 5-10, custom
  custom_uma JSONB,                   -- [1位,2位,3位,4位] のウマ配分
  tobi_bonus INTEGER DEFAULT 0,       -- トビ賞（0=なし）
  oka INTEGER DEFAULT 0,              -- オカ
  chip_value_type TEXT DEFAULT 'none',-- none, 500, 1000, custom
  chip_custom_value INTEGER,

  -- 生データ（局ごとの詳細を保持する場合）
  snapshot JSONB
);

-- インデックス（検索・フィルタ用）
CREATE INDEX IF NOT EXISTS idx_matches_game_date ON matches(game_date);
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON matches(created_at);

-- RLS を有効にする場合（匿名ユーザーも読み書き可の例）
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- 全ユーザーに読み書きを許可するポリシー（開発用・本番では要制限）
CREATE POLICY "Allow all for matches" ON matches
  FOR ALL
  USING (true)
  WITH CHECK (true);
