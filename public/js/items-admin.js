// public/js/items-admin.js

// --- Utilities ---------------------------------------------------------------
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function msg(text, cls="muted") {
  const el = $("#msg");
  el.textContent = text;
  el.className = cls;
}
function valueOf(editorId) {
  return $(editorId).innerHTML.trim();
}
function setEditor(editorId, html) {
  $(editorId).innerHTML = html || "";
}

// Selection helpers for contenteditable
function getRange() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0);
}
function wrapSelection(before, after) {
  const r = getRange();
  if (!r || r.collapsed) return;
  const selText = r.toString();
  const frag = r.extractContents();
  const span = document.createElement('span');
  span.innerHTML = before + selText + after;
  r.insertNode(span);
}

// Apply actions
function applyEditorAction(act) {
  const active = document.activeElement;
  if (!active || !active.isContentEditable) {
    msg("Bitte zuerst in ein Editorfeld klicken.", "err");
    return;
  }
  if (act === "color-green") {
    document.execCommand("foreColor", false, "#99cc00");
  } else if (act === "color-orange") {
    document.execCommand("foreColor", false, "#ff9900");
  } else if (act === "tooltip") {
    const tip = prompt("Tooltip-Text:");
    if (!tip) return;
    const r = getRange();
    if (!r || r.collapsed) return;
    const selected = r.extractContents();
    const wrapper = document.createElement("span");
    wrapper.className = "tooltip";
    wrapper.tabIndex = 0;
    const inner = document.createElement("span");
    inner.className = "tooltiptext";
    inner.textContent = tip;
    wrapper.appendChild(selected);
    wrapper.appendChild(inner);
    r.insertNode(wrapper);
  } else if (act === "div2" || act === "div3") {
    const cls = act === "div2" ? "div-2" : "div-3";
    const r = getRange();
    if (!r) return;
    const frag = r.extractContents();
    const div = document.createElement("div");
    div.className = cls;
    div.appendChild(frag);
    r.insertNode(div);
  }
}

// --- UI wiring ---------------------------------------------------------------
$("#btnSearch").addEventListener("click", doSearch);
$("#filterType").addEventListener("change", doSearch);
$("#btnNew").addEventListener("click", clearForm);
$("#btnSave").addEventListener("click", saveItem);
$("#btnDelete").addEventListener("click", deleteItem);
$("#btnExport").addEventListener("click", async () => {
  const r = await fetch("/api/items/export");
  const data = await r.json();
  const blob = new Blob(
    [`window.items = ${JSON.stringify(data, null, 2)};`],
    { type: "application/javascript" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "items-export.js";
  a.click();
  URL.revokeObjectURL(url);
});
$$(".toolbar button").forEach(b => b.addEventListener("click", () => applyEditorAction(b.dataset.act)));
$("#btnAddOpt").addEventListener("click", () => addOptRow());
$("#btnDelOpt").addEventListener("click", () => removeOptRow());

// type toggle
$("#itemType").addEventListener("change", () => {
  const t = $("#itemType").value;
  $("#mcZone").style.display = (t === "mc") ? "" : "none";
  $("#openZone").style.display = (t === "open") ? "" : "none";
});

// init table
function addOptRow(optText="", fbText="") {
  const tb = $("#optTable tbody");
  const i = tb.children.length;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${i}</td>
    <td contenteditable="true" class="opt">${optText}</td>
    <td contenteditable="true" class="fb">${fbText}</td>
  `;
  tb.appendChild(tr);
}
function removeOptRow() {
  const tb = $("#optTable tbody");
  if (tb.children.length > 0) tb.removeChild(tb.lastElementChild);
}

// search
async function doSearch() {
  const q = $("#search").value.trim();
  const type = $("#filterType").value;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type) params.set("type", type);
  const r = await fetch(`/api/items?${params.toString()}`);
  const rows = await r.json();
  const box = $("#results"); box.innerHTML = "";
  rows.forEach(row => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.textContent = `${row.item} [${row.type}] – ${row.que_preview?.replace(/\s+/g,' ').slice(0,80) || ""}`;
    div.addEventListener("click", () => loadItem(row.item));
    box.appendChild(div);
  });
}

// load
async function loadItem(id) {
  const r = await fetch(`/api/items/${id}`);
  if (!r.ok) { msg("Item nicht gefunden", "err"); return; }
  const it = await r.json();
  $("#itemId").value = it.item;
  $("#itemType").value = it.type;
  $("#itemType").dispatchEvent(new Event("change"));

  setEditor("#ed-que", it.que);
  setEditor("#ed-que2a", it.que2a);
  setEditor("#ed-que2b", it.que2b);
  setEditor("#ed-explain", it.explain);

  // MC
  $("#corIdx").value = (Number.isInteger(it.cor) ? it.cor : "");
  $("#optTable tbody").innerHTML = "";
  (it.opt || []).forEach((o, i) => addOptRow(o, (it.fb || [])[i] || ""));

  // Open
  $("#taAccept").value = (it.accept || []).join("\n");
  $("#taReject").value = (it.reject || []).join("\n");

  msg(`Item ${id} geladen.`, "ok");
}

// clear
function clearForm() {
  $("#itemId").value = "";
  $("#itemType").value = "mc";
  $("#itemType").dispatchEvent(new Event("change"));
  ["#ed-que","#ed-que2a","#ed-que2b","#ed-explain"].forEach(id => setEditor(id,""));
  ["#threshold_1","#threshold_2","#first_threshold","#points_first_try","#points_later_try","#weight"].forEach(id => $(id).value = "");
  $("#corIdx").value = "";
  $("#optTable tbody").innerHTML = "";
  addOptRow(); addOptRow(); addOptRow(); addOptRow();
  $("#taAccept").value = "";
  $("#taReject").value = "";
  msg("Formular zurückgesetzt.");
}

// save
async function saveItem() {
  const payload = {
    item: Number($("#itemId").value),
    type: $("#itemType").value,
    que: valueOf("#ed-que"),
    que2a: valueOf("#ed-que2a"),
    que2b: valueOf("#ed-que2b"),
    explain: valueOf("#ed-explain"),
    threshold_1: numOrNull($("#threshold_1").value),
    threshold_2: numOrNull($("#threshold_2").value),
    first_threshold: intOrNull($("#first_threshold").value),
    points_first_try: intOrNull($("#points_first_try").value),
    points_later_try: intOrNull($("#points_later_try").value),
    weight: numOrNull($("#weight").value)
  };

  if (!payload.item || !payload.type || !payload.que) {
    msg("item, type, que sind Pflicht.", "err"); return;
  }

  if (payload.type === "mc") {
    payload.cor = intOrNull($("#corIdx").value);
    const rows = $$("#optTable tbody tr");
    payload.opt = rows.map(tr => tr.querySelector(".opt").innerText);
    payload.fb  = rows.map(tr => tr.querySelector(".fb").innerText);
  } else {
    payload.accept = $("#taAccept").value.split("\n").map(x => x.trim()).filter(Boolean);
    payload.reject = $("#taReject").value.split("\n").map(x => x.trim()).filter(Boolean);
  }

  const r = await fetch("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const err = await r.json().catch(()=>({}));
    msg(`Fehler: ${err.error || r.status}`, "err");
    return;
  }
  msg("Gespeichert ✅", "ok");
  doSearch();
}

async function deleteItem() {
  const id = Number($("#itemId").value);
  if (!id) return msg("Keine ID", "err");
  if (!confirm(`Item ${id} wirklich löschen?`)) return;
  const r = await fetch(`/api/items/${id}`, { method: "DELETE" });
  if (!r.ok) return msg("Fehler beim Löschen", "err");
  clearForm();
  msg(`Item ${id} gelöscht`, "ok");
  doSearch();
}

// helpers
function numOrNull(v){ const x=Number(v); return Number.isFinite(x)?x:null; }
function intOrNull(v){ const x=parseInt(v,10); return Number.isFinite(x)?x:null; }

// initial
clearForm();
doSearch();
