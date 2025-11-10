// server/routes/teacher-session.js
import express2 from "express";

export default function teacherSessionRouter(db) {
  const router = express2.Router();

  // GET /api/teacher/session?class=000
  router.get("/api/teacher/session", (req, res) => {
    const classId = req.query.class;
    if (!classId) return res.status(400).send("Fehlende class-ID (?class=...)");

    const sql = `
      SELECT
        day AS date,
        subject_id,
        num_tasks_completed,
        status
      FROM live_session_summary
      WHERE class_id = ?
      ORDER BY day DESC, subject_id ASC
    `;
    db.all(sql, [classId], (err, rows) => {
      if (err) return res.status(500).send("Fehler beim Zugriff auf raw_responses");
      res.json(rows ?? []);
    });
  });

  return router;
}
