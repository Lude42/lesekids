// === file: server/db/schema.js ==============================================
// Creates tables & views (idempotent). Safe to call on every boot.
export function initSchema(db) {
  db.serialize(() => {
    // Tables
    db.run(`
      CREATE TABLE IF NOT EXISTS raw_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER,
		class_id INTEGER,
        trial_index INTEGER,
        type INTEGER,
        question_type TEXT,
        item INTEGER,
        stimulus INTEGER,
        response INTEGER,
        normalized_answer TEXT,
        correct INTEGER,
        rt_fast INTEGER,
        rt INTEGER,
        score INTEGER,
        points_awarded INTEGER,
        timestamp TEXT,
        llm_rationale TEXT
      )`);

    db.run(`
      CREATE TABLE IF NOT EXISTS human_scores (
        scorer TEXT NOT NULL,
        item INTEGER NOT NULL,
        normalized_answer TEXT NOT NULL,
        human_score INTEGER CHECK (human_score IN (0,1)),
        ts TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (scorer, item, normalized_answer)
      )`);
	  
	      db.run(`
      CREATE TABLE IF NOT EXISTS demographics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL UNIQUE,
  gen INTEGER,
  mon INTEGER,
  jhr INTEGER,
  lng INTEGER,
  msr INTEGER,
  bok INTEGER,
  po1 INTEGER, -- 0/1
  po2 INTEGER, -- 0/1
  po3 INTEGER, -- 0/1
  po4 INTEGER, -- 0/1
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);


    db.run(`
-- Einmalige Migration
CREATE TABLE IF NOT EXISTS motivation_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT NOT NULL,
  day TEXT NOT NULL,                 -- Format YYYY-MM-DD (lokale Zeit)
  -- Likert 1..5 bzw. 1..4
  mov11 INTEGER, mov12 INTEGER, mov13 INTEGER, mov14 INTEGER,
  mov15 INTEGER, mov16 INTEGER, mov17 INTEGER, mov18 INTEGER,
  mov21 INTEGER, mov22 INTEGER, mov23 INTEGER, mov24 INTEGER,
  mov25 INTEGER, mov26 INTEGER, mov27 INTEGER, mov28 INTEGER,
  lsk1  INTEGER, lsk2  INTEGER, lsk3  INTEGER, lsk4  INTEGER,
  lsk5  INTEGER, lsk6  INTEGER, lsk7  INTEGER, lsk8  INTEGER,
  lbvh1 INTEGER, lbvh2 INTEGER, lbvh3 INTEGER, lbvh4 INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(subject_id, day)
);

CREATE INDEX IF NOT EXISTS idx_motivation_daily_subject_day
ON motivation_daily(subject_id, day);
);

CREATE INDEX IF NOT EXISTS idx_motivation_subject ON motivation(subject_id);
);`);

    // Views (drop first to keep deterministic)
    db.run(`DROP VIEW IF EXISTS clean_responses`);
    db.run(`DROP VIEW IF EXISTS ai_scores`);
    db.run(`DROP VIEW IF EXISTS subject_summary`);
    db.run(`DROP VIEW IF EXISTS consensus`);
    db.run(`DROP VIEW IF EXISTS human_pairwise_ir_v`);
    db.run(`DROP VIEW IF EXISTS human_ir_per_item_v`);
    db.run(`DROP VIEW IF EXISTS consensus_vs_ai_ir_v`);

    db.run(`
      CREATE VIEW IF NOT EXISTS clean_responses AS
      SELECT subject_id,
           item,
           DATE(timestamp) as day,
           MAX(score) AS score
    FROM raw_responses
	WHERE item IS NOT NULL
    GROUP BY subject_id, item, DATE(timestamp);`);
	  
	      db.run(`
      CREATE VIEW IF NOT EXISTS clean_resp_first AS
      SELECT r.subject_id, r.item, r.rt, r.correct, r.response, r.question_type, r.timestamp
      FROM raw_responses r
      JOIN (
        SELECT subject_id, item, MIN(timestamp) AS timestamp
        FROM raw_responses
        GROUP BY subject_id, item
      ) firsts
        ON r.subject_id = firsts.subject_id
       AND r.item      = firsts.item
       AND r.timestamp = firsts.timestamp
      WHERE stimulus = -41 AND rt_fast = 0;`);

    db.run(`
      CREATE VIEW IF NOT EXISTS ai_scores AS
      SELECT r.subject_id, r.item, r.normalized_answer, r.llm_rationale, r.correct AS ai_score, r.timestamp
      FROM raw_responses r
      JOIN (
        SELECT subject_id, item, MIN(timestamp) AS timestamp
        FROM raw_responses
        GROUP BY subject_id, item
      ) firsts
        ON r.subject_id = firsts.subject_id
       AND r.item      = firsts.item
       AND r.timestamp = firsts.timestamp
      WHERE question_type = 'open' AND rt_fast = 0;`);

    db.run(`
      CREATE VIEW IF NOT EXISTS subject_summary AS
      SELECT
        subject_id,
        SUM(points_awarded) AS total_points,
        COUNT(DISTINCT DATE(timestamp)) AS days_with_entries,
        MAX(DATE(timestamp)) AS last_entry_date,
        COUNT(DISTINCT item) AS num_tasks_completed
      FROM raw_responses
      GROUP BY subject_id;`);
	  
db.run(`
CREATE VIEW IF NOT EXISTS live_session_summary AS
WITH today_raw AS (
  SELECT *
  FROM raw_responses
  WHERE DATE(timestamp, 'localtime') = DATE('now', 'localtime')
),
today_agg AS (
  SELECT
    subject_id,
    class_id,
    -- heutige bearbeitete Items (ohne "end/ende")
    COUNT(DISTINCT CASE
      WHEN item IS NOT NULL
       AND (question_type IS NULL OR lower(question_type) NOT IN ('end','ende'))
      THEN item
    END) AS num_tasks_completed,
    -- heute gestartet?
    MAX(CASE WHEN lower(question_type) = 'start' THEN 1 ELSE 0 END) AS has_start,
    -- heute beendet? (robust: end/ende)
    MAX(CASE WHEN lower(question_type) IN ('end','ende') THEN 1 ELSE 0 END) AS has_end
  FROM today_raw
  GROUP BY subject_id, class_id
)
SELECT
  sc.subject_id,
  sc.class_id,
  DATE('now','localtime') AS day,
  COALESCE(ta.num_tasks_completed, 0) AS num_tasks_completed,
  CASE
    WHEN COALESCE(ta.has_end,   0) = 1 THEN 2  -- beendet
    WHEN COALESCE(ta.has_start, 0) = 1 THEN 1  -- gestartet
    ELSE 0                                     -- in Klasse, heute kein Eintrag
  END AS status
FROM subject_class sc
LEFT JOIN today_agg ta
  ON ta.subject_id = sc.subject_id
 AND ta.class_id   = sc.class_id
;
`);


db.run(`
CREATE VIEW IF NOT EXISTS subject_class AS
SELECT DISTINCT
    subject_id,
    class_id
FROM raw_responses;

`);

    db.run(`
      CREATE VIEW IF NOT EXISTS consensus AS
      WITH agg AS (
        SELECT item, normalized_answer,
               COUNT(*) AS n_scores,
               SUM(CASE WHEN human_score = 1 THEN 1 ELSE 0 END) AS n_correct,
               SUM(CASE WHEN human_score = 0 THEN 1 ELSE 0 END) AS n_wrong
        FROM human_scores
        GROUP BY item, normalized_answer
      ),
      human_consensus AS (
        SELECT item, normalized_answer, n_scores, n_correct, n_wrong,
               CASE WHEN n_correct >= 2 THEN 1 ELSE 0 END AS human_consensus_score
        FROM agg
        WHERE (n_scores = 2 AND (n_correct = 2 OR n_wrong = 2))
           OR (n_scores = 3 AND (n_correct >= 2 OR n_wrong >= 2))
      )
      SELECT h.item, h.normalized_answer, h.human_consensus_score,
             a.ai_score, h.n_scores, h.n_correct, h.n_wrong
      FROM human_consensus h
      LEFT JOIN ai_scores a
        ON a.item = h.item AND a.normalized_answer = h.normalized_answer;`);

    db.run(`
      CREATE VIEW IF NOT EXISTS human_pairwise_ir_v AS
      WITH pairs AS (
        SELECT h1.item, h1.scorer AS r1, h2.scorer AS r2,
               h1.normalized_answer, h1.human_score AS s1, h2.human_score AS s2
        FROM human_scores h1
        JOIN human_scores h2
          ON h1.item = h2.item
         AND h1.normalized_answer = h2.normalized_answer
         AND h1.scorer < h2.scorer
      ),
      per_pair AS (
        SELECT item, r1, r2,
               COUNT(*) AS n,
               SUM(CASE WHEN s1 = s2 THEN 1 ELSE 0 END) AS n_agree,
               SUM(s1) AS n_yes_r1,
               SUM(s2) AS n_yes_r2
        FROM pairs
        GROUP BY item, r1, r2
      )
      SELECT item, r1, r2, n,
             CAST(n_agree AS REAL)/n AS po,
             CASE
               WHEN (1 - (1 - (CAST(n_yes_r1 AS REAL)/n) - (CAST(n_yes_r2 AS REAL)/n)
                         + 2*(CAST(n_yes_r1 AS REAL)/n)*(CAST(n_yes_r2 AS REAL)/n))) = 0
               THEN NULL
               ELSE (
                 (CAST(n_agree AS REAL)/n) -
                 (1 - (CAST(n_yes_r1 AS REAL)/n) - (CAST(n_yes_r2 AS REAL)/n)
                    + 2*(CAST(n_yes_r1 AS REAL)/n)*(CAST(n_yes_r2 AS REAL)/n))
               ) / (
                 1 - (1 - (CAST(n_yes_r1 AS REAL)/n) - (CAST(n_yes_r2 AS REAL)/n)
                        + 2*(CAST(n_yes_r1 AS REAL)/n)*(CAST(n_yes_r2 AS REAL)/n))
               )
             END AS kappa
      FROM per_pair;`);

    db.run(`
      CREATE VIEW IF NOT EXISTS human_ir_per_item_v AS
      WITH base AS (SELECT item, n, po, kappa FROM human_pairwise_ir_v)
      SELECT item,
             SUM(n) AS n_total_pairs,
             SUM(po * n) / SUM(n) AS po_weighted,
             CASE WHEN SUM(n) = 0 THEN NULL
                  ELSE SUM(CASE WHEN kappa IS NULL THEN 0 ELSE kappa END * n) / SUM(n)
             END AS kappa_weighted
      FROM base
      GROUP BY item;`);

    db.run(`
      CREATE VIEW IF NOT EXISTS consensus_vs_ai_ir_v AS
      WITH agg AS (
        SELECT item, normalized_answer, COUNT(*) AS n_scores,
               SUM(CASE WHEN human_score = 1 THEN 1 ELSE 0 END) AS n_correct,
               SUM(CASE WHEN human_score = 0 THEN 1 ELSE 0 END) AS n_wrong
        FROM human_scores
        GROUP BY item, normalized_answer
      ),
      human_consensus AS (
        SELECT item, normalized_answer, n_scores, n_correct, n_wrong,
               CASE WHEN n_correct >= 2 THEN 1 ELSE 0 END AS human_consensus_score
        FROM agg
        WHERE (n_scores = 2 AND (n_correct = 2 OR n_wrong = 2))
           OR (n_scores = 3 AND (n_correct >= 2 OR n_wrong >= 2))
      ),
      joined AS (
        SELECT h.item, h.normalized_answer, h.human_consensus_score, a.ai_score
        FROM human_consensus h
        JOIN ai_scores a ON a.item = h.item AND a.normalized_answer = h.normalized_answer
      )
      SELECT item,
             COUNT(*) AS n,
             SUM(CASE WHEN human_consensus_score = ai_score THEN 1 ELSE 0 END) AS n_agree,
             CAST(SUM(CASE WHEN human_consensus_score = ai_score THEN 1 ELSE 0 END) AS REAL)/COUNT(*) AS po,
             CAST(SUM(human_consensus_score) AS REAL)/COUNT(*) AS p_human1,
             CAST(SUM(ai_score) AS REAL)/COUNT(*) AS p_ai1,
             CASE
               WHEN (1 - ((CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(CAST(SUM(ai_score) AS REAL)/COUNT(*))
                          + (1 - CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(1 - CAST(SUM(ai_score) AS REAL)/COUNT(*)))) = 0
               THEN NULL
               ELSE (
                 (CAST(SUM(CASE WHEN human_consensus_score = ai_score THEN 1 ELSE 0 END) AS REAL)/COUNT(*)) -
                 ((CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(CAST(SUM(ai_score) AS REAL)/COUNT(*))
                  + (1 - CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(1 - CAST(SUM(ai_score) AS REAL)/COUNT(*)))
               ) / (
                 1 - ((CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(CAST(SUM(ai_score) AS REAL)/COUNT(*))
                      + (1 - CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(1 - CAST(SUM(ai_score) AS REAL)/COUNT(*)))
               )
             END AS kappa
      FROM joined
      GROUP BY item;`);
	  
	  // Nach deiner bisherigen DB-Initialisierung ergänzen:
db.exec(`
CREATE TABLE IF NOT EXISTS item_contents (
  item               INTEGER PRIMARY KEY,
  type               TEXT CHECK(type IN ('mc','open')) DEFAULT 'mc',
  que                TEXT,            -- HTML ok
  que2a              TEXT,            -- HTML ok
  tbar               TEXT,            -- TTS zu que2a (Plain Text)
  que2b              TEXT,            -- HTML ok
  tts_text_que2b     TEXT,            -- TTS zu que2b (Plain Text)
  opt1               TEXT,
  opt2               TEXT,
  opt3               TEXT,
  opt4               TEXT,
  fb1                TEXT,
  fb2                TEXT,
  fb3                TEXT,
  fb4                TEXT,
  explain            TEXT,
  cor                INTEGER,         -- 1..4 (bei open ggf. NULL)
  accept             TEXT,            -- z.B. "Giraffe, die Giraffe"
  reject             TEXT,
  Task1              TEXT,
  Task2              TEXT,
  Task3              TEXT,
  Context            TEXT,
  Gender             TEXT,
  Name               TEXT,
  updated_at         TEXT DEFAULT (datetime('now'))
);
`);

	  
  });
}
