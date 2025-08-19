// === file: server/routes/human_scoring.js =========================================
import express4 from "express";
export default function manualeRouter(db) {
  const router = express4.Router();

  // GET /api/manuale/open?item=123&scorer=SCORER_ID
  router.get("/api/manuale/open", (req, res) => {
    const item = Number(req.query.item);
    const scorer = String(req.query.scorer || "").trim();
    if (!item || !scorer) return res.status(400).json({ error: "Missing item or scorer" });
    const sql = `
      SELECT o.item, o.normalized_answer,
             SUM(CASE WHEN s.human_score IS NOT NULL THEN 1 ELSE 0 END) AS n_scores,
             SUM(CASE WHEN s.human_score = 1 THEN 1 ELSE 0 END) AS n_correct,
             SUM(CASE WHEN s.human_score = 0 THEN 1 ELSE 0 END) AS n_wrong,
             MAX(CASE WHEN s.scorer = ? THEN s.human_score END) AS my_score,
             GROUP_CONCAT(DISTINCT s.scorer) AS scorers_csv
      FROM ai_scores o
      LEFT JOIN human_scores s ON s.item = o.item AND s.normalized_answer = o.normalized_answer
      WHERE o.item = ?
      GROUP BY o.item, o.normalized_answer
      ORDER BY o.normalized_answer COLLATE NOCASE ASC`;
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
          needs_me: needs_first_or_second || needs_third,
        };
      });
      res.json(out);
    });
  });

  // POST /api/manuale/score
  router.post("/api/manuale/score", (req, res) => {
    const { scorer, item, normalized_answer, human_score } = req.body || {};
    if (!scorer || !item || !normalized_answer || !(human_score === 0 || human_score === 1)) {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }
    const sql = `
      INSERT INTO human_scores (scorer, item, normalized_answer, human_score)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(scorer, item, normalized_answer)
      DO UPDATE SET human_score = excluded.human_score, ts = datetime('now')`;
    db.run(sql, [scorer, item, normalized_answer, human_score], function (err) {
      if (err) return res.status(500).json({ error: "DB insert error" });
      res.json({ ok: true, changed: this.changes });
    });
  });

  return router;
}
