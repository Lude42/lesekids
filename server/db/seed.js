// === file: server/db/seed.js ===============================================
// Seeds raw_responses from a JSON file exactly once (if table is empty)
import fs2 from "fs";
import path2 from "path";
export async function seedRawResponsesOnce(db, seedPath) {
  if (!fs2.existsSync(seedPath)) {
    console.log("Keine Seed-Datei gefunden (", seedPath, ")");
    return;
  }
  db.get("SELECT COUNT(*) AS count FROM raw_responses", (err, row) => {
    if (err) return console.error("Fehler beim Zählen der raw_responses:", err);
    if ((row?.count || 0) > 0) {
      console.log("raw_responses enthält bereits Daten – Seed wird übersprungen.");
      return;
    }
    const rows = JSON.parse(fs2.readFileSync(seedPath, "utf8"));
    console.log(`Starte Einfügen von ${rows.length} Zeilen in raw_responses...`);
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      const stmt = db.prepare(`
        INSERT INTO raw_responses (
          subject_id, trial_index, type, question_type, item, stimulus,
          response, normalized_answer, correct, rt_fast, rt, score,
          points_awarded, timestamp, llm_rationale
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of rows) {
        stmt.run([
          r.subject_id ?? null,
          r.trial_index ?? null,
          r.type ?? null,
          r.question_type ?? null,
          r.item ?? null,
          r.stimulus ?? null,
          r.response ?? null,
          r.normalized_answer ?? null,
          r.correct ? 1 : 0,
          r.rt_fast ? 1 : 0,
          r.rt ?? null,
          r.score ?? null,
          r.points_awarded ?? null,
          r.timestamp ?? new Date().toISOString(),
          r.llm_rationale ?? null,
        ]);
      }
      stmt.finalize();
      db.run("COMMIT", err2 => {
        if (err2) console.error("Seed-Commit-Fehler:", err2);
        else console.log("Seed-Daten erfolgreich eingefügt.");
      });
    });
  });
}