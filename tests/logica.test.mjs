// Pruebas de la lógica pura del sistema (sin navegador, sin TensorFlow, sin internet).
// Ejecutar desde la raíz del proyecto:  node --test               (requiere Node 18 o superior)
// Conviene correrlas ANTES de cada `git push`: si algo falla, el mensaje dice qué se rompió.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SEQ_LEN, FEATURE_DIM, LEFT_OFFSET, RIGHT_OFFSET, POSE_POINTS } from '../js/config.js';
import { extractFeatures, flattenSequence } from '../js/features.js';
import { augment, cambiarVelocidad, espejarSecuencia, planDeAumento, SAMPLE_SIZE } from '../js/aumento.js';
import { matrizConfusion, paresConfundidos, metricasPorClase } from '../js/evaluacion.js';
import { segmentarPorMovimiento, segmentarRepeticiones, construirMuestras, construirMuestrasFrase, senasDesdeTexto } from '../js/videoimport.js';
import { componerFrase } from '../js/frases.js';
import { interpretarConsulta } from '../js/intencion.js';
import { exportDataset, parseDataset } from '../js/dataset.js';

const leer = (r) => JSON.parse(readFileSync(new URL(`../${r}`, import.meta.url), 'utf8'));
const vocab = leer('data/vocabulario.json'), reglas = leer('data/frases.json'), respuestas = leer('data/respuestas.json');
let semilla = 99; const rng = () => (semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296;

// ---------- contratos que NO se pueden cambiar sin reentrenar ----------
test('contrato: dimensiones del modelo', () => {
  assert.equal(SEQ_LEN, 30); assert.equal(FEATURE_DIM, 201);
  assert.equal(FEATURE_DIM, POSE_POINTS * 3 + 21 * 3 * 2); assert.equal(RIGHT_OFFSET, LEFT_OFFSET + 63);
});

test('contenido: cada seña del vocabulario tiene id único y respuesta', () => {
  const ids = vocab.senas.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'hay ids repetidos en vocabulario.json');
  const sinRespuesta = ids.filter((id) => !respuestas[id]);
  assert.deepEqual(sinRespuesta, [], `señas sin entrada en respuestas.json: ${sinRespuesta}`);
  vocab.senas.forEach((s) => assert.ok(vocab.categorias.some((c) => c.id === s.categoria), `categoría inexistente en ${s.id}`));
});

// ---------- características ----------
const punto = (x, y, z = 0) => ({ x, y, z });
test('características: normalización invariante a posición y distancia', () => {
  const pose = Array.from({ length: 33 }, () => punto(0.5, 0.5));
  pose[11] = punto(0.6, 0.4); pose[12] = punto(0.4, 0.4); pose[15] = punto(0.7, 0.7); pose[16] = punto(0.3, 0.7);
  const mano = (cx, cy) => Array.from({ length: 21 }, (_, i) => punto(cx + i * 0.001, cy));
  const mover = (p, s, dx) => p.map((q) => punto((q.x - 0.5) * s + 0.5 + dx, (q.y - 0.5) * s + 0.5, q.z * s));
  const a = extractFeatures(pose, [mano(0.3, 0.7), mano(0.7, 0.7)], 1);
  const b = extractFeatures(mover(pose, 0.5, 0.1), [mano(0.3, 0.7), mano(0.7, 0.7)].map((h) => mover(h, 0.5, 0.1)), 1);
  assert.ok(a.info.left && a.info.right);
  assert.ok(Math.abs(a.features[LEFT_OFFSET] - 1) < 1e-5, 'la mano de la muñeca 15 debe ir a la izquierda');
  for (let i = 0; i < FEATURE_DIM; i++) assert.ok(Math.abs(a.features[i] - b.features[i]) < 1e-4);
  assert.equal(extractFeatures(undefined, [], 1).info.pose, false);
});

// ---------- aumento de datos ----------
const muestraBase = () => {
  const s = new Float32Array(SAMPLE_SIZE);
  for (let t = 0; t < SEQ_LEN; t++) {
    for (let p = 0; p < POSE_POINTS; p++) { const i = t * FEATURE_DIM + p * 3; s[i] = 0.1 * p; s[i + 1] = 0.05 * p; s[i + 2] = 0.01; }
    for (let p = 0; p < 21; p++) { const i = t * FEATURE_DIM + LEFT_OFFSET + p * 3; s[i] = 0.5 + t * 0.02 + p * 0.01; s[i + 1] = 0.3 - t * 0.01; s[i + 2] = 0.02; }
  }
  return s;
};
test('aumento: tamaño correcto, sin NaN y sin inventar manos', () => {
  const src = muestraBase();
  for (let n = 0; n < 200; n++) {
    const v = augment(src, { pEspejo: 0 }, rng);
    assert.equal(v.length, SAMPLE_SIZE); assert.ok(v.every(Number.isFinite));
    for (let t = 0; t < SEQ_LEN; t++) for (let k = 0; k < 63; k++) assert.equal(v[t * FEATURE_DIM + RIGHT_OFFSET + k], 0, 'apareció una mano que no existía');
  }
});
test('aumento: espejo reversible y velocidad 1 = identidad', () => {
  const src = muestraBase();
  assert.deepEqual(espejarSecuencia(espejarSecuencia(src)), src);
  assert.deepEqual(cambiarVelocidad(src, 1, 0), src);
});
test('aumento: el plan equilibra solo las clases pequeñas', () => {
  assert.deepEqual(planDeAumento({ hola: 10, gracias: 40, reposo: 200 }, 3), { hola: 70, gracias: 80, reposo: 0 });
  assert.deepEqual(planDeAumento({ a: 10 }, 1), { a: 0 });
  assert.equal(planDeAumento({ a: 2, b: 50, c: 50 }, 6).a, 14, 'tope de 8 copias por muestra real');
});

// ---------- evaluación ----------
test('evaluación: matriz, pares confundidos y F1', () => {
  const m = matrizConfusion([0, 0, 1, 1, 1, 2, 2], [0, 1, 1, 1, 0, 2, 0], 3);
  assert.deepEqual(m, [[1, 1, 0], [1, 2, 0], [1, 0, 1]]);
  assert.equal(paresConfundidos(m, ['a', 'b', 'c'])[0].n, 1);
  assert.ok(Math.abs(metricasPorClase(m, ['a', 'b', 'c'])[1].f1 - 2 / 3) < 1e-9);
});

// ---------- videos ----------
function video(guion) {
  const frames = [], manos = []; let tt = 0;
  for (const g of guion) for (let i = 0; i < g.n; i++) {
    const f = new Float32Array(FEATURE_DIM);
    for (let p = 0; p < POSE_POINTS; p++) { f[p * 3] = 0.1 * p; f[p * 3 + 1] = 0.05 * p; f[p * 3 + 2] = 0.01; }
    const mano = g.tipo !== 'sin';
    if (mano) { const mov = g.tipo === 'seña' ? Math.sin(tt * 0.9) * 0.5 : 0.003 * Math.sin(tt);
      for (let p = 0; p < 21; p++) { const k = LEFT_OFFSET + p * 3; f[k] = 0.5 + mov + p * 0.01; f[k + 1] = 0.3 + (g.tipo === 'seña' ? Math.cos(tt * 0.9) * 0.3 : 0); f[k + 2] = 0.02; } }
    frames.push(f); manos.push(mano); tt++;
  }
  return { frames, manos };
}
test('videos: separa tres señas con pausas', () => {
  const v = video([{ tipo: 'quieta', n: 8 }, { tipo: 'seña', n: 20 }, { tipo: 'quieta', n: 10 }, { tipo: 'seña', n: 22 }, { tipo: 'quieta', n: 10 }, { tipo: 'seña', n: 18 }, { tipo: 'quieta', n: 8 }]);
  assert.equal(segmentarPorMovimiento(v.frames, v.manos).tramos.length, 3);
  assert.equal(segmentarPorMovimiento(video([{ tipo: 'quieta', n: 40 }]).frames, video([{ tipo: 'quieta', n: 40 }]).manos).tramos.length, 0);
});
test('videos: repeticiones de una seña descartan el ruido corto', () => {
  const v = video([{ tipo: 'seña', n: 20 }, { tipo: 'quieta', n: 10 }, { tipo: 'seña', n: 20 }, { tipo: 'quieta', n: 10 }, { tipo: 'seña', n: 6 }, { tipo: 'quieta', n: 10 }, { tipo: 'seña', n: 21 }]);
  assert.equal(segmentarRepeticiones(v.frames, v.manos).length, 3);
  const r = construirMuestras(v.frames, v.manos, { label: 'hola', signer: 'T', grupo: 'T:a', repeticiones: true });
  assert.ok(r.muestras.length > 0 && r.muestras.every((m) => m.label === 'hola' && m.data.length === SAMPLE_SIZE));
});
test('videos: oración etiqueta en orden y NO guarda si la cantidad no coincide', () => {
  const v = video([{ tipo: 'quieta', n: 8 }, { tipo: 'seña', n: 18 }, { tipo: 'quieta', n: 10 }, { tipo: 'seña', n: 24 }, { tipo: 'quieta', n: 10 }, { tipo: 'seña', n: 16 }, { tipo: 'quieta', n: 8 }]);
  const ok = construirMuestrasFrase(v.frames, v.manos, ['hola', 'matricula', 'cuando'], { signer: 'T', grupo: 'T:o' });
  assert.deepEqual([...new Set(ok.muestras.map((m) => m.label))].sort(), ['cuando', 'hola', 'matricula']);
  assert.ok(ok.muestras.every((m) => m.data.length === SAMPLE_SIZE && m.grupo === 'T:o'));
  const mal = construirMuestrasFrase(v.frames, v.manos, ['hola', 'matricula'], { signer: 'T', grupo: 'T:o' });
  assert.equal(mal.muestras.length, 0); assert.match(mal.avisos[0], /No se guardó nada/);
});
test('videos: texto de señas → ids', () => {
  assert.deepEqual(senasDesdeTexto('hola, matrícula, cuándo', vocab).ids, ['hola', 'matricula', 'cuando']);
  assert.deepEqual(senasDesdeTexto('hola por favor matricula', vocab).ids, ['hola', 'por_favor', 'matricula']);
  assert.deepEqual(senasDesdeTexto('hola, xyz', vocab).desconocidas, ['xyz']);
});

// ---------- oraciones ----------
test('oraciones: reglas de data/frases.json', () => {
  const c = (ids) => componerFrase(ids, vocab, reglas);
  assert.equal(c(['hola']), 'Hola.');
  assert.equal(c(['hola', 'cuando', 'matricula']), 'Hola. ¿Cuándo es la matrícula?');
  assert.equal(c(['cuanto', 'pension']), '¿Cuánto es la pensión?');
  assert.equal(c(['ayuda', 'constancia']), 'Necesito ayuda con la constancia.');
  assert.equal(c(['hola', 'matricula', 'cuando', 'gracias']), 'Hola. ¿Cuándo es la matrícula? Gracias.');
  assert.equal(c(['matricula', 'matricula']), 'Necesito información sobre la matrícula.');
  assert.equal(c(['xyz']), '');
});

// ---------- intención de la oración completa ----------
test('intención: la información se decide con toda la oración, no con la última seña', () => {
  const q = (ids) => interpretarConsulta(ids, vocab, reglas);
  // caso reportado: «hola matrícula por favor» debe responder sobre la matrícula, no sobre «por favor»
  let r = q(['hola', 'matricula', 'por_favor']);
  assert.equal(r.tipo, 'tema'); assert.equal(r.principal, 'matricula'); assert.deepEqual(r.otros, []);
  // una sola seña sigue respondiendo directo
  assert.equal(q(['matricula']).principal, 'matricula');
  // pregunta + tema: el tema manda y se conoce la pregunta (para resaltar el dato)
  r = q(['hola', 'cuando', 'matricula', 'gracias']);
  assert.equal(r.principal, 'matricula'); assert.equal(r.pregunta, 'cuando');
  // el orden de las señas no cambia el tema
  assert.equal(q(['por_favor', 'matricula']).principal, 'matricula');
  assert.equal(q(['matricula', 'cuando']).pregunta, 'cuando');
  // varios temas: el primero es el principal y los demás quedan disponibles
  r = q(['hola', 'matricula', 'pension', 'matricula']);
  assert.equal(r.principal, 'matricula'); assert.deepEqual(r.otros, ['pension']);
  // ayuda + tema responde el tema; ayuda sola responde ayuda
  assert.equal(q(['ayuda', 'constancia']).principal, 'constancia');
  assert.equal(q(['ayuda']).tipo, 'ayuda');
  // solo cortesía: saludo manda sobre despedida
  assert.deepEqual([q(['hola']).tipo, q(['hola']).principal], ['cortesia', 'hola']);
  assert.equal(q(['hola', 'por_favor']).principal, 'hola');
  assert.equal(q(['gracias']).principal, 'gracias');
  assert.equal(q(['gracias', 'adios']).principal, 'adios');
  // solo pregunta; sin señas conocidas
  assert.deepEqual([q(['cuando']).tipo, q(['cuando']).principal], ['pregunta', 'cuando']);
  assert.equal(q(['xyz']).tipo, 'vacio'); assert.equal(q([]).principal, null);
  // toda seña del vocabulario produce un principal con respuesta
  for (const s of vocab.senas) assert.ok(respuestas[q([s.id]).principal], `sin respuesta para ${s.id}`);
});

test('oraciones: palabras de contexto y saludos nuevos', () => {
  const c = (ids) => componerFrase(ids, vocab, reglas);
  assert.equal(c(['buenos_dias', 'matricula']), 'Buenos días. Necesito información sobre la matrícula.');
  assert.equal(c(['yo', 'estudiante', 'matricula']), 'Soy estudiante. Necesito información sobre la matrícula.');
  assert.equal(c(['problema', 'wifi']), 'Tengo un problema con el wifi.');
  assert.equal(c(['hola', 'yo', 'contrasena', 'por_favor']), 'Hola. Necesito información sobre la contraseña. Por favor.');
  assert.equal(c(['no_entiendo']), 'No entiendo.');
  assert.equal(c(['yo']), 'Yo.');
});
test('intención: las palabras de contexto no se confunden con el tema', () => {
  const q = (ids) => interpretarConsulta(ids, vocab, reglas);
  assert.equal(q(['hola', 'yo', 'estudiante', 'reclamo']).principal, 'reclamo');
  assert.equal(q(['problema', 'wifi']).principal, 'wifi');
  assert.equal(q(['yo', 'estudiante']).principal, 'estudiante');
  assert.equal(q(['buenas_tardes']).tipo, 'cortesia');
});
test('contenido: la información del SAE incluye contacto oficial y todo tema nuevo tiene su respuesta', () => {
  for (const s of vocab.senas) {
    const e = respuestas[s.id];
    assert.ok(e?.titulo && e?.resumen, `falta titulo/resumen en ${s.id}`);
    if (['tramites', 'academico', 'cuentas', 'lugares'].includes(s.categoria)) assert.match(e.contacto || '', /helpdesk@upsjb\.edu\.pe/, `sin contacto del SAE en ${s.id}`);
  }
});

// ---------- datasets ----------
test('datasets: exportar → importar conserva las muestras y rechaza formatos incompatibles', async () => {
  const data = muestraBase();
  const { blob } = await exportDataset([{ label: 'hola', signer: 'T', ts: 1, data }]);
  const vuelta = await parseDataset(await blob.arrayBuffer());
  assert.equal(vuelta.length, 1); assert.equal(vuelta[0].label, 'hola'); assert.equal(vuelta[0].data.length, SAMPLE_SIZE);
  const malo = new TextEncoder().encode(JSON.stringify({ formato: 'lsp-upsjb', version: 1, seqLen: 20, featureDim: 201, muestras: [] }));
  await assert.rejects(() => parseDataset(malo.buffer), /incompatible/i);
});
test('datasets del repositorio: formato y dimensiones compatibles', () => {
  const carpeta = new URL('../data/dataset/', import.meta.url);
  if (!existsSync(carpeta)) return;
  for (const f of readdirSync(carpeta).filter((n) => /^dataset-.*\.json$/.test(n))) {
    const d = JSON.parse(readFileSync(new URL(f, carpeta), 'utf8'));
    assert.equal(d.formato, 'lsp-upsjb', f); assert.equal(d.seqLen, SEQ_LEN, f); assert.equal(d.featureDim, FEATURE_DIM, f);
    const malas = d.muestras.filter((m) => m.data.length !== SEQ_LEN * FEATURE_DIM).length;
    if (malas) console.warn(`  aviso: ${f} tiene ${malas} muestra(s) incompleta(s); se ignoran al entrenar.`);
  }
});

// ---------- sitio público ----------
test('sitio público: nada falta y no se cuela código de administración', () => {
  let python = null;
  for (const p of ['python3', 'python', 'py']) { try { execFileSync(p, ['--version'], { stdio: 'ignore' }); python = p; break; } catch { /* probar el siguiente */ } }
  if (!python) return;   // sin Python no se puede verificar aquí; GitHub Actions lo verifica al publicar
  const salida = execFileSync(python, ['tools/armar_sitio.py', '--verificar'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.match(salida, /OK:/);
});
