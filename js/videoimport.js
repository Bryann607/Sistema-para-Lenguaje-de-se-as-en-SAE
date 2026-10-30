// Importación de VIDEOS de señas: cada video se pasa por el mismo detector (MediaPipe) y las
// mismas características que usa la cámara, y se convierte en muestras de 30 fotogramas.
// Solo se conservan coordenadas de puntos; el video no se guarda ni se sube a ningún lado.
//
// Dos partes:
//   · ExtractorVideo      → usa el navegador (video + MediaPipe). Devuelve un vector por fotograma.
//   · construirMuestras() → lógica pura (sin navegador): recorta la seña, varía la velocidad,
//                           genera ventanas de 30 fotogramas y la versión en espejo.

import { MP_MODULE, MP_WASM, POSE_MODEL, HAND_MODEL, SEQ_LEN, SAMPLE_MS, REPOSO } from './config.js';
import { extractFeatures, flattenSequence, espejarFrame } from './features.js';

const MAX_SEGUNDOS = 20;           // se ignora lo que pase de los 20 s de cada video

// ---------------------------------------------------------------------------
// Parte 1 · extracción de puntos desde un archivo de video
// ---------------------------------------------------------------------------

function esperar(v, evento, ms = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { v.removeEventListener(evento, ok); reject(new Error('El video tardó demasiado en responder.')); }, ms);
    const ok = () => { clearTimeout(t); v.removeEventListener(evento, ok); resolve(); };
    v.addEventListener(evento, ok);
  });
}

async function irA(v, seg) {
  const destino = Math.min(seg, Math.max(0, v.duration - 0.001));
  if (Math.abs(v.currentTime - destino) < 1e-3) return;
  const espera = esperar(v, 'seeked');
  v.currentTime = destino;
  await espera;
}

export class ExtractorVideo {
  /** Carga los detectores en modo imagen (cada fotograma se analiza de forma independiente). */
  async init() {
    if (this.pose) return;
    const mp = await import(MP_MODULE);
    const fileset = await mp.FilesetResolver.forVisionTasks(MP_WASM);
    const crear = async (delegate) => ({
      pose: await mp.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: POSE_MODEL, delegate }, runningMode: 'IMAGE', numPoses: 1 }),
      hand: await mp.HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'IMAGE', numHands: 2 }),
    });
    try { Object.assign(this, await crear('GPU')); }
    catch (e) { console.warn('GPU no disponible, usando CPU', e); Object.assign(this, await crear('CPU')); }
  }

  /**
   * Lee un video a ~15 fotogramas por segundo (SAMPLE_MS), igual que la cámara.
   * @returns {Promise<{frames: Float32Array[], manos: boolean[], conCuerpo: number}>}
   */
  async leer(file, onProgreso) {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    try {
      const listo = esperar(v, 'loadeddata', 15000);
      v.src = url;
      v.addEventListener('error', () => { /* se informa abajo por timeout */ });
      await listo;
      if (!Number.isFinite(v.duration) || !v.videoWidth) throw new Error('No se pudo leer el video (formato no compatible). Prueba con MP4 (H.264) o WebM.');
      const aspect = v.videoWidth / v.videoHeight;
      const n = Math.floor((Math.min(v.duration, MAX_SEGUNDOS) * 1000) / SAMPLE_MS);
      const frames = [], manos = [];
      let conCuerpo = 0;
      for (let i = 0; i < n; i++) {
        await irA(v, (i * SAMPLE_MS) / 1000);
        const pr = this.pose.detect(v);
        const hr = this.hand.detect(v);
        const { features, info } = extractFeatures(pr.landmarks?.[0], hr.landmarks, aspect);
        frames.push(features); manos.push(info.left || info.right);
        if (info.pose) conCuerpo++;
        if (i % 5 === 0) { onProgreso?.(i / n); await new Promise((r) => setTimeout(r)); } // deja respirar a la página
      }
      return { frames, manos, conCuerpo: n ? conCuerpo / n : 0 };
    } finally {
      URL.revokeObjectURL(url);
      v.removeAttribute('src'); v.load();
    }
  }
}

// ---------------------------------------------------------------------------
// Parte 2 · de fotogramas a muestras (lógica pura, probada con Node)
// ---------------------------------------------------------------------------

/** Tramo más largo con manos visibles; une huecos de hasta `hueco` fotogramas. */
export function mejorTramo(manos, hueco = 4) {
  const tramos = [];
  let ini = -1, ult = -1;
  manos.forEach((m, i) => {
    if (!m) return;
    if (ini < 0) { ini = i; ult = i; }
    else if (i - ult - 1 <= hueco) ult = i;
    else { tramos.push([ini, ult]); ini = i; ult = i; }
  });
  if (ini >= 0) tramos.push([ini, ult]);
  tramos.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
  return tramos[0] || null;
}

/** Cambia la velocidad (vel > 1 = más rápido) tomando el fotograma más cercano. */
function remuestrear(arr, vel) {
  if (vel === 1) return arr.slice();
  const n = Math.max(2, Math.floor((arr.length - 1) / vel) + 1);
  return Array.from({ length: n }, (_, k) => arr[Math.min(arr.length - 1, Math.round(k * vel))]);
}

/** Ventana de SEQ_LEN fotogramas que empieza en `ini`; fuera del video repite el primer/último fotograma. */
function ventana(seq, ini) {
  const out = [];
  for (let k = 0; k < SEQ_LEN; k++) out.push(seq[Math.min(seq.length - 1, Math.max(0, ini + k))]);
  return out;
}

function repartir(lo, hi, max) {
  lo = Math.ceil(lo); hi = Math.floor(hi);
  if (hi < lo) return [];
  const n = Math.min(max, hi - lo + 1);
  if (n === 1) return [Math.round((lo + hi) / 2)];
  return [...new Set(Array.from({ length: n }, (_, i) => Math.round(lo + ((hi - lo) * i) / (n - 1))))];
}

/**
 * @param {Float32Array[]} frames  un vector por fotograma (a SAMPLE_MS)
 * @param {boolean[]} manos        true si había alguna mano en ese fotograma
 * @param {{label:string, signer:string, grupo:string, espejo?:boolean, usarReposo?:boolean,
 *          velocidades?:number[], ventanasPorVelocidad?:number}} op
 * @returns {{muestras: Array, avisos: string[]}}
 */
export function construirMuestras(frames, manos, op) {
  const { label, signer, grupo, espejo = true, usarReposo = true, velocidades = [0.8, 1, 1.25], ventanasPorVelocidad = 4 } = op;
  const avisos = [];
  const salida = [];
  let ts = Date.now();
  const agregar = (ventanaFrames, etiqueta) => {
    const base = { label: etiqueta, signer, grupo, fuente: 'video' };
    salida.push({ ...base, ts: ts++, data: flattenSequence(ventanaFrames) });
    if (espejo) salida.push({ ...base, ts: ts++, data: flattenSequence(ventanaFrames.map(espejarFrame)) });
  };

  if (frames.length < 10) return { muestras: [], avisos: ['El video es demasiado corto (menos de 1 segundo).'] };

  // ---- Reposo: ventanas deslizantes sobre todo el video ----
  if (label === REPOSO) {
    const starts = repartir(0, Math.max(0, frames.length - SEQ_LEN), 40);
    starts.forEach((s) => agregar(ventana(frames, s), REPOSO));
    if (!salida.length) avisos.push('No se pudo generar ninguna ventana.');
    return { muestras: salida, avisos };
  }

  // ---- Seña ----
  const tramo = mejorTramo(manos);
  if (!tramo || tramo[1] - tramo[0] + 1 < 5) {
    return { muestras: [], avisos: ['No se detectaron manos en el video (¿se ven las manos y los hombros?).'] };
  }
  const [a, b] = tramo;
  const largo = b - a + 1;
  let vels = velocidades;
  if (largo > SEQ_LEN - 2) {
    const minVel = largo / (SEQ_LEN - 2);
    avisos.push(`La seña dura ${(largo * SAMPLE_MS / 1000).toFixed(1)} s (más de 2 s): se acelera para que entre en una ventana.`);
    vels = [...new Set(vels.map((v) => Math.max(v, minVel)).map((v) => Math.round(v * 100) / 100))];
  }
  for (const vel of vels) {
    const seq = remuestrear(frames, vel);
    const a2 = Math.floor(a / vel), b2 = Math.min(seq.length - 1, Math.ceil(b / vel));
    // Ventanas que contienen la seña completa, en distintas posiciones dentro de los 2 s.
    const starts = repartir(b2 - (SEQ_LEN - 1), a2, ventanasPorVelocidad);
    starts.forEach((s) => agregar(ventana(seq, s), label));
  }

  // ---- Reposo "gratis": tramos de 2 s sin ninguna mano en el mismo video ----
  if (usarReposo) {
    let racha = 0, ini = 0, cuantos = 0;
    for (let i = 0; i <= manos.length && cuantos < 3; i++) {
      if (i < manos.length && !manos[i]) { if (racha === 0) ini = i; racha++; }
      else {
        if (racha >= SEQ_LEN) { agregar(frames.slice(ini, ini + SEQ_LEN), REPOSO); cuantos++; }
        racha = 0;
      }
    }
  }
  if (!salida.length) avisos.push('No se pudo generar ninguna muestra.');
  return { muestras: salida, avisos };
}

/** Deduce la seña a partir del nombre del archivo: «matricula_01.mp4» → matricula. */
export function senaDesdeNombre(nombreArchivo, vocab) {
  const limpio = nombreArchivo.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const ids = [REPOSO.replace(/_/g, ''), 'reposo', ...vocab.senas.map((s) => s.id)];
  const ordenados = [...new Set(ids)].sort((x, y) => y.length - x.length);
  const hallado = ordenados.find((id) => limpio === id || limpio.startsWith(`${id}_`));
  if (!hallado) return null;
  return hallado === 'reposo' || hallado === REPOSO.replace(/_/g, '') ? REPOSO : hallado;
}
