// server/score-open.js
import 'dotenv/config';  
import express from "express";
import OpenAI from "openai";
import crypto from "crypto";

export const router = express.Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEBUG_LLM = process.env.DEBUG_LLM === "1";

/* ---------- Prompt ---------- */
const SYSTEM_PROMPT = `
Du bewertest sehr knapp, objektiv und konsistent, ob eine Schülerantwort inhaltlich korrekt ist. Arbeite stets nach dieser Priorität:
1) Nutze die  "accept" -Liste als verbindliche Beispiele für korrekte Lösungen.
2) Nur wenn kein Eintrag aus  "accept"  passt, prüfe die semantische Übereinstimmung zwischen Schülerantwort ( ans ) und Frage/Text ( que ).
 
Normalisierung vor der Prüfung:
1) HTML entfernen und HTML-Entities dekodieren.
2) Kleinschreibung erzwingen.
3) Satzzeichen und überflüssige Leerzeichen entfernen.
4) Kleine Tippfehler tolerieren (Levenshtein ~1–2 bei kurzen Wörtern, proportional bei längeren).
5) Unwichtige Füllwörter ignorieren, wenn sie die Bedeutung nicht ändern.
6) "normalized_answer" ist die bereinigte Form von "ans" nach diesen Schritten.
 
Beurteilungsregeln für "is_correct" und "score":
1) Alles, was in der  accept -Liste steht (inkl. sinnvolle Paraphrasen/Synonyme), ist korrekt.
2) Rechtschreibung, Flexionen und Groß-/Kleinschreibung sind unerheblich.
3) Wenn kein  accept -Treffer: semantisch prüfen, ob die Antwort die Frage zu  que  korrekt beantwortet.
4) Wenn  lenient = true , bei Paraphrasen/Synonymen großzügiger sein; bei  lenient = false  höhere Übereinstimmung verlangen.
5) Bei Fragen nach  Rollen/Beziehungen  („Wer ist …?“) wird eine Rollen- oder Beziehungsbezeichnung erwartet (z. B. Lehrerin, Trainer, Nachbarin, Schwester), nicht ein Gegenstand oder eine Handlung.
6) Bei  Reihenfolge/Anzahl/Zeit  haben genaue Angaben Vorrang (z. B. „zuerst“, „zwischen“, „links/rechts“, konkrete Zahl).
7) Enthält die Antwort mehrere Inhalte, ist sie nur korrekt, wenn der relevante Teil eindeutig eine akzeptierte Lösung enthält  und  nichts Widersprüchliches nennt.
8) Bei  „Was passt nicht?“ -Fragen ist genau das unlogische/zeitlich falsche oder thematisch unpassende Element zu nennen; eine Liste ist ok, wenn das falsche Element eindeutig genannt ist und kein richtiges Element fälschlich als falsch markiert wird.
9) Bei  Rätseln („Was bin ich?“)  akzeptiere gängige, eindeutig passende Lösungen; wenn mehrere möglich sind, richte dich nach  accept  bzw. nach den stärksten Hinweisen im Text.
 
Evidenz-Regel (vor der "rationale" entscheiden, woher die Info kommt):
–  WORT-HINWEIS : Gesuchtes Wort steht explizit im Text.
–  HANDLUNGS-HINWEIS : Die Handlung zeigt die Lösung (z. B. „Kerzen auspusten“, „hilft beim Zählen“).
–  ORT-HINWEIS : Ort oder Lagebeziehungen (links/rechts/zwischen/Ende des Flurs).
–  EIGENSCHAFTS-HINWEIS : Merkmale/Erscheinung (z. B. „langer Hals“, „rötliches Fell“).
–  ZAHLEN-HINWEIS : Reihenfolge/Anzahl/„zuerst“.
–  ROLLEN-HINWEIS : Beziehung/Funktion/Job (Lehrer*in, Trainer*in, Nachbar*in, Schwester/Bruder, Oma/Opa).
–  ANLASS-HINWEIS : Anlass/Tag/Feiertag (z. B. Kuchen + Kerzen + Geschenk ⇒ besonderer Tag).
–  ZEIT-HINWEIS : Zeit/Epoche (z. B. „im Mittelalter“; anachronistische Technik ist falsch).
–  LOGIK-HINWEIS : Weltwissen/Realitätscheck (z. B. „blaue Banane“).
Behaupte nie, dass etwas  im Text steht , wenn es nur angedeutet ist; benenne es dann entsprechend als implizit (über passende Hinweis-Art).
 
Passform-Regel für Hinweise (sehr wichtig):
1) Der Hinweis muss zum  Fragewort  passen. 
  – Bei  „Wer …?“ : nur  ROLLEN-HINWEIS  verwenden (keine „wer“-Hinweise bei Tages-/Ortsfragen). 
  – Bei  „Welcher Tag/Anlass …?“ :  ANLASS-HINWEIS  (keine Personenhinweise). 
  – Bei  „Wo …?“ :  ORT-HINWEIS . 
  – Bei  „Was macht/hat/getan …?“ :  HANDLUNGS-  oder  WORT-HINWEIS . 
  – Bei  „Wie fühlt sich …?“ : stütze dich auf Gefühlsindikatoren (Mimik, Körperreaktionen, Verhalten) =  EIGENSCHAFTS-/HANDLUNGS-HINWEIS . 
  – Bei  „Was passt nicht …?“ :  ZEIT- ,  LOGIK-  oder  ORT-HINWEIS  auf das unpassende Element. 
  – Bei  Reihenfolge/Lage :  ZAHLEN-/ORT-HINWEIS .
2) Beziehe dich auf die relevanten Signale im Text (Handlungen, Objekte, Orte, Reihenfolgen, Zeitangaben).
3) Nutze möglichst das gesuchte Konzept im Hinweis (z. B. „Tag“, „Anlass“, „Ort“, „Reihenfolge“), ohne die Lösung zu verraten.
 
Formulieren von "rationale":
1) Sehr einfaches, kindgerechtes Deutsch.  Maximal ein Satz. 
2) Bei  falscher  Antwort: 
  – Gib  niemals  die Lösung preis. 
  – Gib einen Tipp, worauf das Kind achten soll, passend zur  Hinweis-Art  und zum  Fragewort . 
  – Beispiele: 
    • WORT-HINWEIS: „Achte auf das Wort, …“ 
    • HANDLUNGS-HINWEIS: „Überlege, was die Person  macht , …“ / „Achte darauf, was danach passiert.“ 
    • ORT-HINWEIS: „Achte darauf,  wo  es passiert.“ 
    • EIGENSCHAFTS-HINWEIS: „Achte auf das Merkmal …“ 
    • ZAHLEN-HINWEIS: „Schau, was  zuerst  oder  zwischen  liegt.“ 
    • ROLLEN-HINWEIS: „Überlege,  wie man die Person nennt , die …“ 
    • ANLASS-HINWEIS: „Überlege,  was für ein Tag  es sein könnte, wenn es Kuchen, Kerzen und ein Geschenk gibt.“ 
    • ZEIT-/LOGIK-HINWEIS: „Überlege,  was in dieser Zeit  passt.“ / „Achte darauf, was in der Wirklichkeit  nicht passt .“
3) Bei  richtiger  Antwort: kurz erklären,  warum  sie passt (ein Satz, kein Zusatzwissen).
 
Spezielle Aufgabenabdeckung (damit alle Fragearten oben sicher funktionieren):
–  Gefühle : Erkenne Gefühle aus Verhalten/Körpersignalen („lächelt“, „zittert“, „atmet tief aus“, „flattert unruhig“).
–  Berufe/Rollen : Erkenne Funktionen aus typischen Handlungen/Objekten (Tafel + Arbeitsblätter ⇒ Lehrkraft; Hütchen + Pfeife ⇒ Trainer*in/Coach; Kasse ⇒ Kassierer*in; Kiosk ⇒ Inhaber*in/Chefin; Nachbar*in bei „Tür an Tür“; Oma/Großmutter bei Kekse/Anlehnen etc.).
–  Orte/Lage : Links/rechts/zwischen/Ende des Flurs eindeutig bestimmen; „ganz rechts/links“ korrekt priorisieren.
–  Reihenfolge : „zuerst/danach“ streng beachten.
–  Anlass/Tag : Kuchen + Kerzen + Geschenk ⇒ besonderer Tag (ANLASS-HINWEIS,  niemals  „wer“-Formulierungen).
–  Unpassend/Anachronismus : Elemente wie „Handy“ bei Wikingern, „Benzin/Motor“ im Mittelalter, „Winterstiefel“ an heißem Sommertag, „blaue Banane“; logisch/zeitlich falsche Dinge als „nicht passend“ identifizieren.
–  Tier/Objekt-Erkennung : Nutze eindeutige Merkmale (z. B. „langer Hals“ ⇒ Giraffe; „rötliches Fell + Nüsse + Klettern“ ⇒ Eichhörnchen; „Biene fliegt zur Blüte“).
–  Rätsel : Aus den stärksten Hinweisen die naheliegendste Lösung ableiten (z. B. „wie du aussiehst“ ⇒ Spiegel; „brennt/verschwindet/Wolken/dunkel“ ⇒ Sonne).
–  Hilfe/Verhalten : „hilft beim Zählen“, „holt Pflaster“, „erklärt geduldig“ ⇒ hilfsbereit/unterstützend; „unachtsam/ignoriert“ ⇒ nicht hilfsbereit.
 
Output-Vorgaben:
Gib  ausschließlich  gültiges JSON genau in diesem Schema und  ohne  weitere Felder oder Fließtext aus:
{ 
"is_correct": boolean, 
 "score": 0 oder 1, 
"rationale": string (max. 1 Satz, kindgerecht, verrät nicht die Lösung), 
"normalized_answer": string, 
 "source": "llm"
}
 
Festlegung:
1) "is_correct" nach den Regeln oben.
2) "score" ist 1 bei "is_correct": true, sonst 0.
3) "source" ist immer "llm".
4) Gib keine Gedankengänge frei. Keine zusätzlichen Felder. Kein Fließtext.`;


/* ---------- JSON-Schema ---------- */
const score_schema = {
  name: "score_schema",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["is_correct", "score", "rationale", "normalized_answer", "source"],
    properties: {
      is_correct: { type: "boolean" },
      score: { type: "integer", enum: [0, 1] },
      rationale: { type: "string", minLength: 10, maxLength: 220 },
      normalized_answer: { type: "string", minLength: 1 },
      source: { type: "string", const: "llm" }
    }
  }
};

/* ---------- Utils ---------- */
function htmlToText(html = "") {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function normalize(s) {
  return (s ?? "").toString().trim().toLowerCase().normalize("NFKC").replace(/\s+/g, " ");
}
function now() { return new Date().toISOString(); }
function id() { return crypto.randomUUID(); }

/* ---------- Route ---------- */
router.post("/api/score-open", async (req, res) => {
  const reqId = id();
  const t0 = Date.now();

  // Eingangslog
  if (DEBUG_LLM) {
    console.log(`[${now()}] [${reqId}] <- /api/score-open body`, {
      has_question: !!req.body?.question,
      question_preview: String(req.body?.question || "").slice(0, 120),
      student_answer: req.body?.student_answer,
      policy: req.body?.policy
    });
  }

  try {
    const {
      question = "",
      student_answer = "",
      policy = { lenient: true }
    } = req.body || {};

    const qPlain = htmlToText(question);
    const payloadForLLM = {
      question: qPlain,
      student_answer,
      policy: { lenient: !!policy?.lenient }
    };

    if (DEBUG_LLM) {
      console.log(`[${now()}] [${reqId}] -> LLM payload`, payloadForLLM);
    }

    // LLM-Aufruf
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    let response;

    try {
response = await openai.chat.completions.create(
  {
    model: "gpt-4o",
    temperature: 0,
    response_format: { type: "json_schema", json_schema: score_schema }, // ohne strict
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payloadForLLM) }
    ],
    max_tokens: 250
  },
  { signal: ac.signal }            // ✅ Options-Objekt als 2. Parameter
);
    } finally {
      clearTimeout(timer);
    }

    const raw = response?.choices?.[0]?.message?.content || "{}";
    if (DEBUG_LLM) {
      console.log(`[${now()}] [${reqId}] <- LLM raw`, raw);
    }

    // Parsen + Normalisieren
    let out;
    try { out = JSON.parse(raw); } catch { out = {}; }

    let is_correct = !!out.is_correct;
    let score = Number.isFinite(out.score) ? out.score : (is_correct ? 1 : 0);
    let rationale = typeof out.rationale === "string" ? out.rationale.trim() : "";
    let normalized_answer =
      typeof out.normalized_answer === "string" ? out.normalized_answer : normalize(student_answer);

    // Guardrail falls rationale leer/zu kurz
    if (!rationale || rationale.split(/\s+/).length < 5) {
      rationale = is_correct
        ? "Die Antwort entspricht inhaltlich der geforderten Bedeutung."
        : "Die Antwort passt inhaltlich nicht zur Aufgabenstellung.";
      if (DEBUG_LLM) {
        console.warn(`[${now()}] [${reqId}] rationale too short/empty -> guardrail applied`);
      }
    }

    const respBody = {
      is_correct,
      score,
      rationale,
      normalized_answer,
      source: "llm"
    };

    if (DEBUG_LLM) {
      console.log(`[${now()}] [${reqId}] -> client`, respBody, `(${Date.now() - t0} ms)`);
    }
    return res.json(respBody);

  } catch (err) {
  // 🔎 Mehr Details loggen
  const status = err?.status || err?.response?.status;
  const code   = err?.code || err?.response?.data?.error?.code;
  const msg    = err?.message || String(err);
  let raw = "";

  try {
    if (err?.response) {
      raw = await err.response.text?.() || await err.response.json?.() || "";
    }
  } catch (_) {}

  console.error("[/api/score-open] LLM error:", { status, code, msg, raw });

  // 💡 In DEV: Fehler kurz an den Client spiegeln (hilft beim Debuggen)
  const devError = process.env.NODE_ENV !== "production" ? { status, code, msg, raw } : undefined;

  return res.status(200).json({
    is_correct: false,
    score: 0,
    rationale: "LLM nicht erreichbar – Bewertung nicht möglich.",
    normalized_answer: normalize(req.body?.student_answer || ""),
    source: "error-fallback",
    ...(devError ? { error: devError } : {})
  });
}
});
