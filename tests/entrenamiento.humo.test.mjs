// Prueba de humo del entrenamiento con un TensorFlow.js SIMULADO: no valida números ni precisión,
// pero detecta errores de código (variables mal escritas, flujo roto, pesos que no se restauran).
// Para validar el aprendizaje real hay que entrenar en el navegador (admin.html → Entrenamiento).

import test from 'node:test';
import assert from 'node:assert/strict';

class T {
  constructor(shape, d) { this.shape = shape; this.d = d; }
  dispose() {} clone() { return new T(this.shape, this.d); } mul() { return this; } add() { return this; }
  argMax() { return new T([this.shape[0]], Array.from({ length: this.shape[0] }, (_, i) => i % 2)); }
  async data() { return this.d; }
}
const eventos = [];
const modelo = {
  stopTraining: false, pesos: [new T([1], [0])], add() {}, compile() {},
  async fit(xs, ys, cfg) {
    const valLoss = [1, 0.8, 0.6, 0.7, 0.75, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
    for (let e = 0; e < cfg.epochs; e++) {
      this.pesos = [new T([1], [e + 1])];                       // «pesos» de la época e+1
      await cfg.callbacks.onEpochEnd(e, { loss: 1, acc: 0.5, val_loss: valLoss[e] ?? 0.9, val_acc: 0.6 });
      if (this.stopTraining) { eventos.push(['detenido', e + 1]); break; }
    }
  },
  predict(x) { return new T([x.shape[0], 3], []); }, getWeights() { return this.pesos; },
  setWeights(w) { eventos.push(['restaurado', w[0].d[0]]); }, setUserDefinedMetadata(m) { eventos.push(['meta', m.mejorEpoca]); }, async save() {},
};
globalThis.tf = {
  sequential: () => modelo, layers: { gru: () => ({}), conv1d: () => ({}), maxPooling1d: () => ({}), dropout: () => ({}), flatten: () => ({}), dense: () => ({}) },
  regularizers: { l2: () => ({}) }, train: { adam: () => ({}) }, tensor3d: (f, s) => new T(s, f), tensor1d: (a) => new T([a.length], a),
  oneHot: (t, k) => new T([t.shape[0], k], []), cast: (t) => t, tidy: (fn) => fn(), nextFrame: async () => {},
};
const memoria = {}; globalThis.localStorage = { setItem: (k, v) => { memoria[k] = v; }, getItem: (k) => memoria[k] ?? null };
globalThis.location = { hostname: 'localhost' };

const { trainModel } = await import('../js/model.js');
const { SEQ_LEN, FEATURE_DIM, REPOSO } = await import('../js/config.js');
const mk = (label, n, g) => Array.from({ length: n }, (_, i) => ({ label, signer: 'S', ts: i, grupo: `${g}${i % 4}`, data: new Float32Array(SEQ_LEN * FEATURE_DIM).map(() => Math.random()) }));

test('entrenamiento: restaura la mejor época, se detiene sin mejora y entrega confusiones', async () => {
  eventos.length = 0;
  const avisos = [];
  const out = await trainModel([...mk('hola', 12, 'h'), ...mk('gracias', 40, 'g'), ...mk(REPOSO, 100, 'r')],
    { epochs: 12, augment: 3, paciencia: 6, minPerClass: 6, onLog: (t) => avisos.push(t), onEpoch: () => {} });
  assert.equal(out.mejorEpoca, 3);
  assert.deepEqual(eventos.find((e) => e[0] === 'restaurado'), ['restaurado', 3], 'debe quedarse con los pesos de la época 3');
  assert.deepEqual(eventos.find((e) => e[0] === 'detenido'), ['detenido', 9], 'paciencia 6 después de la mejor época 3');
  assert.deepEqual(out.labels.slice().sort(), [REPOSO, 'gracias', 'hola'].sort());
  assert.ok(Array.isArray(out.pares) && Array.isArray(out.matriz));
  assert.ok(avisos.some((t) => /variantes sintéticas/.test(t)));
});
test('entrenamiento: con una sola clase da un error claro', async () => {
  await assert.rejects(() => trainModel(mk('hola', 20, 'h'), { epochs: 2, onLog() {}, onEpoch() {} }), /al menos 2 clases/);
});
