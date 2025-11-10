// server/routes/motivation-router.js
import express2 from "express";

export default function motivationRouter(db) {
  const router = express2.Router();

  // kleine Helper: Integer oder null erzwingen
  const toIntOrNull = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };

  router.post("/", express2.json(), (req, res) => {
    // Frontend hat teils "lbv3" (ohne h) gesendet – akzeptiere beide
    const body = req.body || {};
    const {
      subject_id,
      mov11, mov12, mov13, mov14, mov15, mov16, mov17, mov18,
      mov21, mov22, mov23, mov24, mov25, mov26, mov27, mov28,
      lsk1, lsk2, lsk3, lsk4, lsk5, lsk6, lsk7, lsk8,
      lbvh1, lbvh2, lbvh4
    } = body;

    // alias: lbvh3 kommt evtl. als lbv3
    const lbvh3 = body.lbvh3 ?? body.lbv3;

    if (!subject_id) return res.status(400).json({ error: "subject_id fehlt" });

    const sql = `
      INSERT INTO motivation (
        subject_id,
        mov11, mov12, mov13, mov14, mov15, mov16, mov17, mov18,
        mov21, mov22, mov23, mov24, mov25, mov26, mov27, mov28,
        lsk1,  lsk2,  lsk3,  lsk4,  lsk5,  lsk6,  lsk7,  lsk8,
        lbvh1, lbvh2, lbvh3, lbvh4
      ) VALUES (
        ?, ?,?,?,?,?,?,?,?,
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

    // Debug bei Bedarf:
    // console.log("params.length", params.length); // -> 29

    db.run(sql, params, function (err) {
      if (err) {
        if (String(err.message).includes("UNIQUE constraint failed: motivation.subject_id")) {
          return res.status(409).json({ error: "Bereits vorhanden" });
        }
        console.error("[motivation] DB-Fehler:", err.message);
        return res.status(500).json({ error: "DB-Fehler" });
      }
      res.status(201).json({ ok: true, id: this.lastID });
    });
  });

  return router;
}
