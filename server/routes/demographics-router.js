// server/routes/demographics-router.js
import express from "express";

export default function demographicsRouter(db) {
  const router = express.Router();

  // --- Helper: save_dem ---
  async function save_dem(payload) {
    const {
      subject_id, gen, mon, jhr, lng, msr, bok, po1, po2, po3, po4,
    } = payload;

    if (!subject_id) {
      const err = new Error("subject_id fehlt");
      err.status = 400;
      throw err;
    }

    // Versuche Insert; wenn subject_id schon existiert -> 409
    const sql =
      `INSERT INTO demographics
       (subject_id, gen, mon, jhr, lng, msr, bok, po1, po2, po3, po4)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      subject_id, gen ?? null, mon ?? null, jhr ?? null, lng ?? null, msr ?? null,
      bok ?? null,
      (po1 ?? null), (po2 ?? null), (po3 ?? null), (po4 ?? null),
    ];

    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) {
          // SQLite constraint -> bereits vorhanden
          if (String(err.message).includes("UNIQUE constraint failed: demographics.subject_id")) {
            const e = new Error("Demografie bereits vorhanden");
            e.status = 409;
            return reject(e);
          }
          return reject(err);
        }
        resolve({ insertedId: this.lastID });
      });
    });
  }

  // GET /api/demographics/status/:subject_id
router.get("/status/:subject_id", (req, res) => {
  const { subject_id } = req.params;
  db.get(
    `SELECT 1 FROM demographics WHERE subject_id = ? LIMIT 1`,
    [subject_id],
    (err, row) => {
      if (err) {
        console.error("[DEM-STATUS] DB-Fehler:", err.message); // <-- wichtig
        // In Produktion lieber keine Details ausgeben
        return res.status(500).json({ error: err.message });
      }
      res.json({ completed: !!row });
    }
  );
});

  // POST /api/demographics  (speichert genau einmal)
  router.post("/", express.json(), async (req, res) => {
    try {
      const result = await save_dem(req.body);
      return res.status(201).json({ ok: true, id: result.insertedId });
    } catch (err) {
      const code = err.status || 500;
      return res.status(code).json({ error: err.message || "Unbekannter Fehler" });
    }
  });

  return router;
}

