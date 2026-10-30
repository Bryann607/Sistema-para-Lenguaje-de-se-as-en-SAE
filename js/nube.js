// Conexión OPCIONAL con Supabase (solo administrador): centraliza datasets y publica el modelo.
// Si SUPABASE_URL / SUPABASE_ANON_KEY están vacíos en config.js, nada de esto se usa y el sistema
// sigue funcionando con Git como antes.
//
//   · datasets → bucket privado «datasets» (archivos .json.gz) + tablas datasets / dataset_fuentes / senantes
//   · modelo   → bucket público «modelo/actual» (lo lee el sitio de usuarios) + tabla modelos

import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JS } from './config.js';
import { exportDataset, parseDataset } from './dataset.js';

export const nubeConfigurada = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let cliente = null;
async function sb() {
  if (!nubeConfigurada()) throw new Error('La nube no está configurada (js/config.js).');
  if (!cliente) {
    const { createClient } = await import(SUPABASE_JS);
    cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, storageKey: 'lsp-nube-sesion' } });
  }
  return cliente;
}
const ok = ({ data, error }) => { if (error) throw new Error(error.message || String(error)); return data; };
const limpio = (t) => String(t).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30) || 'S00';

// ---------- sesión ----------
export async function sesion() { const c = await sb(); return ok(await c.auth.getSession()).session?.user || null; }
export async function entrar(correo, clave) { const c = await sb(); return ok(await c.auth.signInWithPassword({ email: correo, password: clave })).user; }
export async function salir() { const c = await sb(); await c.auth.signOut(); }
export async function esAdmin() { const c = await sb(); return ok(await c.rpc('es_admin')) === true; }

// ---------- datasets ----------
/** Sube las muestras como un archivo .json.gz y registra el dataset y sus fuentes. */
export async function subirMuestras(muestras) {
  const c = await sb();
  const user = await sesion();
  if (!user) throw new Error('Inicia sesión en la nube primero.');
  const { blob, ext } = await exportDataset(muestras);
  const fuentes = [...new Set(muestras.map((m) => (m.signer || 'S00').slice(0, 40)))];
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const archivo = `${fuentes.slice(0, 3).map(limpio).join('+')}_${sello}.${ext}`;

  ok(await c.storage.from('datasets').upload(archivo, blob, { contentType: ext === 'json.gz' ? 'application/gzip' : 'application/json', upsert: false }));
  try {
    const origen = (codigo) => (muestras.some((m) => (m.signer || 'S00').slice(0, 40) === codigo && m.grupo) ? 'video' : 'camara');
    ok(await c.from('senantes').upsert(fuentes.map((codigo) => ({ codigo, origen: origen(codigo) })), { onConflict: 'codigo', ignoreDuplicates: true }));
    const ds = ok(await c.from('datasets').insert({ archivo, n_muestras: muestras.length, subido_por: user.id }).select('id').single());
    ok(await c.from('dataset_fuentes').insert(fuentes.map((senante) => ({ dataset_id: ds.id, senante }))));
  } catch (e) {
    await c.storage.from('datasets').remove([archivo]);          // no dejar archivos huérfanos
    throw e;
  }
  return { archivo, bytes: blob.size, n: muestras.length };
}

export async function listarDatasets() {
  const c = await sb();
  return ok(await c.from('datasets').select('archivo,n_muestras,creado,dataset_fuentes(senante)').order('creado', { ascending: false }).limit(50));
}

/** Descarga todos los datasets de la nube y devuelve las muestras (para entrenar). */
export async function descargarDatasets(onProgreso) {
  const c = await sb();
  if (!(await sesion())) throw new Error('Inicia sesión en la nube (pestaña Datos) para usar sus datasets.');
  const lista = ok(await c.from('datasets').select('archivo').order('creado', { ascending: true }));
  const todas = [];
  for (let i = 0; i < lista.length; i++) {
    onProgreso?.(`Nube: descargando ${lista[i].archivo} (${i + 1}/${lista.length})…`);
    const blob = ok(await c.storage.from('datasets').download(lista[i].archivo));
    todas.push(...(await parseDataset(blob)));
  }
  return todas;
}

// ---------- modelo ----------
/** Publica el modelo entrenado en el bucket público para que el sitio de usuarios lo use sin tocar Git. */
export async function publicarModelo(model, labels, { acierto = null } = {}) {
  const c = await sb();
  const user = await sesion();
  if (!user) throw new Error('Inicia sesión en la nube primero.');

  const piezas = {};
  await model.save(tf.io.withSaveHandler(async (a) => {          // serializa sin descargar archivos
    const manifiesto = {
      modelTopology: a.modelTopology, format: a.format, generatedBy: a.generatedBy, convertedBy: a.convertedBy,
      trainingConfig: a.trainingConfig, userDefinedMetadata: a.userDefinedMetadata,
      weightsManifest: [{ paths: ['modelo-lsp.weights.bin'], weights: a.weightSpecs }],
    };
    piezas.json = new Blob([JSON.stringify(manifiesto)], { type: 'application/json' });
    piezas.bin = new Blob([].concat(a.weightData), { type: 'application/octet-stream' });
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  }));
  if (!piezas.json || !piezas.bin) throw new Error('No se pudo serializar el modelo.');
  const etiquetas = new Blob([JSON.stringify(labels, null, 2)], { type: 'application/json' });

  const subir = async (ruta, blob, tipo) =>
    ok(await c.storage.from('modelo').upload(`actual/${ruta}`, blob, { contentType: tipo, upsert: true, cacheControl: '60' }));
  await subir('modelo-lsp.weights.bin', piezas.bin, 'application/octet-stream');   // primero los pesos, luego el que los referencia
  await subir('modelo-lsp.json', piezas.json, 'application/json');
  await subir('etiquetas.json', etiquetas, 'application/json');

  const version = `v${new Date().toISOString().replace(/[:.]/g, '-')}`;
  ok(await c.from('modelos').update({ activo: false }).eq('activo', true));
  ok(await c.from('modelos').insert({
    version, n_senas: labels.length, acierto, etiquetas: labels, activo: true, publicado_por: user.id,
  }));
  return { version, kb: Math.round((piezas.bin.size + piezas.json.size) / 1024) };
}
