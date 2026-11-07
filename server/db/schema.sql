-- Job-Ready Dev Plan schema. Safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Onboarding answers (all changeable in Settings).
CREATE TABLE IF NOT EXISTS profiles (
  user_id           INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  level             TEXT NOT NULL,       -- beginner | some | builder
  hours             TEXT NOT NULL,       -- 1-2 | 3-4 | 5-6 | 7+
  track_months      INT  NOT NULL,       -- 6 | 9 | 12
  background        TEXT NOT NULL,       -- student | graduate | professional
  college_year      INT,
  start_date        DATE NOT NULL,
  rest_day          INT  NOT NULL,       -- 0=Sunday .. 6=Saturday
  goal              TEXT NOT NULL,       -- any | product | top
  original_finish   DATE NOT NULL,       -- finish date promised at onboarding
  track_changed_at  TIMESTAMPTZ,
  welcome_back_seen DATE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Content written in 1-2 week batches.
CREATE TABLE IF NOT EXISTS content_days (
  day_number INT PRIMARY KEY,
  week       INT  NOT NULL,
  phase      INT  NOT NULL,
  module_id  TEXT NOT NULL,
  title      TEXT NOT NULL,
  data       JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS modules (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  phase      INT  NOT NULL,
  skippable  BOOLEAN NOT NULL DEFAULT true,
  test       JSONB               -- { questions:[...], buildTask:{...} } or null
);

CREATE TABLE IF NOT EXISTS day_progress (
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_number    INT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open', -- open | completed | skipped_tested
  commit_url    TEXT,
  commit_verified BOOLEAN NOT NULL DEFAULT false,
  hints_used    INT NOT NULL DEFAULT 0,
  grade         TEXT,             -- clear | almost | not_yet | self
  completed_at  TIMESTAMPTZ,
  completed_on  DATE,             -- local calendar date of completion
  PRIMARY KEY (user_id, day_number)
);

-- Every GitHub commit submitted as proof. Streaks count only verified commits.
CREATE TABLE IF NOT EXISTS commits (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_number  INT NOT NULL,
  url         TEXT NOT NULL,
  sha         TEXT NOT NULL,
  verified    BOOLEAN NOT NULL,
  message     TEXT,
  commit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sha)
);

CREATE TABLE IF NOT EXISTS explain_attempts (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_number  INT NOT NULL,
  attempt_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  answers     JSONB NOT NULL,
  followup_q  TEXT,
  followup_a  TEXT,
  result      TEXT NOT NULL,      -- clear | almost | not_yet
  feedback    JSONB NOT NULL,
  graded_by   TEXT NOT NULL,      -- ai | self
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weak_topics (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_number  INT,
  topic       TEXT NOT NULL,
  source      TEXT NOT NULL,      -- explain_back | test_out | quiz
  resolved    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS module_tests (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id   TEXT NOT NULL,
  score       INT NOT NULL,
  total       INT NOT NULL,
  passed      BOOLEAN NOT NULL,
  weak        JSONB NOT NULL DEFAULT '[]',
  commit_url  TEXT,
  taken_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_results (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_number  INT NOT NULL,
  kind        TEXT NOT NULL,      -- aptitude | predict
  score       INT NOT NULL,
  total       INT NOT NULL,
  taken_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dsa_problems (
  id       TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  pattern  TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  url      TEXT NOT NULL,
  sort     INT NOT NULL
);

CREATE TABLE IF NOT EXISTS dsa_progress (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id TEXT NOT NULL REFERENCES dsa_problems(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,       -- solved | revisit
  notes      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, problem_id)
);

CREATE TABLE IF NOT EXISTS progress_log (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_number  INT NOT NULL,
  log_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  done        TEXT NOT NULL,
  hard        TEXT,
  minutes     INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_checks (
  user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id  TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
