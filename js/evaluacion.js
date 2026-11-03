// Métricas de evaluación (lógica pura): matriz de confusión, señas que se confunden y F1 por clase.

/** matriz[real][predicho] = cantidad de muestras. */
export function matrizConfusion(reales, predichos, K) {
  const m = Array.from({ length: K }, () => new Array(K).fill(0));
  reales.forEach((r, i) => { if (r >= 0 && r < K && predichos[i] >= 0 && predichos[i] < K) m[r][predichos[i]]++; });
  return m;
}

/** Los pares (real → predicho) con más errores, de mayor a menor. */
export function paresConfundidos(matriz, labels, top = 5) {
  const pares = [];
  matriz.forEach((fila, r) => fila.forEach((n, p) => { if (r !== p && n > 0) pares.push({ real: labels[r], predicho: labels[p], n }); }));
  return pares.sort((a, b) => b.n - a.n).slice(0, top);
}

/** Precisión, exhaustividad y F1 de cada clase a partir de la matriz. */
export function metricasPorClase(matriz, labels) {
  return labels.map((label, k) => {
    const vp = matriz[k][k];
    const fn = matriz[k].reduce((a, b) => a + b, 0) - vp;
    const fp = matriz.reduce((a, fila) => a + fila[k], 0) - vp;
    const precision = vp + fp ? vp / (vp + fp) : null;
    const recall = vp + fn ? vp / (vp + fn) : null;
    const f1 = precision != null && recall != null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
    return { label, precision, recall, f1, n: vp + fn };
  });
}
