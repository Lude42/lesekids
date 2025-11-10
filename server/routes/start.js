// server/routes/start.js
import express2 from "express";

export default function startRouter(db) {
  const router = express2.Router();

  router.post("/api/start", (req, res) => {
    const { subject_id, class_id } = req.body;
    if (!subject_id || !class_id) return res.status(400).json({ error: "Missing IDs" });

    const sql = `
      INSERT INTO raw_responses 
      (subject_id, class_id, trial_index, type, question_type, item, stimulus, response, normalized_answer, correct, rt_fast, rt, score, points_awarded, timestamp, llm_rationale)
      VALUES (?, ?, NULL, 0, 'start', NULL, -99, -9, NULL, NULL, 0, NULL, NULL, NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL)
    `;
    db.run(sql, [subject_id, class_id], function(err) {
      if (err) return res.status(500).json({ error: "DB insert failed" });
      res.json({ ok: true, rowid: this.lastID });
    });
  });

  return router;
}
