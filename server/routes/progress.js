// server/routes/progress.js
import express2 from "express";
export default function progressRouter(db) {
  const router = express2.Router();

  // /api/today-count?id=123
  router.get("/api/today-count", (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).send("Fehlende subject_id");

    const sql = `
      SELECT COUNT(DISTINCT item) AS num_tasks_completed_today
      FROM raw_responses
      WHERE subject_id = ?
        AND DATE(timestamp, 'localtime') = DATE('now', 'localtime')
        AND item IS NOT NULL
    `;

    db.get(sql, [id], (err, row) => {
      if (err) return res.status(500).send("Fehler beim Zugriff auf raw_responses");
      res.json({
        subject_id: id,
        num_tasks_completed_today: row?.num_tasks_completed_today ?? 0,
      });
    });
  });

  return router;
}
