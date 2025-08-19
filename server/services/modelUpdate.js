// === file: server/services/modelUpdate.js ===================================
// Runs Rscript estimate.R when enough new clean responses are present
import { exec } from "child_process";
export function attachModelUpdateService(db) {
  return {
    checkForModelUpdate,
  };
  function checkForModelUpdate() {
    const sqlLast = `SELECT MAX(estDate) AS last_updated FROM item_parameters`;
    db.get(sqlLast, (err, row) => {
      if (err) return console.error("❌ Fehler beim Lesen von item_parameters:", err);
      const last = row?.last_updated;
      if (!last) {
        console.log("ℹ️ Noch kein Parametersatz vorhanden – Modell wird zum ersten Mal berechnet.");
        return runR();
      }
      const sqlNew = `SELECT COUNT(*) AS new_responses FROM clean_responses WHERE timestamp > ?`;
      db.get(sqlNew, [last], (err2, r2) => {
        if (err2) return console.error("❌ Fehler beim Zählen neuer Antworten:", err2);
        const n = r2?.new_responses || 0;
        if (n >= 100) {
          console.log(`📈 ${n} neue Antworten seit letzter Parameterschätzung – starte Modellschätzung...`);
          runR();
        } else {
          console.log(`🔍 Nur ${n} neue Antworten seit letzter Schätzung – kein Update nötig.`);
        }
      });
    });
  }
  function runR() {
    exec("Rscript estimate.R", (error, stdout, stderr) => {
      if (error) return console.error(`❌ Fehler beim Ausführen des R-Skripts: ${error.message}`);
      if (stderr) console.error(`⚠️ R stderr: ${stderr}`);
      console.log(`📊 R-Ausgabe:
${stdout}`);
    });
  }
}
