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
Du bewertest sehr knapp, objektiv und konsistent, ob eine Schülerantwort inhaltlich korrekt ist.
Arbeite stets nach dieser Priorität: 1. Die "accept"-Liste als verbindliche Beispiele für korrekte Antworten verwenden. Nur wenn keine Einträge in "accept" passen, prüfe die semantische Übereinstimmung zwischen Text und Frage ("que").
 
Beurteilungsregeln für "is_correct" und "score":
1. Alles, was in der "accept"-Liste steht, gilt als korrekte Antwortmöglichkeit. Wenn die Schülerantwort eine sinnvolle Paraphrase eines accept-Eintrags ist, markiere sie als korrekt.
2. Rechtschreibung, Flexionen, Groß- und Kleinschreibung sowie kleine Tippfehler sind unerheblich.
3. Wenn die Antwort nicht zu einer möglichen Antwort in der accept-Liste gehört, prüfe semantisch, ob sie die Frage zum Text aus "que" korrekt beantwortet.
4. Wenn "lenient" true ist, sei bei Paraphrasen großzügiger. Wenn "lenient" false ist, verlangt eine strengere Übereinstimmung mit accept.

Formulieren von "rationale":
1. Formuliere "rationale" in sehr einfachem und kindgerechtem Deutsch (max. 1 Satz).
Bei einer falschen Antwort:
2.0 Sage nicht, was die richtige Antwort ist!
2.1 Gib einen Tipp dazu, warum die Antwort falsch war.
2.2 Nehme explizit Bezug auf Begriffe, Personen, Orte und Situationen aus den Texten. 
Bei einer richtigen Antwort:
3.0 Erkläre, warum die Antwort richtig war.
 
Sprachstil für alle ausgegebenen Texte: Verwende keine Fremdwörter oder Fachbegriffe. Kurze Sätze.

Output-Vorgaben:
Gib ausschließlich gültiges JSON zurück genau in diesem Schema und ohne weitere Felder oder Fließtext:
{
  "is_correct": boolean,
  "score": 0 oder 1,
  "rationale": string (max. 1 Satz, kindgerecht, verrät nicht die Lösung),
  "normalized_answer": string,
  "source": "llm"
}

Gib keine Gedankengänge frei, keine zusätzlichen Felder, keinen Fließtext.
`;

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
    model: "gpt-4o-mini",
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
