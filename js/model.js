// Modelo de reconocimiento (TensorFlow.js): construcción, entrenamiento en el navegador,
// guardado, carga y predicción. `tf` es global (se carga desde index.html).

import { SEQ_LEN, FEATURE_DIM, REPOSO, MODEL_URL, LABELS_URL, MODEL_IDB, MODELO_NUBE_BASE } from './config.js';
import { augment, planDeAumento } from './aumento.js';
import { matrizConfusion, paresConfundidos } from './evaluacion.js';

export { augment };   // compatibilidad: antes vivía en este archivo

const SAMPLE_SIZE = SEQ_LEN * FEATURE_DIM;
const LS_LABELS = 'lsp-upsjb-etiquetas';

export function buildModel(nClasses, arch = 'conv') {
  const m = tf.sequential();
  if (arch === 'gru') {
    m.add(tf.layers.gru({ units: 64, returnSequences: true, inputShape: [SEQ_LEN, FEATURE_DIM] }));
    m.add(tf.layers.dropout({ rate: 0.3 }));
    m.add(tf.layers.gru({ units: 96 }));
    m.add(tf.layers.dense({ units: 64, activation: 'relu' }));
  } else {
    m.add(tf.layers.conv1d({ inputShape: [SEQ_LEN, FEATURE_DIM], filters: 64, kernelSize: 3, padding: 'same', activation: 'relu' }));
    m.add(tf.layers.maxPooling1d({ poolSize: 2 }));
    m.add(tf.layers.conv1d({ filters: 128, kernelSize: 3, padding: 'same', activation: 'relu' }));
    m.add(tf.layers.maxPooling1d({ poolSize: 2 }));
    m.add(tf.layers.dropout({ rate: 0.3 }));
    m.add(tf.layers.flatten());
    m.add(tf.layers.dense({ units: 128, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }) }));
  }
  m.add(tf.layers.dropout({ rate: 0.4 }));
  m.add(tf.layers.dense({ units: nClasses, activation: 'softmax' }));
  m.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return m;
}

// ---------- entrenamiento ----------
/**
 * @param {Array<{label:string,data:Float32Array}>} samples
 * @param {{arch:string,epochs:number,augment:number,minPerClass:number,suavizado?:number,paciencia?:number,onLog:Function,onEpoch:Function}} opt
 *   augment: ≤1 sin aumento; >1 equilibra las clases hasta (mediana × augment) con variantes realistas (ver aumento.js).
 *   suavizado: suavizado de etiquetas (0–0.2); evita que el modelo se vuelva «demasiado seguro» con pocos datos.
 *   paciencia: épocas sin mejorar la validación antes de detener (0 = nunca detener antes).
 */
export async function trainModel(samples, opt) {
  const { arch = 'conv', epochs = 40, augment: aug = 2, minPerClass = 6, suavizado = 0.05, paciencia = 12, onLog = () => {}, onEpoch = () => {} } = opt;
  const valid = samples.filter((s) => s.data?.length === SAMPLE_SIZE);
  const byLabel = new Map();
  for (const s of valid) { if (!byLabel.has(s.label)) byLabel.set(s.label, []); byLabel.get(s.label).push(s); }
  const labels = [...byLabel.keys()].filter((l) => byLabel.get(l).length >= minPerClass)
    .sort((a, b) => (a === REPOSO ? -1 : b === REPOSO ? 1 : a.localeCompare(b)));
  const skipped = [...byLabel.keys()].filter((l) => !labels.includes(l));
  if (skipped.length) onLog(`Se omiten por tener menos de ${minPerClass} muestras: ${skipped.join(', ')}`);
  if (labels.length < 2) throw new Error('Se necesitan al menos 2 clases con muestras suficientes (incluye "reposo").');
  if (!labels.includes(REPOSO)) onLog('Aviso: no hay muestras de "reposo". El modelo detectará señas aun sin que se haga ninguna.');

  // División estratificada ~15 % validación. Las muestras que comparten «grupo» (ventanas del mismo
  // video) van siempre juntas a un lado, para que la validación no se infle con casi-duplicados.
  const train = [], val = [], sinVal = [], pocasFuentes = [];
  for (const l of labels) {
    const grupos = new Map();
    byLabel.get(l).forEach((s, i) => { const g = s.grupo || `#${i}`; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(s); });
    const lista = [...grupos.values()].sort(() => Math.random() - 0.5);
    if (lista.length < 3) pocasFuentes.push(`${l} (${lista.length})`);
    if (lista.length < 2) { train.push(...lista[0]); sinVal.push(l); continue; }
    const objetivo = Math.max(1, Math.round(byLabel.get(l).length * 0.15));
    let nv = 0;
    lista.forEach((g, i) => {
      if (nv < objetivo && lista.length - i > 1) { val.push(...g); nv += g.length; } else train.push(...g);
    });
  }
  if (pocasFuentes.length) onLog(`Aviso: menos de 3 fuentes independientes (señantes/videos) en: ${pocasFuentes.join(', ')}. El modelo puede memorizar a esa persona.`);
  if (sinVal.length) onLog(`Sin validación independiente (una sola fuente): ${sinVal.join(', ')}.`);
  if (!val.length) {
    onLog('Aviso: no hay fuentes suficientes para separar validación; se usa una parte al azar (el acierto saldrá inflado).');
    const mezcla = train.slice().sort(() => Math.random() - 0.5);
    const nv = Math.max(1, Math.round(mezcla.length * 0.15));
    val.push(...mezcla.slice(0, nv));
    const fuera = new Set(mezcla.slice(0, nv));
    train.splice(0, train.length, ...train.filter((x) => !fuera.has(x)));
  }
  const trainAug = [...train];
  const porClase = {};
  train.forEach((s) => { (porClase[s.label] ||= []).push(s); });
  const plan = planDeAumento(Object.fromEntries(Object.entries(porClase).map(([l, a]) => [l, a.length])), aug);
  let sinteticas = 0;
  for (const [l, extra] of Object.entries(plan)) {
    const base = porClase[l];
    for (let k = 0; k < extra; k++) { trainAug.push({ label: l, data: augment(base[k % base.length].data) }); sinteticas++; }
  }
  const pocas = Object.entries(porClase).filter(([, a]) => a.length < 10).map(([l, a]) => `${l} (${a.length})`);
  if (pocas.length) onLog(`Aviso: menos de 10 muestras reales de entrenamiento en: ${pocas.join(', ')}. Las variantes sintéticas ayudan, pero no reemplazan grabar más.`);
  if (sinteticas) onLog(`Aumento: +${sinteticas} variantes sintéticas (equilibrando las clases).`);
  trainAug.sort(() => Math.random() - 0.5);
  onLog(`Clases: ${labels.length} · entrenamiento: ${trainAug.length} (${train.length} reales) · validación: ${val.length}`);

  const toTensors = (arr, eps = 0) => {
    const flat = new Float32Array(arr.length * SAMPLE_SIZE);
    arr.forEach((s, i) => flat.set(s.data, i * SAMPLE_SIZE));
    const xs = tf.tensor3d(flat, [arr.length, SEQ_LEN, FEATURE_DIM]);
    const idx = arr.map((s) => labels.indexOf(s.label));
    const ys = tf.tidy(() => {
      const oh = tf.cast(tf.oneHot(tf.tensor1d(idx, 'int32'), labels.length), 'float32');
      return eps > 0 ? oh.mul(1 - eps).add(eps / labels.length) : oh;   // suavizado de etiquetas
    });
    return { xs, ys };
  };
  const tr = toTensors(trainAug, suavizado), va = toTensors(val);
  const model = buildModel(labels.length, arch);
  const handle = { stop: () => { model.stopTraining = true; } };
  opt.onHandle?.(handle);

  // Se conservan los pesos de la época con MEJOR pérdida en validación (no los de la última época).
  let mejor = null, mejorVal = Infinity, mejorEp = 0, sinMejora = 0;
  try {
    await model.fit(tr.xs, tr.ys, {
      epochs, batchSize: 32, shuffle: true, validationData: [va.xs, va.ys],
      callbacks: {
        onEpochEnd: async (ep, logs) => {
          const vl = logs.val_loss;
          if (Number.isFinite(vl) && vl < mejorVal - 1e-4) {
            mejorVal = vl; mejorEp = ep + 1; sinMejora = 0;
            mejor?.forEach((w) => w.dispose());
            mejor = model.getWeights().map((w) => w.clone());
          } else if (paciencia > 0 && ++sinMejora >= paciencia) {
            model.stopTraining = true;
            onLog(`Sin mejora en validación durante ${paciencia} épocas: se detiene el entrenamiento.`);
          }
          onEpoch(ep + 1, epochs, {
            loss: logs.loss, acc: logs.acc ?? logs.accuracy,
            valLoss: logs.val_loss, valAcc: logs.val_acc ?? logs.val_accuracy,
          });
          await tf.nextFrame();
        },
      },
    });
    if (mejor) {
      model.setWeights(mejor);
      onLog(`Se conserva el modelo de la época ${mejorEp} (mejor pérdida en validación: ${mejorVal.toFixed(3)}).`);
    }

    // Precisión por seña, matriz de confusión y señas que se confunden (validación)
    const pred = tf.tidy(() => model.predict(va.xs).argMax(-1));
    const predArr = Array.from(await pred.data()); pred.dispose();
    const reales = val.map((s) => labels.indexOf(s.label));
    const matriz = matrizConfusion(reales, predArr, labels.length);
    const pares = paresConfundidos(matriz, labels, 5);
    const perClass = labels.map((l, i) => {
      let n = 0, ok = 0;
      val.forEach((s, j) => { if (s.label === l) { n++; if (predArr[j] === i) ok++; } });
      return { label: l, n, acc: n ? ok / n : null };
    });
    model.setUserDefinedMetadata({ labels, seqLen: SEQ_LEN, featureDim: FEATURE_DIM, arch, muestras: valid.length, mejorEpoca: mejorEp, fecha: new Date().toISOString() });
    await model.save(MODEL_IDB);
    localStorage.setItem(LS_LABELS, JSON.stringify(labels));
    return { model, labels, perClass, matriz, pares, mejorEpoca: mejorEp };
  } finally {
    tr.xs.dispose(); tr.ys.dispose(); va.xs.dispose(); va.ys.dispose();
    mejor?.forEach((w) => w.dispose());
  }
}

/** Descarga los 3 archivos que deben copiarse a /model del repositorio. */
export async function downloadModelFiles(model, labels, saveBlob) {
  await model.save('downloads://modelo-lsp');
  saveBlob(new Blob([JSON.stringify(labels, null, 2)], { type: 'application/json' }), 'etiquetas.json');
}

// ---------- carga ----------
async function loadLabels(model, fallbackUrl) {
  const meta = model.getUserDefinedMetadata?.();
  if (meta?.labels?.length) return meta.labels;
  try { const r = await fetch(fallbackUrl); if (r.ok) return await r.json(); } catch { /* sin etiquetas */ }
  try { return JSON.parse(localStorage.getItem(LS_LABELS) || 'null'); } catch { return null; }
}

/**
 * Carga el modelo. En el sitio publicado usa el del repositorio (/model).
 * En localhost (tu laptop) prueba primero el entrenado en este navegador, para que
 * puedas verificar tus entrenamientos antes de subir los archivos al repositorio.
 */
export async function loadBestModel() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const desdeRepo = async () => {
    const model = await tf.loadLayersModel(MODEL_URL);
    const labels = await loadLabels(model, LABELS_URL);
    return labels ? { model, labels, origen: 'repositorio' } : null;
  };
  const desdeNavegador = async () => {
    const model = await tf.loadLayersModel(MODEL_IDB);
    const labels = await loadLabels(model, LABELS_URL);
    return labels ? { model, labels, origen: 'entrenado en este navegador' } : null;
  };
  const desdeNube = async () => {                       // modelo publicado en Supabase (si está configurado)
    if (!MODELO_NUBE_BASE) return null;
    const model = await tf.loadLayersModel(`${MODELO_NUBE_BASE}/modelo-lsp.json`);
    const labels = await loadLabels(model, `${MODELO_NUBE_BASE}/etiquetas.json`);
    return labels ? { model, labels, origen: 'nube (Supabase)' } : null;
  };
  const orden = local ? [desdeNavegador, desdeNube, desdeRepo] : [desdeNube, desdeRepo, desdeNavegador];
  for (const intento of orden) {
    try { const r = await intento(); if (r) return r; } catch { /* no hay modelo en esta ubicación */ }
  }
  return null;
}

export class Recognizer {
  constructor(model, labels) {
    this.model = model;
    this.labels = labels;
    tf.tidy(() => model.predict(tf.zeros([1, SEQ_LEN, FEATURE_DIM])).dataSync()); // calentamiento
  }
  predict(flat) {
    return tf.tidy(() => this.model.predict(tf.tensor3d(flat, [1, SEQ_LEN, FEATURE_DIM])).dataSync());
  }
}
