// public/js/manuale-scoring.js
const items = window.items || [];
// --- Deterministische Randomisierung pro Scorer -----------------------------

function stringHash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0);
}

// Mulberry32 PRNG
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates mit bereitgestelltem RNG
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}




// --- Helpers ---------------------------------------------------------------

function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

function escapeHtml(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function keyOf(itemId, ans) {
  return `${itemId}||${ans}`;
}

// --- Globals / UI refs -----------------------------------------------------

const scorer = getParam("scorer") || "";
const scorerLabel = document.getElementById("scorerLabel");
const saveAllBtn = document.getElementById("saveAllBtn");
const refreshBtn = document.getElementById("refreshBtn");
const tasksEl = document.getElementById("tasks");

if (scorerLabel) scorerLabel.textContent = scorer || "(fehlt)";
if (!scorer) alert("Bitte rufe die Seite als /manuale-scoring?scorer=DEINE_ID auf.");

const pending = new Map(); // key -> { item, normalized_answer, human_score, rowEl }

// --- API -------------------------------------------------------------------

async function fetchOpenForItem(itemId) {
  const r = await fetch(`/api/manuale/open?item=${encodeURIComponent(itemId)}&scorer=${encodeURIComponent(scorer)}`);
  if (!r.ok) throw new Error(`Fehler beim Laden (item ${itemId})`);
  return r.json();
}

async function saveScore({ item, normalized_answer, human_score }) {
  const r = await fetch("/api/manuale/score", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ scorer, item, normalized_answer, human_score })
});
  if (!r.ok) throw new Error("Fehler beim Speichern");
  return r.json();
}

// --- UI state --------------------------------------------------------------

function updateSaveAllBtn() {
  const n = pending.size;
  saveAllBtn.disabled = n === 0;
  saveAllBtn.textContent = `Speichern (${n})`;
}

function cleanupEmptyTasks() {
  document.querySelectorAll(".task").forEach((task) => {
    if (!task.querySelector(".answer")) task.remove();
  });
}

// --- Render ----------------------------------------------------------------

function renderTaskBlock(item, answers) {
  const wrap = document.createElement("div");
  wrap.className = "task";

  // Aufgabe (HTML aus item.que)
  const header = document.createElement("div");
  header.innerHTML = item.que || `<h3>Item ${item.item}</h3>`;
  wrap.appendChild(header);

  const list = document.createElement("div");
  answers.forEach((a) => {
    const row = document.createElement("div");
    row.className = "answer";

    const label = document.createElement("div");
    label.innerHTML = `<code>${escapeHtml(a.normalized_answer)}</code>`;

    const needBadge = document.createElement("span");
    needBadge.className = "badge " + (a.needs_third ? "third" : "need");
    needBadge.textContent = a.needs_third ? "3. Urteil" : "1./2. Urteil";

    // Radios
    const yes = document.createElement("input");
    yes.type = "radio";
    yes.name = `s_${item.item}_${a.normalized_answer}`;
    yes.value = "1";

    const no = document.createElement("input");
    no.type = "radio";
    no.name = `s_${item.item}_${a.normalized_answer}`;
    no.value = "0";

    // Bereits bewertet von mir? Normalerweise nicht, da needs_me gefiltert ist.
    if (a.my_score === 1) yes.checked = true;
    if (a.my_score === 0) no.checked = true;

    const radiosWrap = document.createElement("div");
    radiosWrap.className = "row";
    const yesLbl = document.createElement("label");
    yesLbl.appendChild(yes);
    yesLbl.appendChild(document.createTextNode(" richtig"));
    const noLbl = document.createElement("label");
    noLbl.appendChild(no);
    noLbl.appendChild(document.createTextNode(" falsch"));

    radiosWrap.appendChild(yesLbl);
    radiosWrap.appendChild(noLbl);
    radiosWrap.appendChild(needBadge);

    row.appendChild(label);
    row.appendChild(radiosWrap);
    list.appendChild(row);

    // Sobald eine Auswahl getroffen wird -> in pending aufnehmen
    function mark(val) {
      const entry = {
        item: item.item,
        normalized_answer: a.normalized_answer,
        human_score: val,
        rowEl: row
      };
      pending.set(keyOf(item.item, a.normalized_answer), entry);
      row.classList.add("pending");
      updateSaveAllBtn();
    }
    yes.addEventListener("change", () => mark(1));
    no.addEventListener("change", () => mark(0));
  });

  wrap.appendChild(list);
  return wrap;
}

async function renderAll() {
  tasksEl.innerHTML = "";

  const allItems = Array.isArray(window.items) ? window.items : [];
  if (!allItems.length) {
    tasksEl.innerHTML = "<p class='err'>items.js nicht gefunden/geladen.</p>";
    return;
  }

  // nur offene Items
  const openItems = allItems.filter((it) => it.type === "open" || (!Array.isArray(it.opt)));

  // ➜ deterministisch pro Scorer mischen
  const rng = mulberry32(stringHash(String(scorer || "anon")));
  shuffleInPlace(openItems, rng);

  let totalShown = 0;

  for (const it of openItems) {
    try {
      const answers = await fetchOpenForItem(it.item);

      // nur Fälle, die dieser Scorer bewerten soll
      const relevant = answers.filter((a) => a.needs_me);
      if (relevant.length === 0) continue;

      tasksEl.appendChild(renderTaskBlock(it, relevant));
      totalShown += relevant.length;
    } catch (e) {
      const err = document.createElement("div");
      err.className = "task";
      err.innerHTML = `<h3>Item ${it.item}</h3><p class="err">Konnte Antworten nicht laden.</p>`;
      tasksEl.appendChild(err);
    }
  }

  if (totalShown === 0) {
    tasksEl.innerHTML = "<p class='muted'>Aktuell gibt es keine Antworten, die du bewerten musst. 🎉</p>";
  }
}


// --- Events ----------------------------------------------------------------

refreshBtn.addEventListener("click", () => {
  pending.clear();
  updateSaveAllBtn();
  renderAll();
});

saveAllBtn.addEventListener("click", async () => {
  if (pending.size === 0) return;
  saveAllBtn.disabled = true;
  saveAllBtn.textContent = "Speichere …";

  const jobs = Array.from(pending.values());
  for (const j of jobs) {
    try {
      await saveScore({ item: j.item, normalized_answer: j.normalized_answer, human_score: j.human_score });
      // Zeile sofort entfernen
      j.rowEl.remove();
    } catch (e) {
      j.rowEl.classList.add("err");
    }
  }

  pending.clear();
  updateSaveAllBtn();
  cleanupEmptyTasks();
});

// --- Init ------------------------------------------------------------------

updateSaveAllBtn();
renderAll();
