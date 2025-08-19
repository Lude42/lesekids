function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


function renderFuelGridHTML(steps /* 0..90 */){
  const v = Math.max(0, Math.min(90, Number(steps)||0));
  const cells = Array.from({length:9}, (_, i) => {
    const start = i*10, end = (i+1)*10;
    let perc = 0;
    if (v >= end) perc = 100;
    else if (v > start) perc = ((v - start) / 10) * 100;
    return `<div class="pill"><div class="pill-fill" style="width:${perc}%;"></div></div>`;
  }).join('');
  return `<div class="fuel-grid-wrap"><div class="fuel-grid">${cells}</div></div>`;
}
