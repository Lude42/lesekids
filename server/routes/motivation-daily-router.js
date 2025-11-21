// server/routes/motivation-daily-router.js
import express2 from "express";

export default function motivationDailyRouter(db) {
  const router = express2.Router();
  const toIntOrNull = (v) => (v === undefined || v === null || v === "" ? null : (Number.isFinite(+v) ? Math.trunc(+v) : null));

  // Hilfsfunktion: heutiges Datum in Server-Lokalzeit als YYYY-MM-DD
  const todaySQL = `DATE('now','localtime')`;

  // STATUS: /api/motivation-daily/status/:subject_id?day=YYYY-MM-DD
  router.get("/status/:subject_id", (req, res) => {
    const { subject_id } = req.params;
    const dayParam = req.query.day; // optional
    const sql = `
          SELECT day
    FROM motivation_daily
    WHERE subject_id = ?
      AND day >= DATE('now','localtime','-14 days')
    ORDER BY day DESC
    LIMIT 1
    `;
    db.get(sql, [subject_id, dayParam || null], (err, row) => {
      if (err) {
        console.error("[motivation-daily:status] DB-Fehler:", err.message);
        return res.status(500).json({ error: "DB-Fehler" });
      }
      res.json({ completed: !!row });
    });
  });

  // POST: /api/motivation-daily  (legt für heute ab, UNIQUE(subject_id, day))
  router.post("/", express2.json(), (req, res) => {
    const b = req.body || {};
    const {
      subject_id,
      mov11, mov12, mov13, mov14, mov15, mov16, mov17, mov18,
      mov21, mov22, mov23, mov24, mov25, mov26, mov27, mov28,
      lsk1,  lsk2,  lsk3,  lsk4,  lsk5,  lsk6,  lsk7,  lsk8,
      lbvh1, lbvh2, lbvh4
    } = b;
    const lbvh3 = b.lbvh3 ?? b.lbv3; // alias akzeptieren

    if (!subject_id) return res.status(400).json({ error: "subject_id fehlt" });

    const sql = `
      INSERT INTO motivation_daily (
        subject_id, day,
        mov11,mov12,mov13,mov14,mov15,mov16,mov17,mov18,
        mov21,mov22,mov23,mov24,mov25,mov26,mov27,mov28,
        lsk1,lsk2,lsk3,lsk4,lsk5,lsk6,lsk7,lsk8,
        lbvh1,lbvh2,lbvh3,lbvh4
      ) VALUES (
        ?, ${todaySQL},
        ?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,
        ?,?,?,?
      )
    `;

    const params = [
      subject_id,
      toIntOrNull(mov11), toIntOrNull(mov12), toIntOrNull(mov13), toIntOrNull(mov14),
      toIntOrNull(mov15), toIntOrNull(mov16), toIntOrNull(mov17), toIntOrNull(mov18),
      toIntOrNull(mov21), toIntOrNull(mov22), toIntOrNull(mov23), toIntOrNull(mov24),
      toIntOrNull(mov25), toIntOrNull(mov26), toIntOrNull(mov27), toIntOrNull(mov28),
      toIntOrNull(lsk1),  toIntOrNull(lsk2),  toIntOrNull(lsk3),  toIntOrNull(lsk4),
      toIntOrNull(lsk5),  toIntOrNull(lsk6),  toIntOrNull(lsk7),  toIntOrNull(lsk8),
      toIntOrNull(lbvh1), toIntOrNull(lbvh2), toIntOrNull(lbvh3), toIntOrNull(lbvh4),
    ];

    db.run(sql, params, function (err) {
      if (err) {
        if (String(err.message).includes("UNIQUE constraint failed: motivation_daily.subject_id, motivation_daily.day")) {
          return res.status(409).json({ error: "Heute bereits beantwortet" });
        }
        console.error("[motivation-daily:post] DB-Fehler:", err.message);
        return res.status(500).json({ error: "DB-Fehler" });
      }
      res.status(201).json({ ok: true, id: this.lastID });
    });
  });

  return router;
}
