// === file: server/routes/save.js ============================================
import express5 from "express";
import { attachModelUpdateService } from "../services/modelUpdate.js";
export default function saveRouter(db) {
  const router = express5.Router();
  const { checkForModelUpdate } = attachModelUpdateService(db);

  router.post("/api/save", (req, res) => {
    const data = Array.isArray(req.body) ? req.body : [];
    if (data.length === 0) return res.status(400).send("Expected an array of responses");
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      const stmt = db.prepare(`
        INSERT INTO raw_responses (
          subject_id, trial_index, type, question_type, item, stimulus, response,
          normalized_answer, correct, rt_fast, rt, score, points_awarded, timestamp, llm_rationale
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const row of data) {
        stmt.run([
          row.subject_id ?? null,
          row.trial_index ?? null,
          row.type ?? null,
          row.question_type ?? null,
          row.item ?? null,
          row.stimulus ?? null,
          row.response ?? null,
          row.normalized_answer ?? null,
          row.correct ? 1 : 0,
          row.rt_fast ? 1 : 0,
          row.rt ?? null,
          row.score ?? null,
          row.points_awarded ?? null,
          new Date().toISOString(),
          row.llm_rationale ?? null,
        ]);
      }
      stmt.finalize(err => {
        if (err) { db.run("ROLLBACK"); return res.status(500).send("Fehler beim Speichern"); }
        db.run("COMMIT", err2 => {
          if (err2) return res.status(500).send("Fehler beim Commit");
          res.status(200).send("Daten gespeichert");
          checkForModelUpdate(); // async
        });
      });
    });
  });

  return router;
}