// === file: server/utils/rasch.js ===========================================
// Minimal Newton-Raphson θ estimator for Rasch 1PL (binary) with edge cases
export function estimateThetaRasch(rows) {
  const allCorrect = rows.every(d => Number(d.score) === 1);
  const allWrong   = rows.every(d => Number(d.score) === 0);
  if (allCorrect) return { theta: 3.0,  se: 1 };
  if (allWrong)   return { theta: -3.0, se: 1 };
  let theta = 0, maxIter = 30, tol = 1e-3;
  for (let i = 0; i < maxIter; i++) {
    let L = 0, I = 0;
    for (const d of rows) {
      const b = Number(d.threshold), u = Number(d.score);
      const ex = Math.exp(theta - b), P = ex / (1 + ex), Q = 1 - P;
      L += (u - P); I += (P * Q);
    }
    if (I <= 1e-9) break;
    const step = L / I; theta += step; if (Math.abs(step) < tol) break;
  }
  const info = rows.reduce((acc, d) => {
    const ex = Math.exp(theta - Number(d.threshold));
    const P = ex / (1 + ex); const Q = 1 - P; return acc + P * Q;
  }, 0);
  const se = info > 0 ? 1 / Math.sqrt(info) : null;
  return { theta: Number(theta.toFixed(3)), se: se !== null ? Number(se.toFixed(3)) : null };
}

