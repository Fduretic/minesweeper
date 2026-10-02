CREATE TABLE games (
  id UUID PRIMARY KEY,
  board JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  finished_at TIMESTAMPTZ,
  elapsed_ms INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX games_expiry_idx ON games (created_at);
CREATE TABLE scores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id UUID NOT NULL UNIQUE,
  initials VARCHAR(3) NOT NULL CHECK (initials ~ '^[A-Z0-9]{3}$'),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'expert')),
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  points INTEGER NOT NULL CHECK (points > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scores_ranking_idx ON scores (difficulty, elapsed_ms, created_at, id);
