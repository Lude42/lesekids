// /js/api.js
(function () {
  const API_BASE = (typeof window.API_BASE === "string") ? window.API_BASE : "";

  async function getJson(path, opts) {
    const res = await fetch(API_BASE + path, opts);
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return res.json();
  }

  window.loadSubjectSummary = async (subject_id) =>
    getJson(`/api/subject-summary?id=${encodeURIComponent(subject_id)}`);

  window.loadTheta = async (subject_id) =>
    getJson(`/api/theta?id=${encodeURIComponent(subject_id)}`);

  window.loadCompletedItems = async (subject_id) =>
    getJson(`/api/completed-items?id=${encodeURIComponent(subject_id)}`);

  window.loadItemParamsForSelection = async () => {
    const data = await getJson(`/api/items/params`);
    if (!Array.isArray(data)) throw new Error('items/params ist kein Array');
    return data;
  };

  window.loadItemsByIds = async (ids) =>
    getJson(`/api/items/by-ids`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ ids: Array.isArray(ids) ? ids : [] })
    });

  // ★ Hierher verschoben + API_BASE genutzt
  window.saveAllData = async function saveAllData(subject_id) {
    const rows = jsPsych.data.get().values().map(row => ({
      subject_id: subject_id ?? row.subject_id ?? null,
      trial_index: row.trial_index ?? null,
      type: row.type ?? null,
      question_type: row.question_type ?? null,
      item: row.item ?? null,
      stimulus: typeof row.stimulus === 'string' ? row.stimulus : JSON.stringify(row.stimulus ?? null),
      response: (row.response !== undefined ? JSON.stringify(row.response) : null),
      normalized_answer: row.normalized_answer ?? null,
      correct: !!row.correct,
      rt_fast: !!row.rt_fast,
      rt: row.rt ?? null,
      score: row.score ?? null,
      points_awarded: row.points_awarded ?? null,
      llm_rationale: row.llm_rationale ?? null
    }));

    if (rows.length === 0) return "Keine Daten";

    const res = await fetch(API_BASE + '/api/save', {  // ★ API_BASE hier
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows)
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Speichern fehlgeschlagen: ${res.status} ${t}`);
    }
    return res.text();
  };
})();
