// Convierte los puntos de MediaPipe (cuerpo + manos) en un vector fijo de 201 números.
// Es la ÚNICA fuente de verdad de las características: grabación, entrenamiento
// y traducción usan exactamente esta función.
//
// Normalización: el origen es el centro de los hombros y la unidad es el ancho de
// hombros. Así la seña no depende de qué tan lejos o a qué lado se pare la persona.

import { POSE_POINTS, FEATURE_DIM, LEFT_OFFSET, RIGHT_OFFSET } from './config.js';

/**
 * @param {Array|undefined} pose  landmarks del cuerpo (33 puntos) de una persona
 * @param {Array|undefined} hands lista de manos; cada mano son 21 puntos
 * @param {number} aspect         ancho/alto del video (corrige la distorsión de x)
 * @returns {{features: Float32Array, info: {pose:boolean,left:boolean,right:boolean}}}
 */
export function extractFeatures(pose, hands, aspect = 16 / 9) {
  const out = new Float32Array(FEATURE_DIM);
  const info = { pose: false, left: false, right: false };
  if (!pose || pose.length < POSE_POINTS) return { features: out, info };

  const ls = pose[11], rs = pose[12];
  const scale = Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y);
  if (!(scale > 1e-3)) return { features: out, info };

  const ox = (ls.x + rs.x) / 2, oy = (ls.y + rs.y) / 2;
  const put = (pts, offset) => {
    let k = offset;
    for (const p of pts) {
      out[k++] = ((p.x - ox) * aspect) / scale;
      out[k++] = (p.y - oy) / scale;
      out[k++] = p.z / scale;
    }
  };

  put(pose.slice(0, POSE_POINTS), 0);
  info.pose = true;

  // Asignar manos a izquierda/derecha por cercanía a las muñecas del cuerpo
  // (más fiable que la etiqueta de lateralidad, que depende del espejo).
  const list = (hands || []).filter((h) => h && h.length === 21);
  const wl = pose[15], wr = pose[16];
  const dist = (h, w) => Math.hypot((h[0].x - w.x) * aspect, h[0].y - w.y);
  let left = null, right = null;
  if (list.length === 1) {
    if (dist(list[0], wl) <= dist(list[0], wr)) left = list[0]; else right = list[0];
  } else if (list.length >= 2) {
    const [a, b] = list;
    if (dist(a, wl) + dist(b, wr) <= dist(a, wr) + dist(b, wl)) { left = a; right = b; }
    else { left = b; right = a; }
  }
  if (left) { put(left, LEFT_OFFSET); info.left = true; }
  if (right) { put(right, RIGHT_OFFSET); info.right = true; }
  return { features: out, info };
}

/** Une una lista de vectores (uno por fotograma) en un solo Float32Array plano. */
export function flattenSequence(frames) {
  const out = new Float32Array(frames.length * FEATURE_DIM);
  frames.forEach((f, i) => out.set(f, i * FEATURE_DIM));
  return out;
}

// ---------- espejo (personas zurdas) ----------
// Pares izquierda/derecha de los 25 puntos del cuerpo de MediaPipe.
const PARES_POSE = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24]];
const PERM_POSE = Array.from({ length: POSE_POINTS }, (_, i) => i);
for (const [a, b] of PARES_POSE) { PERM_POSE[a] = b; PERM_POSE[b] = a; }

/** Refleja un fotograma como si la seña la hiciera una persona zurda (x → −x, izquierda ↔ derecha). */
export function espejarFrame(f) {
  const out = new Float32Array(FEATURE_DIM);
  const punto = (dst, src) => {
    const x = f[src], y = f[src + 1], z = f[src + 2];
    if (x === 0 && y === 0 && z === 0) return;           // punto ausente: se deja en cero
    out[dst] = -x; out[dst + 1] = y; out[dst + 2] = z;
  };
  for (let i = 0; i < POSE_POINTS; i++) punto(PERM_POSE[i] * 3, i * 3);
  for (let p = 0; p < 21; p++) {
    punto(LEFT_OFFSET + p * 3, RIGHT_OFFSET + p * 3);
    punto(RIGHT_OFFSET + p * 3, LEFT_OFFSET + p * 3);
  }
  return out;
}
