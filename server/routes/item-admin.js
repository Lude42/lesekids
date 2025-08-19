// === file: server/routes/item-admin.js ======================================
import express2 from "express";

/**
 * Admin-API für Items (sqlite3 Callback-Stil)
 * Endpunkte:
 *  GET  /api/item-admin/items?ids=14,101   -> mehrere/alle Items
 *  GET  /api/item-admin/items/:id          -> Einzelnes Item
 *  GET  /api/item-admin/search?q=...       -> einfache Suche (que/Name)
 *  POST /api/item-admin/items              -> Upsert (geschützt per Bearer)
 */
export default function itemAdminRouter(db) {
  const router = express2.Router();

  // --- Tabelle sicherstellen (einmalig) ------------------------------------
  db.run(`
    CREATE TABLE IF NOT EXISTS items_content_admin (
      item               INTEGER PRIMARY KEY,
      type               TEXT CHECK(type IN ('mc','open')) DEFAULT 'mc',
      que                TEXT,
      que2a              TEXT,
      tbar               TEXT,            -- TTS für que2a (Plain Text)
      que2b              TEXT,
      tts_text_que2b     TEXT,            -- TTS für que2b (Plain Text)
      opt1               TEXT,
      opt2               TEXT,
      opt3               TEXT,
      opt4               TEXT,
      fb1                TEXT,
      fb2                TEXT,
      fb3                TEXT,
      fb4                TEXT,
      explain            TEXT,
      cor                INTEGER,         -- 1..4 (bei open ggf. NULL)
      accept             TEXT,            -- CSV oder JSON, hier als TEXT
      reject             TEXT,
      Task1              TEXT,
      Task2              TEXT,
      Task3              TEXT,
      Context            TEXT,
      Gender             TEXT,
      Name               TEXT,
      updated_at         TEXT DEFAULT (datetime('now'))
    )
  `);

  // --- Admin-Auth (Bearer aus .env: ADMIN_TOKEN=...) ------------------------
  function requireAdmin(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.replace(/^Bearer\s+/i, "");
    if (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
      return next();
    }
    return res.status(401).json({ error: "unauthorized" });
  }

  // --- GET /api/item-admin/items?ids=14,101 ---------------------------------
  router.get("/api/item-admin/items", (req, res) => {
    const ids = (req.query.ids || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter(n => Number.isInteger(n));

    if (ids.length === 0) {
      // alle Items
      db.all(`SELECT * FROM items_content_admin ORDER BY item`, (err, rows) => {
        if (err) return res.status(500).json({ error: "db_error" });
        return res.json(rows || []);
      });
    } else {
      const placeholders = ids.map(() => "?").join(",");
      const sql = `SELECT * FROM items_content_admin WHERE item IN (${placeholders}) ORDER BY item`;
      db.all(sql, ids, (err, rows) => {
        if (err) return res.status(500).json({ error: "db_error" });
        return res.json(rows || []);
      });
    }
  });

  // --- GET /api/item-admin/items/:id ----------------------------------------
  router.get("/api/item-admin/items/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "bad_id" });
    db.get(`SELECT * FROM items_content_admin WHERE item = ? LIMIT 1`, [id], (err, row) => {
      if (err) return res.status(500).json({ error: "db_error" });
      return res.json(row || null);
    });
  });

  // --- GET /api/item-admin/search?q=...  (optional) -------------------------
  router.get("/api/item-admin/search", (req, res) => {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);
    const like = `%${q}%`;
    const sql = `
      SELECT item, Name, type, substr(que,1,200) AS teaser, updated_at
      FROM items_content_admin
      WHERE (que LIKE ? OR Name LIKE ?)
      ORDER BY updated_at DESC
      LIMIT 50
    `;
    db.all(sql, [like, like], (err, rows) => {
      if (err) return res.status(500).json({ error: "db_error" });
      return res.json(rows || []);
    });
  });

  // --- POST /api/item-admin/items  (Upsert) ---------------------------------
  router.post("/api/item-admin/items", requireAdmin, (req, res) => {
    const b = req.body || {};

    // Minimalvalidierung
    const item = Number(b.item);
    if (!Number.isInteger(item)) {
      return res.status(400).json({ error: "item (integer) missing" });
    }
    if (b.type && !["mc", "open"].includes(b.type)) {
      return res.status(400).json({ error: "type must be 'mc' or 'open'" });
    }
    if (b.type === "mc" && b.cor != null) {
      const corInt = Number(b.cor);
      if (!(Number.isInteger(corInt) && corInt >= 1 && corInt <= 4)) {
        return res.status(400).json({ error: "cor for mc must be 1..4" });
      }
    }

    // Payload vorbereiten (NULL für fehlende Felder)
    const payload = {
      $item: item,
      $type: b.type ?? "mc",
      $que: b.que ?? null,
      $que2a: b.que2a ?? null,
      $tbar: b.tbar ?? b.tts_text_que2a ?? null,           // akzeptiere beide Keys
      $que2b: b.que2b ?? null,
      $tts_text_que2b: b.tts_text_que2b ?? null,

      $opt1: b.opt1 ?? null,
      $opt2: b.opt2 ?? null,
      $opt3: b.opt3 ?? null,
      $opt4: b.opt4 ?? null,

      $fb1: b.fb1 ?? null,
      $fb2: b.fb2 ?? null,
      $fb3: b.fb3 ?? null,
      $fb4: b.fb4 ?? null,

      $explain: b.explain ?? null,
      $cor: b.cor ?? null,
      $accept: b.accept ?? null,
      $reject: b.reject ?? null,

      $Task1: b.Task1 ?? null,
      $Task2: b.Task2 ?? null,
      $Task3: b.Task3 ?? null,
      $Context: b.Context ?? null,

      $Gender: b.Gender ?? null,
      $Name: b.Name ?? null
    };

    // UPSERT (ON CONFLICT REQUIRES SQLite >= 3.24)
    const sql = `
      INSERT INTO items_content_admin (
        item, type, que, que2a, tbar, que2b, tts_text_que2b,
        opt1, opt2, opt3, opt4,
        fb1, fb2, fb3, fb4,
        explain, cor, accept, reject,
        Task1, Task2, Task3, Context, Gender, Name,
        updated_at
      ) VALUES (
        $item, $type, $que, $que2a, $tbar, $que2b, $tts_text_que2b,
        $opt1, $opt2, $opt3, $opt4,
        $fb1, $fb2, $fb3, $fb4,
        $explain, $cor, $accept, $reject,
        $Task1, $Task2, $Task3, $Context, $Gender, $Name,
        datetime('now')
      )
      ON CONFLICT(item) DO UPDATE SET
        type=excluded.type,
        que=excluded.que,
        que2a=excluded.que2a,
        tbar=excluded.tbar,
        que2b=excluded.que2b,
        tts_text_que2b=excluded.tts_text_que2b,
        opt1=excluded.opt1,
        opt2=excluded.opt2,
        opt3=excluded.opt3,
        opt4=excluded.opt4,
        fb1=excluded.fb1,
        fb2=excluded.fb2,
        fb3=excluded.fb3,
        fb4=excluded.fb4,
        explain=excluded.explain,
        cor=excluded.cor,
        accept=excluded.accept,
        reject=excluded.reject,
        Task1=excluded.Task1,
        Task2=excluded.Task2,
        Task3=excluded.Task3,
        Context=excluded.Context,
        Gender=excluded.Gender,
        Name=excluded.Name,
        updated_at=datetime('now')
    `;

    db.run(sql, payload, function (err) {
      if (err) {
        console.error("POST /api/item-admin/items error:", err);
        return res.status(500).json({ error: "db_error" });
      }
      return res.json({ ok: true, item });
    });
  });

  return router;
}
