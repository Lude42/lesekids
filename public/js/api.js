let finalSummary = null;
let finalTheta   = null;

async function saveAllData() {
  const res = await     fetch("/api/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(jsPsych.data.get().values())
    })
    .then(response => {
      if (!response.ok) throw new Error("Fehler beim Speichern");
      return response.text();
    })
    .then(msg => {
      console.log(" Erfolgreich gespeichert:", msg);
    })
    .catch(error => {
      console.error(" Fehler beim Speichern:", error);
    });
}

async function loadSubjectSummary(subject_id) {
  try {
    const res = await fetch(`/api/subject-summary?id=${encodeURIComponent(subject_id)}`);
    if (!res.ok) return null;        // 404 -> null
    return await res.json();         // row oder null
  } catch { return null; }
}

async function loadTheta(subject_id) {
  try {
    const res = await fetch(`/api/theta?id=${encodeURIComponent(subject_id)}`);
    if (!res.ok) return null;        // 404 -> null
    return await res.json();         // {theta,se} oder null
  } catch { return null; }
}

async function loadCompletedItems(subject_id) {
  try {
    const response = await fetch(`/api/completed-items?id=${encodeURIComponent(subject_id)}`);
    if (!response.ok) return [];
    return await response.json(); // liefert z. B. [1, 3, 5]
  } catch {
    return [];
  }
}

async function loadItemParams() {
  try {
    const res = await fetch("/api/item-params");
    if (!res.ok) return {};
    const rows = await res.json(); // [{item, threshold_1, ...}, ...]
    // Map: item -> params
    const map = {};
    for (const r of rows) map[r.item] = r;
    return map;
  } catch {
    return {};
  }
}