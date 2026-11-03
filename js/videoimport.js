// Importación de VIDEOS de señas: cada video se pasa por el mismo detector (MediaPipe) y las
// mismas características que usa la cámara, y se convierte en muestras de 30 fotogramas.
// Solo se conservan coordenadas de puntos; el video no se guarda ni se sube a ningún lado.
//
// Dos partes:
//   · ExtractorVideo      → usa el navegador (video + MediaPipe). Devuelve un vector por fotograma.
//   · construirMuestras() → lógica pura (sin navegador): recorta la seña, varía la velocidad,
//                           genera ventanas de 30 fotogramas y la versión en espejo.

import { MP_MODULE, MP_WASM, POSE_MODEL, HAND_MODEL, SEQ_LEN, SAMPLE_MS, REPOSO, FEATURE_DIM, LEFT_OFFSET } from './config.js';
import { extractFeatures, flattenSequence, espejarFrame } from './features.js';

const MAX_SEGUNDOS = 40;           // se ignora lo que pase de los 40 s de cada video (oraciones largas)

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
  const { label, signer, grupo, espejo = true, usarReposo = true, velocidades = [0.8, 1, 1.25], ventanasPorVelocidad = 4, repeticiones = false, hueco = 6 } = op;
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

  // ---- Seña repetida varias veces en el mismo video: cada repetición se corta y se usa aislada ----
  if (repeticiones) {
    const rep = segmentarRepeticiones(frames, manos, { hueco });
    if (rep.length) {
      avisos.push(`Se detectaron ${rep.length} repetición(es) de la seña en el video.`);
      const ventanasPor = rep.length > 3 ? 2 : Math.min(3, ventanasPorVelocidad);
      for (const [a, b] of rep) {
        const r = ventanasDeSegmento(frames.slice(a, b + 1), velocidades, ventanasPor);
        if (r.aviso) avisos.push(r.aviso);
        r.ventanas.forEach((w) => agregar(w, label));
      }
      if (usarReposo) agregarReposoGratis(frames, manos, (w) => agregar(w, REPOSO));
      if (!salida.length) avisos.push('No se pudo generar ninguna muestra.');
      return { muestras: salida, avisos };
    }
    avisos.push('No se pudieron separar repeticiones; se usa el tramo más largo con manos.');
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

// ---------------------------------------------------------------------------
// Parte 3 · varios tramos por video: repeticiones y oraciones (lógica pura)
// ---------------------------------------------------------------------------

/** Velocidad media de los puntos de las manos entre fotogramas consecutivos (unidades = ancho de hombros). */
export function movimientoManos(frames) {
  const v = new Array(frames.length).fill(0);
  for (let i = 1; i < frames.length; i++) {
    let suma = 0, n = 0;
    for (let p = LEFT_OFFSET; p < FEATURE_DIM; p += 3) {
      const a = frames[i - 1], b = frames[i];
      const ausA = a[p] === 0 && a[p + 1] === 0 && a[p + 2] === 0;
      const ausB = b[p] === 0 && b[p + 1] === 0 && b[p + 2] === 0;
      if (ausA || ausB) continue;
      suma += Math.abs(b[p] - a[p]) + Math.abs(b[p + 1] - a[p + 1]); n++;
    }
    v[i] = n ? suma / n : 0;
  }
  return v;
}

const suavizar = (v, k = 3) => v.map((_, i) => {
  let s = 0, n = 0;
  for (let j = Math.max(0, i - Math.floor(k / 2)); j <= Math.min(v.length - 1, i + Math.floor(k / 2)); j++) { s += v[j]; n++; }
  return s / n;
});

/**
 * Corta el video en tramos de movimiento de las manos (cada seña = un tramo).
 * Un tramo termina cuando las manos se detienen o desaparecen por más de `hueco` fotogramas (≈ 0,4 s con 6).
 * El umbral se ajusta solo a cada video: max(0,05; 20 % del movimiento típico de los fotogramas rápidos).
 * @returns {{tramos: Array<[number, number]>, umbral: number}}
 */
export function segmentarPorMovimiento(frames, manos, { hueco = 6, minLargo = 5, margen = 2, umbral } = {}) {
  const v = suavizar(movimientoManos(frames), 3);
  const conManos = v.filter((_, i) => manos[i]).sort((a, b) => a - b);
  if (conManos.length < minLargo) return { tramos: [], umbral: 0 };
  const p90 = conManos[Math.floor(0.9 * (conManos.length - 1))];
  const th = umbral ?? Math.max(0.05, 0.2 * p90);
  const activo = v.map((x, i) => !!manos[i] && x > th);

  const runs = [];
  let ini = -1, ult = -1;
  activo.forEach((a, i) => {
    if (!a) return;
    if (ini < 0) { ini = i; ult = i; }
    else if (i - ult - 1 <= hueco) ult = i;
    else { runs.push([ini, ult]); ini = i; ult = i; }
  });
  if (ini >= 0) runs.push([ini, ult]);

  const largos = runs.filter(([a, b]) => b - a + 1 >= minLargo);
  const tramos = largos.map(([a, b], k) => {
    const prev = k > 0 ? largos[k - 1][1] : -1, sig = k < largos.length - 1 ? largos[k + 1][0] : frames.length;
    const lim = (d) => Math.floor(d / 2);                      // los márgenes no invaden al vecino
    return [Math.max(a - margen, prev + 1 + (k > 0 ? lim(a - prev - 1) : 0)), Math.min(b + margen, sig - 1 - (k < largos.length - 1 ? lim(sig - b - 1) : 0))];
  });
  return { tramos, umbral: th };
}

/** Repeticiones de una misma seña: tramos de movimiento, descartando los demasiado cortos frente a la mediana. */
export function segmentarRepeticiones(frames, manos, op = {}) {
  const { tramos } = segmentarPorMovimiento(frames, manos, op);
  if (tramos.length < 2) return tramos;
  const largos = tramos.map(([a, b]) => b - a + 1).sort((x, y) => x - y);
  const mediana = largos[Math.floor((largos.length - 1) / 2)];
  return tramos.filter(([a, b]) => b - a + 1 >= 0.6 * mediana);
}

/** Ajusta velocidades para que el tramo entre en SEQ_LEN fotogramas y devuelve las ventanas del tramo aislado. */
function ventanasDeSegmento(seg, velocidades, ventanasPorVel) {
  let vels = velocidades, aviso = null;
  if (seg.length > SEQ_LEN - 2) {
    const minVel = seg.length / (SEQ_LEN - 2);
    aviso = `Una seña dura ${(seg.length * SAMPLE_MS / 1000).toFixed(1)} s (más de 2 s): se acelera para que entre en una ventana.`;
    vels = [...new Set(vels.map((x) => Math.max(x, minVel)).map((x) => Math.round(x * 100) / 100))];
  }
  const ventanas = [];
  for (const vel of vels) {
    const seq = remuestrear(seg, vel);
    repartir(seq.length - SEQ_LEN, 0, ventanasPorVel).forEach((s) => ventanas.push(ventana(seq, s)));
  }
  return { ventanas, aviso };
}

/** Tramos de 2 s sin ninguna mano: se guardan como «Reposo» (hasta 3 por video). */
function agregarReposoGratis(frames, manos, agregarVentana) {
  let racha = 0, ini = 0, cuantos = 0;
  for (let i = 0; i <= manos.length && cuantos < 3; i++) {
    if (i < manos.length && !manos[i]) { if (racha === 0) ini = i; racha++; }
    else {
      if (racha >= SEQ_LEN) { agregarVentana(frames.slice(ini, ini + SEQ_LEN)); cuantos++; }
      racha = 0;
    }
  }
}

/**
 * Video con una ORACIÓN: varias señas seguidas. Se corta por movimiento y cada tramo se etiqueta, EN ORDEN,
 * con la secuencia indicada. Si la cantidad de tramos no coincide con la de señas NO se guarda nada
 * (para no etiquetar mal): se informa cuántos tramos se vieron y en qué segundos.
 * Recomendación al grabar: baja las manos o haz una pausa de ~0,5 s entre seña y seña.
 * @param {string[]} secuencia ids de las señas en el orden en que aparecen en el video
 * @returns {{muestras: Array, avisos: string[], tramos: Array<[number, number]>}}
 */
export function construirMuestrasFrase(frames, manos, secuencia, op) {
  const { signer, grupo, espejo = true, usarReposo = true, velocidades = [0.8, 1, 1.25], ventanasPorVelocidad = 3, hueco = 6, umbral } = op;
  const avisos = [], salida = [];
  if (frames.length < 10) return { muestras: [], avisos: ['El video es demasiado corto.'], tramos: [] };
  const { tramos, umbral: th } = segmentarPorMovimiento(frames, manos, { hueco, umbral });
  const seg = (t) => `${((t[0] * SAMPLE_MS) / 1000).toFixed(1)}–${((t[1] * SAMPLE_MS) / 1000).toFixed(1)} s`;
  if (tramos.length !== secuencia.length) {
    avisos.push(`Se detectaron ${tramos.length} tramos con movimiento pero indicaste ${secuencia.length} señas (${secuencia.join(' → ')}). `
      + `No se guardó nada para no etiquetar mal.${tramos.length ? ` Tramos vistos: ${tramos.map(seg).join(' · ')}.` : ''} `
      + (tramos.length > secuencia.length ? 'Sube la «pausa mínima» o haz pausas más claras entre señas.' : 'Baja la «pausa mínima» o separa más las señas.'));
    return { muestras: [], avisos, tramos };
  }
  let ts = Date.now();
  const agregarVentana = (w, etiqueta) => {
    const base = { label: etiqueta, signer, grupo, fuente: 'video-frase' };
    salida.push({ ...base, ts: ts++, data: flattenSequence(w) });
    if (espejo) salida.push({ ...base, ts: ts++, data: flattenSequence(w.map(espejarFrame)) });
  };
  tramos.forEach((t, i) => {
    const r = ventanasDeSegmento(frames.slice(t[0], t[1] + 1), velocidades, ventanasPorVelocidad);
    if (r.aviso) avisos.push(`${secuencia[i]}: ${r.aviso}`);
    r.ventanas.forEach((w) => agregarVentana(w, secuencia[i]));
  });
  if (usarReposo) agregarReposoGratis(frames, manos, (w) => agregarVentana(w, REPOSO));
  avisos.push(`Tramos: ${tramos.map((t, i) => `${secuencia[i]} ${seg(t)}`).join(' · ')} (umbral de movimiento ${th.toFixed(3)}).`);
  return { muestras: salida, avisos, tramos };
}

/**
 * Convierte «hola, matrícula, cuándo» (o «hola matricula cuando») en ids del vocabulario.
 * Acepta ids o nombres, con o sin tildes; separadores: coma, punto y coma, +, >, | o salto de línea.
 * Sin esos separadores, une palabras sueltas cuando forman una seña («por favor» → por_favor).
 * @returns {{ids: string[], desconocidas: string[]}}
 */
export function senasDesdeTexto(texto, vocab) {
  const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const mapa = new Map();
  vocab.senas.forEach((s) => { mapa.set(s.id, s.id); mapa.set(norm(s.nombre), s.id); });
  const ids = [], desconocidas = [];
  if (/[,;+>|\n]/.test(texto)) {
    for (const parte of texto.split(/[,;+>|\n]+/)) {
      const k = norm(parte); if (!k) continue;
      if (mapa.has(k)) ids.push(mapa.get(k)); else desconocidas.push(parte.trim());
    }
  } else {
    const tokens = texto.trim().split(/\s+/).map(norm).filter(Boolean);
    for (let i = 0; i < tokens.length;) {
      let hallado = false;
      for (let len = Math.min(3, tokens.length - i); len >= 1; len--) {
        const k = tokens.slice(i, i + len).join('_');
        if (mapa.has(k)) { ids.push(mapa.get(k)); i += len; hallado = true; break; }
      }
      if (!hallado) { desconocidas.push(tokens[i]); i++; }
    }
  }
  return { ids, desconocidas };
}

/** Resumen de calidad de un video leído (para avisar antes de entrenar con datos pobres). */
export function resumenCalidad(frames, manos, conCuerpo) {
  const n = frames.length || 1;
  const manosPct = manos.filter(Boolean).length / n;
  const mov = movimientoManos(frames).filter((_, i) => manos[i]).sort((a, b) => a - b);
  const movP90 = mov.length ? mov[Math.floor(0.9 * (mov.length - 1))] : 0;
  const avisos = [];
  if (conCuerpo < 0.5) avisos.push(`solo en ${(conCuerpo * 100).toFixed(0)} % de los fotogramas se vieron los hombros; el resultado puede ser pobre.`);
  if (manosPct < 0.15) avisos.push(`las manos se ven solo en ${(manosPct * 100).toFixed(0)} % del video.`);
  else if (movP90 < 0.05) avisos.push('casi no hay movimiento de manos: si la seña es en movimiento, revisa el video.');
  return { manosPct, movP90, avisos };
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
