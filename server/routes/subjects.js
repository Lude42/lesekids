// === file: server/routes/subjects.js ========================================
import express2 from "express";
import { estimateThetaRasch } from "../utils/rasch.js";
export default function subjectsRouter(db) {
  const router = express2.Router();

  // /api/subject-summary?id=123
  router.get("/api/subject-summary", (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).send("Fehlende subject_id");
    db.get(`SELECT * FROM subject_summary WHERE subject_id = ?`, [id], (err, row) => {
      if (err) return res.status(500).send("Fehler beim Zugriff auf subject_summary");
      res.json(row || null);
    });
  });

  // /api/theta?id=123
  router.get("/api/theta", (req, res) => {
    const subjectId = req.query.id;
    if (!subjectId) return res.status(400).send("Missing subject_id");
    const sql = `
      SELECT r.subject_id, r.item,
             CASE WHEN r.score=2 THEN 1 WHEN r.score=1 THEN 0 ELSE 0 END AS score,
             p.threshold_1 AS threshold
      FROM clean_responses r
      JOIN item_parameters p ON r.item = p.item
      WHERE r.subject_id = ?`;
    db.all(sql, [subjectId], (err, rows) => {
      if (err) return res.status(500).send("Fehler bei Theta-Schätzung");
      if (!rows || rows.length === 0) return res.json(null);
      const { theta, se } = estimateThetaRasch(rows);
      res.json({ subject_id: subjectId, theta, se });
    });
  });

  // /api/completed-items?id=123
  router.get("/api/completed-items", (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).send("Missing id");
    db.all(
      `SELECT DISTINCT item FROM raw_responses WHERE subject_id = ? AND correct = 1 AND rt_fast = 0`,
      [id],
      (err, rows) => {
        if (err) return res.status(500).send("Database error");
        res.json(rows.map(r => r.item));
      }
    );
  });

  return router;
}
