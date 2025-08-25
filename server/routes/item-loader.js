// server/routes/item-loader.js  (sqlite3-kompatibel)
import express from "express";

export default function itemsRouter(db) {
  const router = express.Router();

  // Debug-Ping (kannst du später löschen)
  router.get("/_ping", (req, res) => res.json({ ok: true, from: "itemsRouter" }));

  // GET /api/items/params
  // Liefert NUR die Auswahl-Parameter. LEFT JOIN sorgt dafür,
  // dass jedes item aus item_contents mindestens Defaults bekommt.
// GET /api/items/params
router.get("/params", (req, res) => {
  const sql = `
    SELECT
      CAST(c.item AS TEXT)                           AS item,
      CAST(COALESCE(p.threshold_1, -1)       AS REAL) AS threshold_1,
      CAST(COALESCE(p.threshold_2, 0)        AS REAL) AS threshold_2,
      CAST(COALESCE(p.first_threshold, 2000) AS REAL) AS first_threshold,
      CAST(COALESCE(p.points_first_try, 60)  AS REAL) AS points_first_try,
      CAST(COALESCE(p.points_later_try, 40)  AS REAL) AS points_later_try,
      CAST(COALESCE(p.weight, 1)             AS REAL) AS weight
    FROM item_contents c
    LEFT JOIN item_parameters p ON p.item = c.item
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("GET /api/items/params error:", err);
      return res.status(500).json({ error: "DB error" });
    }
    res.set("Cache-Control", "no-store");
    res.json(rows || []);
  });
});


  // POST /api/items/by-ids  (gibt die Inhalte + Params für ausgewählte IDs zurück)
router.post("/by-ids", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : [];
  if (ids.length === 0) return res.json([]);

  const placeholders = ids.map(() => "?").join(",");
  const sql = `
    SELECT 
      CAST(c.item AS TEXT)                           AS item,
      c.type,
      c.que, c.que2a, c.que2b, c.tts_text_que2a, c.tbar,
      c.opt1, c.opt2, c.opt3, c.opt4,
      c.fb1,  c.fb2,  c.fb3,  c.fb4,
      c.explain, c.cor, c.accept, c.reject,
      CAST(COALESCE(p.threshold_1, -1)       AS REAL) AS threshold_1,
      CAST(COALESCE(p.threshold_2, 0)        AS REAL) AS threshold_2,
      CAST(COALESCE(p.first_threshold, 2000) AS REAL) AS first_threshold,
      CAST(COALESCE(p.points_first_try, 60)  AS REAL) AS points_first_try,
      CAST(COALESCE(p.points_later_try, 40)  AS REAL) AS points_later_try,
      CAST(COALESCE(p.weight, 1)             AS REAL) AS weight
    FROM item_contents c
    LEFT JOIN item_parameters p ON p.item = c.item
    WHERE c.item IN (${placeholders})
  `;
  db.all(sql, ids, (err, rows) => {
    if (err) {
      console.error("POST /api/items/by-ids error:", err);
      return res.status(500).json({ error: "DB error" });
    }
    const out = (rows || []).map(r => ({
      ...r,
      opt: [r.opt1, r.opt2, r.opt3, r.opt4].filter(v => v != null),
      fb:  [r.fb1,  r.fb2,  r.fb3,  r.fb4 ].filter(v => v != null),
      accept: safeParse(r.accept),
      reject: safeParse(r.reject),
    }));
    res.set("Cache-Control", "no-store");
    res.json(out);
  });
});


function safeParse(s) { try { return s ? JSON.parse(s) : []; } catch { return []; } }
  return router;   // <== GANZ WICHTIG
} // <-- fehlte bei dir