import dotenv from "dotenv";
dotenv.config();

import morgan from "morgan";

import express from "express";
import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { exec } from "child_process";              // ✅ NEU
import { router as scoreOpenRouter } from "./server/routes/score-open.js";



// --- __dirname für ESM herstellen ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- App/Config ---
const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());

// Statische Dateien besser absolut referenzieren (robust gegen working dir)
//app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("public"));
app.get("/manuale-scoring", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pages", "manuale-scoring.html"));
});

app.use(morgan("[:date[iso]] :method :url :status :res[content-length] - :response-time ms"));

// Datenbankverbindung
sqlite3.verbose(); // optional

const dbPath = path.join(__dirname, "data", "test.db");
console.log("SQLite DB:", dbPath);
const db = new sqlite3.Database(dbPath);
db.configure("busyTimeout", 3000);  // 3 Sekunden warten bei "database is locked"

/// Seeddaten importieren 
function estimateThetaRasch(data) {
	
	  // Sonderfälle zuerst prüfen:
  const allCorrect = data.every(d => d.score === 1);
  const allWrong   = data.every(d => d.score === 0);

  if (allCorrect) {
    return { theta: 3.000, se: 1 };  // Maximalwert
  }
  if (allWrong) {
    return { theta: -3.000, se: 1 };  // Minimalwert
  }
	
  // data: [{ item, score (0/1), threshold }]
  let theta = 0;
  const maxIter = 30;
  const tol = 1e-3;

  for (let iter = 0; iter < maxIter; iter++) {
    let L = 0; // 1. Ableitung der Log-Likelihood
    let I = 0; // Fisher-Information (2. Ableitung * -1)

    for (const d of data) {
      const b = Number(d.threshold);
      const u = Number(d.score); // 0 oder 1

      const expPart = Math.exp(theta - b);
      const P = expPart / (1 + expPart); // Rasch (1PL)
      const Q = 1 - P;

      L += (u - P);     // Score-Funktion
      I += (P * Q);     // Information
    }

    // Falls keine Information (z.B. alle 0 oder alle 1), brich ab
    if (I <= 1e-9) break;

    const step = L / I;
    theta += step;

    if (Math.abs(step) < tol) break;
  }

  // Standardfehler
  const info = data.reduce((acc, d) => {
    const b = Number(d.threshold);
    const expPart = Math.exp(theta - b);
    const P = expPart / (1 + expPart);
    const Q = 1 - P;
    return acc + P * Q;
  }, 0);

  const se = info > 0 ? 1 / Math.sqrt(info) : null;

  return { theta: Number(theta.toFixed(3)), se: se !== null ? Number(se.toFixed(3)) : null };
}



// Tabelle erstellen (wenn nicht vorhanden)


db.serialize(() => {
	// Tables
  db.run(`
    CREATE TABLE IF NOT EXISTS raw_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
	subject_id INTEGER,
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
  )
`);

  db.run(`
    CREATE TABLE IF NOT EXISTS human_scores (
      scorer TEXT NOT NULL,
      item INTEGER NOT NULL,
      normalized_answer TEXT NOT NULL,
      human_score INTEGER CHECK (human_score IN (0,1)),
      ts TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (scorer, item, normalized_answer)
    )
  `);
  
  // Views
  db.run(`DROP VIEW IF EXISTS clean_responses`);
  db.run(`DROP VIEW IF EXISTS ai_scores`);
  db.run(`DROP VIEW IF EXISTS subject_summary`);
  db.run(`DROP VIEW IF EXISTS consensus`);
  db.run(`DROP VIEW IF EXISTS human_pairwise_ir_v`);
  db.run(`DROP VIEW IF EXISTS human_ir_per_item_v`);
  db.run(`DROP VIEW IF EXISTS consensus_vs_ai_ir_v`);
	
// From row responses 
db.run(`
    CREATE VIEW IF NOT EXISTS clean_responses AS
    SELECT r.subject_id, r.item, r.score, r.timestamp
FROM raw_responses r
JOIN (
  SELECT subject_id, item, MIN(timestamp) AS timestamp
  FROM raw_responses
  GROUP BY subject_id, item
) firsts
  ON r.subject_id = firsts.subject_id
 AND r.item      = firsts.item
 AND r.timestamp= firsts.timestamp
 WHERE correct = 1 AND rt_fast = 0;
  `);
  
  db.run(`
  CREATE VIEW IF NOT EXISTS ai_scores AS
    SELECT r.subject_id, r.item, r.normalized_answer,r.llm_rationale, r.correct AS ai_score, r.timestamp
FROM raw_responses r
JOIN (
  SELECT subject_id, item, MIN(timestamp) AS timestamp
  FROM raw_responses
  GROUP BY subject_id, item
) firsts
  ON r.subject_id = firsts.subject_id
 AND r.item      = firsts.item
 AND r.timestamp= firsts.timestamp
 WHERE question_type = 'open' AND rt_fast = 0;
  `);
  
db.run(`
    CREATE VIEW IF NOT EXISTS subject_summary AS
	SELECT
  subject_id,
  SUM(points_awarded) AS total_points,
  COUNT(DISTINCT DATE(timestamp)) AS days_with_entries,
  MAX(DATE(timestamp)) AS last_entry_date,
  COUNT(*) AS num_tasks_completed
FROM raw_responses
WHERE correct = 1 AND rt_fast = 0
GROUP BY subject_id;
  `);
  
// From second view  
    db.run(`
  CREATE VIEW IF NOT EXISTS consensus AS
WITH agg AS (
  SELECT
    item,
    normalized_answer,
    COUNT(*) AS n_scores,
    SUM(CASE WHEN human_score = 1 THEN 1 ELSE 0 END) AS n_correct,
    SUM(CASE WHEN human_score = 0 THEN 1 ELSE 0 END) AS n_wrong
  FROM human_scores
  GROUP BY item, normalized_answer
),
human_consensus AS (
  SELECT
    item,
    normalized_answer,
    n_scores,
    n_correct,
    n_wrong,
    CASE WHEN n_correct >= 2 THEN 1 ELSE 0 END AS human_consensus_score
  FROM agg
  WHERE
    -- 2 Scorer, volle Übereinstimmung
    (n_scores = 2 AND (n_correct = 2 OR n_wrong = 2))
    OR
    -- 3 Scorer, mind. 2 gleich (Mehrheit)
    (n_scores = 3 AND (n_correct >= 2 OR n_wrong >= 2))
)
SELECT
  h.item,
  h.normalized_answer,
  h.human_consensus_score,
  a.ai_score,
  h.n_scores,
  h.n_correct,
  h.n_wrong
FROM human_consensus h
LEFT JOIN ai_scores a
  ON a.item = h.item
 AND a.normalized_answer = h.normalized_answer;

`);
 
 db.run(`
    CREATE VIEW IF NOT EXISTS human_pairwise_ir_v AS
WITH pairs AS (
  SELECT
    h1.item,
    h1.scorer AS r1,
    h2.scorer AS r2,
    h1.normalized_answer,
    h1.human_score AS s1,
    h2.human_score AS s2
  FROM human_scores h1
  JOIN human_scores h2
    ON h1.item = h2.item
   AND h1.normalized_answer = h2.normalized_answer
   AND h1.scorer < h2.scorer     -- jede Paarung genau einmal
),
per_pair AS (
  SELECT
    item,
    r1,
    r2,
    COUNT(*)                           AS n,
    SUM(CASE WHEN s1 = s2 THEN 1 ELSE 0 END) AS n_agree,
    SUM(s1)                            AS n_yes_r1,
    SUM(s2)                            AS n_yes_r2
  FROM pairs
  GROUP BY item, r1, r2
)
SELECT
  item,
  r1,
  r2,
  n,
  CAST(n_agree AS REAL)/n AS po,                           -- beobachtete Übereinstimmung
  -- erwartete Übereinstimmung: pe = p1*p2 + (1-p1)*(1-p2)
  CASE
    WHEN (1 - (1 - (CAST(n_yes_r1 AS REAL)/n) - (CAST(n_yes_r2 AS REAL)/n)
          + 2*(CAST(n_yes_r1 AS REAL)/n)*(CAST(n_yes_r2 AS REAL)/n))) = 0
    THEN NULL
    ELSE
      (
        (CAST(n_agree AS REAL)/n) -
        (1 - (CAST(n_yes_r1 AS REAL)/n) - (CAST(n_yes_r2 AS REAL)/n)
           + 2*(CAST(n_yes_r1 AS REAL)/n)*(CAST(n_yes_r2 AS REAL)/n))
      )
      /
      (
        1 - (1 - (CAST(n_yes_r1 AS REAL)/n) - (CAST(n_yes_r2 AS REAL)/n)
               + 2*(CAST(n_yes_r1 AS REAL)/n)*(CAST(n_yes_r2 AS REAL)/n))
      )
  END AS kappa
FROM per_pair;

`);

 db.run(`
CREATE VIEW IF NOT EXISTS human_ir_per_item_v AS
WITH base AS (
  SELECT item, n, po, kappa
  FROM human_pairwise_ir_v
)
SELECT
  item,
  SUM(n)                        AS n_total_pairs,
  SUM(po * n)  / SUM(n)         AS po_weighted,     -- Po über Paare, n-gewichtet
  CASE WHEN SUM(n) = 0 THEN NULL
       ELSE SUM(CASE WHEN kappa IS NULL THEN 0 ELSE kappa END * n) / SUM(n)
  END                           AS kappa_weighted   -- κ über Paare, n-gewichtet
FROM base
GROUP BY item;

`);

db.run(`
CREATE VIEW IF NOT EXISTS consensus_vs_ai_ir_v AS
WITH agg AS (
  SELECT
    item,
    normalized_answer,
    COUNT(*) AS n_scores,
    SUM(CASE WHEN human_score = 1 THEN 1 ELSE 0 END) AS n_correct,
    SUM(CASE WHEN human_score = 0 THEN 1 ELSE 0 END) AS n_wrong
  FROM human_scores
  GROUP BY item, normalized_answer
),
human_consensus AS (
  SELECT
    item,
    normalized_answer,
    n_scores,
    n_correct,
    n_wrong,
    CASE WHEN n_correct >= 2 THEN 1 ELSE 0 END AS human_consensus_score
  FROM agg
  WHERE
    (n_scores = 2 AND (n_correct = 2 OR n_wrong = 2))    -- 2 Rater, volle Übereinstimmung
    OR
    (n_scores = 3 AND (n_correct >= 2 OR n_wrong >= 2))  -- 3 Rater, Mehrheit
),
joined AS (
  SELECT
    h.item,
    h.normalized_answer,
    h.human_consensus_score,
    a.ai_score
  FROM human_consensus h
  JOIN ai_scores a
    ON a.item = h.item
   AND a.normalized_answer = h.normalized_answer
)
SELECT
  item,
  COUNT(*) AS n,                                                         -- Anzahl verglichener Antworten
  SUM(CASE WHEN human_consensus_score = ai_score THEN 1 ELSE 0 END) AS n_agree,
  CAST(SUM(CASE WHEN human_consensus_score = ai_score THEN 1 ELSE 0 END) AS REAL)/COUNT(*) AS po,
  -- Marginals:
  CAST(SUM(human_consensus_score) AS REAL)/COUNT(*) AS p_human1,
  CAST(SUM(ai_score) AS REAL)/COUNT(*)              AS p_ai1,
  -- Erwartete Übereinstimmung Pe = p_human1*p_ai1 + (1-p_human1)*(1-p_ai1)
  CASE
    WHEN (1 - (
      (CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(CAST(SUM(ai_score) AS REAL)/COUNT(*))
      + (1 - CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(1 - CAST(SUM(ai_score) AS REAL)/COUNT(*))
    )) = 0
    THEN NULL
    ELSE
      (
        (CAST(SUM(CASE WHEN human_consensus_score = ai_score THEN 1 ELSE 0 END) AS REAL)/COUNT(*))
        -
        (
          (CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(CAST(SUM(ai_score) AS REAL)/COUNT(*))
          + (1 - CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(1 - CAST(SUM(ai_score) AS REAL)/COUNT(*))
        )
      )
      /
      (
        1 -
        (
          (CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(CAST(SUM(ai_score) AS REAL)/COUNT(*))
          + (1 - CAST(SUM(human_consensus_score) AS REAL)/COUNT(*))*(1 - CAST(SUM(ai_score) AS REAL)/COUNT(*))
        )
      )
  END AS kappa
FROM joined
GROUP BY item;


`);
 
});

// scoring 





// Beim Start: Seed-Datei laden und in DB schreiben
function seedResp1Data() {
  const filePath = path.join(__dirname, "data", "seed_data.json");

  if (!fs.existsSync(filePath)) {
    console.log("Keine Seed-Datei gefunden.");
    return;
  }

  // Prüfen ob Tabelle bereits Einträge enthält
  db.get("SELECT COUNT(*) AS count FROM raw_responses", (err, result) => {
    if (err) {
      console.error("Fehler beim Zählen der raw_responses-Einträge:", err);
      return;
    }

    if (result.count > 0) {
      console.log("raw_responses enthält bereits Daten – Seed wird übersprungen.");
      return;
    }

    // Jetzt wirklich schreiben
    const rawData = fs.readFileSync(filePath);
    const rows = JSON.parse(rawData);

    console.log(`Starte Einfügen von ${rows.length} Zeilen in raw_responses...`);

    db.serialize(() => {
      const stmt = db.prepare(`
        INSERT INTO raw_responses (subject_id, trial_index, type,question_type, item, stimulus, response,normalized_answer, correct, rt_fast, rt, score, points_awarded, timestamp, llm_rationale) VALUES (?, ?, ?, ?, ?, ?, ?,?, ?, ?, ?, ? ,?,?,?)
      `);

      for (const row of rows) {
        stmt.run([row.subject_id,row.trial_index,row.type, row.question_type, row.item,row.stimulus,row.response,row.normalized_answer, row.correct,row.rt_fast,row.rt,row.score,row.points_awarded, row.timestamp, row.llm_rationale]);
      }

      stmt.finalize();
      console.log("Seed-Daten erfolgreich eingefügt.");
    });
  });
}

seedResp1Data();

// /api/subject-summary
app.get("/api/subject-summary", (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send("Fehlende subject_id");
  db.get(`SELECT * FROM subject_summary WHERE subject_id = ?`, [id], (err, row) => {
    if (err) return res.status(500).send("Fehler beim Zugriff auf subject_summary");
    res.json(row || null); // <- 200 + null statt 404
  });
});

// /api/theta
app.get("/api/theta", (req, res) => {
  const subjectId = req.query.id;
  if (!subjectId) return res.status(400).send("Missing subject_id");
  const sql = `
    SELECT r.subject_id, r.item,
           CASE WHEN r.score=2 THEN 1
                WHEN r.score=1 THEN 0
                ELSE 0 END AS score,
           p.threshold_1 AS threshold
    FROM clean_responses r
    JOIN item_parameters p ON r.item = p.item
    WHERE r.subject_id = ?`;
  db.all(sql, [subjectId], (err, rows) => {
    if (err) return res.status(500).send("Fehler bei Theta-Schätzung");
    if (!rows || rows.length === 0) return res.json(null); // <- 200 + null
    const result = estimateThetaRasch(rows);
    res.json({ subject_id: subjectId, theta: result.theta, se: result.se });
  });
});


app.get("/api/completed-items", (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send("Missing id");

  db.all(
    `SELECT DISTINCT item FROM raw_responses
     WHERE subject_id = ? AND correct = 1 AND rt_fast = 0`,
    [id],
    (err, rows) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).send("Database error");
      }
      const completedItems = rows.map(r => r.item);
      res.json(completedItems);
    }
  );
});

app.get("/api/item-params", (req, res) => {
  const sql = `
    SELECT item, threshold_1, threshold_2, first_threshold,
           points_first_try, points_later_try, weight
    FROM item_parameters
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("DB error /api/item-params:", err);
      return res.status(500).send("Database error");
    }
    res.json(rows || []);
  });
});

// API-Endpunkt zum Speichern
app.post("/api/save", (req, res) => {
  const data = req.body;
  const stmt = db.prepare(`INSERT INTO raw_responses (subject_id, trial_index, type,question_type, item, stimulus, response,normalized_answer, correct, rt_fast, rt, score, points_awarded, timestamp, llm_rationale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ,? ,? ,?)`);
  data.forEach(row => {
    stmt.run(
	  row.subject_id || null,
	  row.trial_index ?? null,
	  row.type ?? null,
	  row.question_type ?? null,
	  row.item || null,
	  row.stimulus || null,
	  row.response ?? null,
	  row.normalized_answer ?? null,
	  row.correct ? 1 : 0,
	  row.rt_fast ? 1 : 0,
      row.rt || null,
	  row.score ?? null,
      row.points_awarded ?? null,
      new Date().toISOString(),
	  row.llm_rationale ?? null
    );
  });
  stmt.finalize();
  res.status(200).send("Daten gespeichert");
  
   // ⬇️ Modell ggf. aktualisieren
  checkForModelUpdate();
});

import { createRequire } from "module";
const require = createRequire(import.meta.url);

function checkForModelUpdate() {
  const sql_last_update = `
    SELECT MAX(estDate) AS last_updated FROM item_parameters
  `;

  db.get(sql_last_update, (err, row) => {
    if (err) {
      console.error("❌ Fehler beim Lesen von item_parameters:", err);
      return;
    }

    const lastUpdate = row?.last_updated;
    if (!lastUpdate) {
      console.log("ℹ️ Noch kein Parametersatz vorhanden – Modell wird zum ersten Mal berechnet.");
      runRModelEstimation();
      return;
    }

    const sql_new_responses = `
      SELECT COUNT(*) AS new_responses
      FROM clean_responses
      WHERE timestamp > ?
    `;

    db.get(sql_new_responses, [lastUpdate], (err2, row2) => {
      if (err2) {
        console.error("❌ Fehler beim Zählen neuer Antworten:", err2);
        return;
      }

      const newResponses = row2?.new_responses || 0;

      if (newResponses >= 100) {
        console.log(`📈 ${newResponses} neue Antworten seit letzter Parameterschätzung – starte Modellschätzung...`);
        runRModelEstimation();
      } else {
        console.log(`🔍 Nur ${newResponses} neue Antworten seit letzter Schätzung – kein Update nötig.`);
      }
    });
  });
}

function runRModelEstimation() {
  exec("Rscript estimate.R", (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Fehler beim Ausführen des R-Skripts: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`⚠️ R stderr: ${stderr}`);
    }
    console.log(`📊 R-Ausgabe:\n${stdout}`);
  });
}


app.use(express.json({ limit: "1mb" }));
app.use(scoreOpenRouter);


// open-scoring
// GET /api/manuale/open?item=123&scorer=SCORER_ID
app.get("/api/manuale/open", (req, res) => {
  const item = Number(req.query.item);
  const scorer = String(req.query.scorer || "").trim();
  if (!item || !scorer) return res.status(400).json({ error: "Missing item or scorer" });

  const sql = `
    SELECT
      o.item,
      o.normalized_answer,
      SUM(CASE WHEN s.human_score IS NOT NULL THEN 1 ELSE 0 END) AS n_scores,
      SUM(CASE WHEN s.human_score = 1 THEN 1 ELSE 0 END) AS n_correct,
      SUM(CASE WHEN s.human_score = 0 THEN 1 ELSE 0 END) AS n_wrong,
      MAX(CASE WHEN s.scorer = ? THEN s.human_score END) AS my_score,
      GROUP_CONCAT(DISTINCT s.scorer) AS scorers_csv
    FROM ai_scores o
    LEFT JOIN human_scores s
      ON s.item = o.item AND s.normalized_answer = o.normalized_answer
    WHERE o.item = ?
    GROUP BY o.item, o.normalized_answer
    ORDER BY o.normalized_answer COLLATE NOCASE ASC
  `;

  db.all(sql, [scorer, item], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error", detail: err.message });

    const out = rows.map(r => {
      const n_scores = Number(r.n_scores || 0);
      const n_correct = Number(r.n_correct || 0);
      const n_wrong  = Number(r.n_wrong  || 0);
      const my_score = (r.my_score === 0 || r.my_score === 1) ? Number(r.my_score) : null;
      const scorers  = (r.scorers_csv || "").split(",").filter(Boolean);

      const hasDisagreement = (n_scores >= 2) && (n_correct > 0) && (n_wrong > 0);
      const iAlreadyScored = my_score !== null || scorers.includes(scorer);

      const needs_first_or_second = (n_scores < 2) && !iAlreadyScored;
      const needs_third = hasDisagreement && !iAlreadyScored;

      return {
        item: r.item,
        normalized_answer: r.normalized_answer,
        n_scores, n_correct, n_wrong,
        my_score,
        needs_first_or_second,
        needs_third,
        needs_me: needs_first_or_second || needs_third
      };
    });

    res.json(out);
  });
});

// POST /api/manuale/score
// body: { scorer, item, normalized_answer, human_score }
app.post("/api/manuale/score", (req, res) => {
  const { scorer, item, normalized_answer, human_score } = req.body || {};
  if (!scorer || !item || !normalized_answer || !(human_score === 0 || human_score === 1)) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  const sql = `
    INSERT INTO human_scores (scorer, item, normalized_answer, human_score)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(scorer, item, normalized_answer)
    DO UPDATE SET human_score = excluded.human_score, ts = datetime('now')
  `;
  db.run(sql, [scorer, item, normalized_answer, human_score], function (err) {
    if (err) return res.status(500).json({ error: "DB insert error" });
    res.json({ ok: true, changed: this.changes });
  });
});


app.listen(port, () => {
  console.log("Server läuft auf http://localhost:" + port);
});
