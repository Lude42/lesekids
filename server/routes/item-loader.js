// server/routes/item-loader.js  (sqlite3-kompatibel)
import express from "express";

export default function itemsRouter(db) {
  const router = express.Router();

  // Debug-Ping (kannst du später löschen)
  router.get("/_ping", (req, res) => res.json({ ok: true, from: "itemsRouter" }));

  // GET /api/items/params
  // Liefert NUR die Auswahl-Parameter. LEFT JOIN sorgt dafür,
  // dass jedes item aus item_contents mindestens Defaults bekommt.
  router.get("/params", (req, res) => {
    const sql = `
      SELECT
        c.item,
        COALESCE(p.threshold_1, -1)       AS threshold_1,
        COALESCE(p.threshold_2, 0)        AS threshold_2,
        COALESCE(p.first_threshold, 2000) AS first_threshold,
        COALESCE(p.points_first_try, 60)  AS points_first_try,
        COALESCE(p.points_later_try, 40)  AS points_later_try,
        COALESCE(p.weight, 1)             AS weight
      FROM item_contents c
      LEFT JOIN item_parameters p ON p.item = c.item
    `;
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error("GET /api/items/params error:", err);
        return res.status(500).json({ error: "DB error" });
      }
      res.set("Cache-Control", "no-store");
      res.json(rows || []); // <- garantiert Array
    });
  });

  // POST /api/items/by-ids  (gibt die Inhalte + Params für ausgewählte IDs zurück)
  router.post("/by-ids", (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length === 0) return res.json([]);

    const placeholders = ids.map(() => "?").join(",");
    const sql = `
      SELECT 
        c.item, c.type,
        c.que, c.que2a, c.que2b, c.tts_text_que2a, c.tbar,
        c.opt1, c.opt2, c.opt3, c.opt4,
        c.fb1,  c.fb2,  c.fb3,  c.fb4,
        c.explain, c.cor, c.accept, c.reject,
        COALESCE(p.threshold_1, -1)       AS threshold_1,
        COALESCE(p.threshold_2, 0)        AS threshold_2,
        COALESCE(p.first_threshold, 2000) AS first_threshold,
        COALESCE(p.points_first_try, 60)  AS points_first_try,
        COALESCE(p.points_later_try, 40)  AS points_later_try,
        COALESCE(p.weight, 1)             AS weight
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

  return router;
}

function safeParse(s) { try { return s ? JSON.parse(s) : []; } catch { return []; } }
