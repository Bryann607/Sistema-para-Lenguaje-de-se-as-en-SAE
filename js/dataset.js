// Exportar / importar datasets (.json.gz) para guardarlos en el repositorio.

import { SEQ_LEN, FEATURE_DIM, DATASET_MANIFEST } from './config.js';

const FORMAT = 'lsp-upsjb';

export async function exportDataset(samples) {
  const payload = {
    formato: FORMAT, version: 1, seqLen: SEQ_LEN, featureDim: FEATURE_DIM,
    creado: new Date().toISOString(),
    muestras: samples.map((m) => ({
      label: m.label, signer: m.signer || '', ts: m.ts || 0, grupo: m.grupo || '',
      data: Array.from(m.data, (v) => Math.round(v * 1000) / 1000),
    })),
  };
  const json = JSON.stringify(payload);
  if (typeof CompressionStream === 'undefined') {
    return { blob: new Blob([json], { type: 'application/json' }), ext: 'json' };
  }
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return { blob: await new Response(stream).blob(), ext: 'json.gz' };
}

/** Lee un Blob/File/ArrayBuffer (json o json.gz) y devuelve muestras válidas. */
export async function parseDataset(input) {
  const buf = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  let text;
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Tu navegador no puede abrir archivos .gz. Usa Chrome, Edge o Firefox actualizados.');
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(buf);
  }
  const obj = JSON.parse(text);
  if (obj.formato !== FORMAT) throw new Error('El archivo no es un dataset de este proyecto.');
  if (obj.seqLen !== SEQ_LEN || obj.featureDim !== FEATURE_DIM) {
    throw new Error(`Dataset incompatible (seqLen=${obj.seqLen}, featureDim=${obj.featureDim}).`);
  }
  const expected = SEQ_LEN * FEATURE_DIM;
  return obj.muestras
    .filter((m) => m && m.label && Array.isArray(m.data) && m.data.length === expected)
    .map((m) => ({ label: m.label, signer: m.signer || '', ts: m.ts || 0, grupo: m.grupo || '', data: Float32Array.from(m.data) }));
}

/** Descarga los datasets listados en data/dataset/manifest.json (si existen). */
export async function loadRepoDatasets(onProgress) {
  const res = await fetch(DATASET_MANIFEST, { cache: 'no-cache' });
  if (!res.ok) return [];
  const manifest = await res.json();
  const files = manifest.archivos || [];
  const all = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(`Descargando ${files[i]} (${i + 1}/${files.length})…`);
    const r = await fetch(`data/dataset/${files[i]}`);
    if (!r.ok) continue;
    all.push(...(await parseDataset(await r.arrayBuffer())));
  }
  return all;
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
