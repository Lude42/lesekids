function normalizeAnswer(s) {
  if (typeof s !== "string") return "";
  // Kleinbuchstaben, Trim, Mehrfachleerzeichen zu einem, Satzzeichen raus, Diakritika entfernen
  return s
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[.,;:!?„“"‚’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAccept(userInput, acceptList) {
  const norm = normalizeAnswer(userInput);
  return (acceptList || []).some(a => {
    if (a instanceof RegExp) return a.test(norm);
    return normalizeAnswer(String(a)) === norm;
  });
}

function normalizeDe(s) {
  if (!s) return "";
  // Unicode Normalisierung + Diakritika weg
  let t = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  t = t.toLowerCase();
  // Satzzeichen/sonstiges -> Leerzeichen
  t = t.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return t;
}

function stripGermanArticles(s) {
  // sehr simple Artikel-Remover am Wortanfang
  return s.replace(/^\s*(ein(e|en|er|em)?|der|die|das|den|dem|des)\s+/i, "").trim();
}

function matchesAcceptFlexible(studentAnswer, acceptList) {
  if (!Array.isArray(acceptList) || !acceptList.length) return false;
  const ansNorm = normalizeDe(stripGermanArticles(studentAnswer));
  if (!ansNorm) return false;

  // exakte Normalform oder Token-Containment
  return acceptList.some(acc => {
    const accNorm = normalizeDe(stripGermanArticles(acc));
    if (!accNorm) return false;
    if (ansNorm === accNorm) return true;
    // Token-Containment: z. B. "eine ziege" enthält "ziege"
    return ansNorm.split(" ").includes(accNorm) || accNorm.split(" ").includes(ansNorm);
  });
}


// Erwartet: matchesAccept(answer, acceptArray) ist global verfügbar.
// Endpoint: /api/score-open (JSON in/out)

async function scoreWithLLM({ questionHtml, studentAnswer, item }) {
  // --- Debug: Input-Preview (gekürzt, damit die Konsole übersichtlich bleibt)
  console.log("🔍 [scoreWithLLM] Payload preview:", {
    question: (questionHtml || "").slice(0, 140) + (questionHtml && questionHtml.length > 140 ? "…" : ""),
    student_answer: studentAnswer,
    accept: item?.accept || [],
    reject: item?.reject || []
  });

  // --- Timeout/Abort nach 6s
  const controller = new AbortController();
  const t = setTimeout(() => {
    console.warn("⏳ [scoreWithLLM] Timeout – Request wird abgebrochen.");
    controller.abort();
  }, 6000);

  try {
    const payload = {
      question: questionHtml,
      student_answer: studentAnswer,
      accept: item?.accept || [],
      reject: item?.reject || [],
      policy: { lenient: true, always_llm: true } // stelle auf false, wenn strenger bewertet werden soll
    };

    const resp = await fetch("/api/score-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(t);

    console.log("📡 [scoreWithLLM] HTTP-Status:", resp.status, resp.statusText);

    // Rohbody immer loggen – hilft bei HTML-Fehlerseiten, 204 etc.
    const raw = await resp.clone().text();
    console.log("📦 [scoreWithLLM] Raw body:", raw);

    let json = null;
    try {
      json = await resp.json();
    } catch (e) {
      console.error("🧯 [scoreWithLLM] JSON parse error:", e);
    }
    console.log("📥 [scoreWithLLM] Parsed JSON:", json);

    // Basale Validierung
    if (!resp.ok || !raw || !json || typeof json !== "object") {
      throw new Error("Invalid LLM response");
    }

    // Normalisieren (Safety: Felder & Typen)
    const norm = {
      is_correct: !!json.is_correct,
      score: Number.isFinite(json.score) ? json.score : (json.is_correct ? 1 : 0),
      rationale: typeof json.rationale === "string" ? json.rationale : "",
      normalized_answer: typeof json.normalized_answer === "string" ? json.normalized_answer : String(studentAnswer ?? ""),
      source: typeof json.source === "string" ? json.source : "server"
    };

    console.log("✅ [scoreWithLLM] Normalized:", norm);
    return norm;

  } catch (e) {
    clearTimeout(t);
    console.error("❌ [scoreWithLLM] Fehler/Abort:", e);

    // Fallback: simpler String-Match gegen accept-Liste
    const ok = matchesAccept(studentAnswer, item?.accept || []);
    const fallback = {
      is_correct: !!ok,
      score: ok ? 1 : 0,
      rationale: "Lokaler Fallback (String-Match).",
      normalized_answer: String(studentAnswer ?? ""),
      source: "local-fallback"
    };

    console.warn("↩️ [scoreWithLLM] Nutze Fallback:", fallback);
    return fallback;
  }
}



function estimateThetaRasch(data) {
  // Startwert
  let theta = 0;
  let maxIter = 20;
  let tol = 0.001;
  let stepSize = 1;

  for (let iter = 0; iter < maxIter; iter++) {
    let L = 0; // Likelihood-Ableitung
    let I = 0; // Information

    for (const d of data) {
      const b = d.threshold;
      const u = d.score; // 0 oder 1
      const expPart = Math.exp(theta - b);
      const P = expPart / (1 + expPart); // Rasch-Wahrscheinlichkeit
      const Q = 1 - P;

      L += u - P;
      I += P * Q;
    }

    const delta = stepSize * (L / I);
    theta += delta;

    if (Math.abs(delta) < tol) break;
  }

  const standardError = 1 / Math.sqrt(data.reduce((acc, d) => {
    const b = d.threshold;
    const expPart = Math.exp(theta - b);
    const P = expPart / (1 + expPart);
    const Q = 1 - P;
    return acc + P * Q;
  }, 0));

  return { theta: theta.toFixed(3), se: standardError.toFixed(3) };
}


