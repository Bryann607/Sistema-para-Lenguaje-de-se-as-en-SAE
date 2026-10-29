// Modelo de reconocimiento (TensorFlow.js): construcción, entrenamiento en el navegador,
// guardado, carga y predicción. `tf` es global (se carga desde index.html).

import { SEQ_LEN, FEATURE_DIM, REPOSO, MODEL_URL, LABELS_URL, MODEL_IDB } from './config.js';

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

// ---------- aumento de datos ----------
function gauss() { return Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random()); }

export function augment(src) {
  const out = new Float32Array(SAMPLE_SIZE);
  const s = 0.9 + Math.random() * 0.2;
  const dx = (Math.random() - 0.5) * 0.16, dy = (Math.random() - 0.5) * 0.16;
  const shift = Math.floor(Math.random() * 7) - 3; // desplazamiento temporal ±3 fotogramas
  for (let t = 0; t < SEQ_LEN; t++) {
    const st = Math.min(SEQ_LEN - 1, Math.max(0, t + shift));
    for (let p = 0; p < FEATURE_DIM; p += 3) {
      const i = st * FEATURE_DIM + p, o = t * FEATURE_DIM + p;
      const x = src[i], y = src[i + 1], z = src[i + 2];
      if (x === 0 && y === 0 && z === 0) continue; // punto ausente: se deja en cero
      out[o] = x * s + dx + gauss() * 0.01;
      out[o + 1] = y * s + dy + gauss() * 0.01;
      out[o + 2] = z * s + gauss() * 0.01;
    }
  }
  return out;
}

// ---------- entrenamiento ----------
/**
 * @param {Array<{label:string,data:Float32Array}>} samples
 * @param {{arch:string,epochs:number,augment:number,minPerClass:number,onLog:Function,onEpoch:Function}} opt
 */
export async function trainModel(samples, opt) {
  const { arch = 'conv', epochs = 40, augment: aug = 2, minPerClass = 6, onLog = () => {}, onEpoch = () => {} } = opt;
  const valid = samples.filter((s) => s.data?.length === SAMPLE_SIZE);
  const byLabel = new Map();
  for (const s of valid) { if (!byLabel.has(s.label)) byLabel.set(s.label, []); byLabel.get(s.label).push(s); }
  const labels = [...byLabel.keys()].filter((l) => byLabel.get(l).length >= minPerClass)
    .sort((a, b) => (a === REPOSO ? -1 : b === REPOSO ? 1 : a.localeCompare(b)));
  const skipped = [...byLabel.keys()].filter((l) => !labels.includes(l));
  if (skipped.length) onLog(`Se omiten por tener menos de ${minPerClass} muestras: ${skipped.join(', ')}`);
  if (labels.length < 2) throw new Error('Se necesitan al menos 2 clases con muestras suficientes (incluye "reposo").');
  if (!labels.includes(REPOSO)) onLog('Aviso: no hay muestras de "reposo". El modelo detectará señas aun sin que se haga ninguna.');

  // División estratificada ~15 % validación
  const train = [], val = [];
  for (const l of labels) {
    const arr = byLabel.get(l).slice().sort(() => Math.random() - 0.5);
    const nv = Math.max(1, Math.round(arr.length * 0.15));
    val.push(...arr.slice(0, nv)); train.push(...arr.slice(nv));
  }
  const trainAug = [...train];
  for (let k = 1; k < aug; k++) for (const s of train) trainAug.push({ label: s.label, data: augment(s.data) });
  trainAug.sort(() => Math.random() - 0.5);
  onLog(`Clases: ${labels.length} · entrenamiento: ${trainAug.length} (${train.length} reales) · validación: ${val.length}`);

  const toTensors = (arr) => {
    const flat = new Float32Array(arr.length * SAMPLE_SIZE);
    arr.forEach((s, i) => flat.set(s.data, i * SAMPLE_SIZE));
    const xs = tf.tensor3d(flat, [arr.length, SEQ_LEN, FEATURE_DIM]);
    const ys = tf.oneHot(tf.tensor1d(arr.map((s) => labels.indexOf(s.label)), 'int32'), labels.length);
    return { xs, ys };
  };
  const tr = toTensors(trainAug), va = toTensors(val);
  const model = buildModel(labels.length, arch);
  const handle = { stop: () => { model.stopTraining = true; } };
  opt.onHandle?.(handle);

  try {
    await model.fit(tr.xs, tr.ys, {
      epochs, batchSize: 32, shuffle: true, validationData: [va.xs, va.ys],
      callbacks: {
        onEpochEnd: async (ep, logs) => {
          onEpoch(ep + 1, epochs, {
            loss: logs.loss, acc: logs.acc ?? logs.accuracy,
            valLoss: logs.val_loss, valAcc: logs.val_acc ?? logs.val_accuracy,
          });
          await tf.nextFrame();
        },
      },
    });

    // Precisión por seña en validación
    const pred = tf.tidy(() => model.predict(va.xs).argMax(-1));
    const predArr = Array.from(await pred.data()); pred.dispose();
    const perClass = labels.map((l, i) => {
      let n = 0, ok = 0;
      val.forEach((s, j) => { if (s.label === l) { n++; if (predArr[j] === i) ok++; } });
      return { label: l, n, acc: n ? ok / n : null };
    });
    model.setUserDefinedMetadata({ labels, seqLen: SEQ_LEN, featureDim: FEATURE_DIM, arch, muestras: valid.length, fecha: new Date().toISOString() });
    await model.save(MODEL_IDB);
    localStorage.setItem(LS_LABELS, JSON.stringify(labels));
    return { model, labels, perClass };
  } finally {
    tr.xs.dispose(); tr.ys.dispose(); va.xs.dispose(); va.ys.dispose();
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
  const orden = local ? [desdeNavegador, desdeRepo] : [desdeRepo, desdeNavegador];
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
