// Aumento de datos: genera variantes REALISTAS de una muestra de 30×201 para que el modelo
// aprenda de más situaciones con menos grabaciones. Lógica pura (sin navegador ni TensorFlow).
//
// Reglas que se respetan siempre:
//   · Un punto ausente (x = y = z = 0, mano no detectada) se queda en cero: nunca se inventan manos.
//   · Solo se aumenta el conjunto de ENTRENAMIENTO (nunca la validación; ver model.js).
//   · La salida tiene siempre el mismo tamaño que la entrada (SEQ_LEN × FEATURE_DIM).

import { SEQ_LEN, FEATURE_DIM, LEFT_OFFSET, RIGHT_OFFSET, HAND_POINTS } from './config.js';
import { espejarFrame } from './features.js';

export const SAMPLE_SIZE = SEQ_LEN * FEATURE_DIM;

export const OPCIONES_POR_DEFECTO = {
  velocidad: [0.8, 1.25],   // rango de cambio de velocidad (más lento … más rápido)
  rotacion: 0.14,           // ± radianes (≈ 8°): cámara ladeada
  escala: [0.9, 1.1],       // distancia a la cámara
  deformacion: 0.05,        // ± estiramiento independiente en x e y (cuerpo más ancho/alto)
  traslacion: 0.08,         // ± desplazamiento (error del punto de referencia de los hombros)
  sesgo: 0.010,             // σ del error constante de cada punto (el detector «se equivoca» igual todo el tiempo)
  ruido: 0.006,             // σ del ruido independiente por fotograma
  desfase: 2,               // ± fotogramas de corrimiento extra
  pEspejo: 0.25,            // probabilidad de reflejar la seña (persona zurda)
  pPerdidaMano: 0.15,       // probabilidad de simular que el detector pierde una mano unos fotogramas
};

export function gauss(rng = Math.random) {
  return Math.sqrt(-2 * Math.log(rng() || 1e-9)) * Math.cos(2 * Math.PI * rng());
}

const ausente = (a, i) => a[i] === 0 && a[i + 1] === 0 && a[i + 2] === 0;
const entre = (rng, [lo, hi]) => lo + (hi - lo) * rng();

/**
 * Cambia la velocidad de la seña manteniendo SEQ_LEN fotogramas.
 * vel > 1 = más rápida (la seña ocupa menos tiempo; los extremos repiten el primer/último fotograma);
 * vel < 1 = más lenta (se ve solo la parte central). Interpola solo entre puntos presentes en ambos fotogramas.
 */
export function cambiarVelocidad(src, vel = 1, desfase = 0) {
  const out = new Float32Array(SAMPLE_SIZE);
  const centro = (SEQ_LEN - 1) / 2;
  for (let t = 0; t < SEQ_LEN; t++) {
    const pos = Math.min(SEQ_LEN - 1, Math.max(0, centro + (t - centro) * vel + desfase));
    const i0 = Math.floor(pos), i1 = Math.min(SEQ_LEN - 1, i0 + 1), w = pos - i0;
    for (let p = 0; p < FEATURE_DIM; p += 3) {
      const a = i0 * FEATURE_DIM + p, b = i1 * FEATURE_DIM + p, o = t * FEATURE_DIM + p;
      const pa = !ausente(src, a), pb = !ausente(src, b);
      if (pa && pb) for (let k = 0; k < 3; k++) out[o + k] = src[a + k] * (1 - w) + src[b + k] * w;
      else if (w < 0.5 && pa) for (let k = 0; k < 3; k++) out[o + k] = src[a + k];
      else if (w >= 0.5 && pb) for (let k = 0; k < 3; k++) out[o + k] = src[b + k];
    }
  }
  return out;
}

/** Refleja toda la secuencia (izquierda ↔ derecha), como si la hiciera una persona zurda. */
export function espejarSecuencia(src) {
  const out = new Float32Array(SAMPLE_SIZE);
  for (let t = 0; t < SEQ_LEN; t++) {
    out.set(espejarFrame(src.subarray(t * FEATURE_DIM, (t + 1) * FEATURE_DIM)), t * FEATURE_DIM);
  }
  return out;
}

/**
 * Variante aleatoria de una muestra.
 * @param {Float32Array} src  secuencia plana de SEQ_LEN × FEATURE_DIM
 * @param {object} op         ver OPCIONES_POR_DEFECTO
 * @param {() => number} rng  generador en [0,1); se puede fijar para pruebas reproducibles
 */
export function augment(src, op = {}, rng = Math.random) {
  const o = { ...OPCIONES_POR_DEFECTO, ...op };
  let x = src;
  if (rng() < o.pEspejo) x = espejarSecuencia(x);
  x = cambiarVelocidad(x, entre(rng, o.velocidad), Math.round((rng() * 2 - 1) * o.desfase));

  // Transformación geométrica común a todo el cuerpo (cámara ladeada, distancia, proporciones)
  const ang = (rng() * 2 - 1) * o.rotacion, cos = Math.cos(ang), sin = Math.sin(ang);
  const s = entre(rng, o.escala);
  const sx = s * (1 + (rng() * 2 - 1) * o.deformacion), sy = s * (1 + (rng() * 2 - 1) * o.deformacion);
  const dx = (rng() * 2 - 1) * o.traslacion, dy = (rng() * 2 - 1) * o.traslacion;

  // Error constante por punto (sesgo): el detector falla igual en todos los fotogramas
  const sesgo = new Float32Array(FEATURE_DIM);
  for (let i = 0; i < FEATURE_DIM; i++) sesgo[i] = gauss(rng) * o.sesgo;

  const out = new Float32Array(SAMPLE_SIZE);
  for (let t = 0; t < SEQ_LEN; t++) {
    for (let p = 0; p < FEATURE_DIM; p += 3) {
      const i = t * FEATURE_DIM + p;
      if (ausente(x, i)) continue;
      const px = x[i] * cos - x[i + 1] * sin, py = x[i] * sin + x[i + 1] * cos;
      out[i] = px * sx + dx + sesgo[p] + gauss(rng) * o.ruido;
      out[i + 1] = py * sy + dy + sesgo[p + 1] + gauss(rng) * o.ruido;
      out[i + 2] = x[i + 2] * s + sesgo[p + 2] + gauss(rng) * o.ruido;
    }
  }

  // Pérdida breve de una mano (2–4 fotogramas seguidos), como cuando el detector la pierde
  if (rng() < o.pPerdidaMano) {
    const off = rng() < 0.5 ? LEFT_OFFSET : RIGHT_OFFSET;
    const largo = 2 + Math.floor(rng() * 3), ini = Math.floor(rng() * (SEQ_LEN - largo));
    for (let t = ini; t < ini + largo; t++) out.fill(0, t * FEATURE_DIM + off, t * FEATURE_DIM + off + HAND_POINTS * 3);
  }
  return out;
}

/**
 * Cuántas muestras sintéticas generar por clase para EQUILIBRAR el entrenamiento.
 * Cada clase se sube hasta  mediana × factor  (las clases que ya la superan no reciben copias),
 * con un tope de `maxPorMuestra` copias por cada muestra real para no repetir lo mismo demasiadas veces.
 * factor ≤ 1 → no se genera nada.
 * @param {Record<string, number>} conteos  muestras REALES de entrenamiento por clase
 * @returns {Record<string, number>}        muestras sintéticas a generar por clase
 */
export function planDeAumento(conteos, factor, { maxPorMuestra = 8 } = {}) {
  const extras = {};
  const valores = Object.values(conteos).filter((n) => n > 0).sort((a, b) => a - b);
  const mediana = valores.length ? valores[Math.floor((valores.length - 1) / 2)] : 0;
  for (const [clase, n] of Object.entries(conteos)) {
    if (factor <= 1 || n <= 0) { extras[clase] = 0; continue; }
    const objetivo = Math.min(n * maxPorMuestra, Math.max(n, Math.round(mediana * factor)));
    extras[clase] = Math.max(0, objetivo - n);
  }
  return extras;
}
