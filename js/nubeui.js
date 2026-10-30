// Interfaz de la nube en admin.html: tarjeta «Nube (Supabase)» y botón «Publicar modelo».

import { db } from './db.js';
import { nubeConfigurada, sesion, entrar, salir, esAdmin, subirMuestras, descargarDatasets, listarDatasets, publicarModelo } from './nube.js';

const $ = (s) => document.querySelector(s);

export function initNube(app) {
  const msg = $('#nubeMsg'), estado = $('#nubeEstado');
  const setMsg = (t, tipo = '') => { msg.textContent = t; msg.className = `msg ${tipo}`; };
  const conectado = $('#nubeConectado'), formulario = $('#nubeForm');

  if (!nubeConfigurada()) {
    estado.textContent = 'No configurada';
    setMsg('La nube es opcional. Para activarla completa SUPABASE_URL y SUPABASE_ANON_KEY en js/config.js (ver docs/SUPABASE.md). Mientras tanto se sigue usando Git.');
    formulario.hidden = true; conectado.hidden = true;
    const o = $('#optNube'); if (o) { o.checked = false; o.disabled = true; }
    $('#btnPublicar').disabled = true;
    return;
  }

  async function refrescar() {
    try {
      const u = await sesion();
      formulario.hidden = Boolean(u); conectado.hidden = !u;
      if (!u) { estado.textContent = 'Sin sesión'; return; }
      const admin = await esAdmin();
      estado.textContent = admin ? `Conectado: ${u.email}` : `Conectado sin permisos: ${u.email}`;
      $('#nubeAcciones').hidden = !admin;
      if (!admin) setMsg('Este usuario no está en la tabla «admins». Revisa el paso 5 de supabase/esquema.sql.', 'error');
      else await sincronizarMuestras();
    } catch (e) { estado.textContent = 'Error de conexión'; setMsg(e.message, 'error'); }
  }

  async function sincronizarMuestras() {
    setMsg('Sincronizando muestras guardadas en la nube…');
    const nube = await descargarDatasets();
    const locales = await db.all();
    const porClave = new Map();
    const clave = (m) => `${m.signer || ''}|${m.ts || 0}|${m.label}|${m.grupo || ''}`;
    for (const muestra of locales) {
      const k = clave(muestra);
      if (!porClave.has(k)) porClave.set(k, []);
      porClave.get(k).push(muestra);
    }

    const visitadas = new Set(), nuevas = [], yaSubidas = new Set();
    for (const muestra of nube) {
      const k = clave(muestra);
      if (visitadas.has(k)) continue;
      visitadas.add(k);
      const encontradas = porClave.get(k);
      if (encontradas) {
        encontradas.forEach((local) => yaSubidas.add(local.id));
      } else {
        const local = { ...muestra, cloudUploaded: true };
        nuevas.push(local);
        porClave.set(k, [local]);
      }
    }
    const idsNuevos = nuevas.length ? await db.addMany(nuevas) : [];
    await db.markCloudUploaded([...yaSubidas, ...idsNuevos]);
    setMsg(`Sincronización completa: ${nuevas.length} muestras restauradas desde la nube.`, 'ok');
  }

  formulario.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setMsg('Ingresando…');
    try {
      await entrar($('#nubeCorreo').value.trim(), $('#nubeClave').value);
      formulario.reset(); setMsg('');
      await refrescar();
    } catch (e) { setMsg(`No se pudo ingresar: ${e.message}`, 'error'); }
  });
  $('#nubeSalir').addEventListener('click', async () => { await salir(); setMsg(''); refrescar(); });

  $('#nubeSubir').addEventListener('click', async () => {
    const boton = $('#nubeSubir'); boton.disabled = true;
    try {
      const nuevas = (await db.all()).filter((m) => !m.cloudUploaded);
      if (!nuevas.length) return setMsg('No hay muestras nuevas desde la última subida.');
      setMsg(`Subiendo ${nuevas.length} muestras…`);
      const r = await subirMuestras(nuevas);
      await db.markCloudUploaded(nuevas.map((m) => m.id));
      setMsg(`Subidas ${r.n} muestras (${(r.bytes / 1048576).toFixed(1)} MB) a la nube.`, 'ok');
      listar();
    } catch (e) { setMsg(`No se pudo subir: ${e.message}`, 'error'); }
    finally { boton.disabled = false; }
  });

  async function listar() {
    const ul = $('#nubeLista'); ul.replaceChildren();
    try {
      const filas = await listarDatasets();
      if (!filas.length) { const li = document.createElement('li'); li.textContent = 'Aún no hay datasets en la nube.'; ul.appendChild(li); return; }
      for (const f of filas) {
        const li = document.createElement('li');
        const fuentes = (f.dataset_fuentes || []).map((x) => x.senante).join(', ');
        li.textContent = `${f.archivo} · ${f.n_muestras} muestras · ${fuentes} · ${new Date(f.creado).toLocaleDateString('es-PE')}`;
        ul.appendChild(li);
      }
    } catch (e) { setMsg(`No se pudo listar: ${e.message}`, 'error'); }
  }
  $('#nubeListar').addEventListener('click', listar);

  // ---------- publicar el modelo recién entrenado ----------
  $('#btnPublicar').addEventListener('click', async () => {
    const out = app.ultimoEntrenamiento;
    const m = $('#publicarMsg');
    const decir = (t, tipo = '') => { m.textContent = t; m.className = `msg ${tipo}`; };
    if (!out) return decir('Primero entrena un modelo.', 'error');
    $('#btnPublicar').disabled = true; decir('Publicando el modelo…');
    try {
      const evaluadas = out.perClass.filter((c) => c.n);
      const n = evaluadas.reduce((a, c) => a + c.n, 0);
      const acierto = n ? evaluadas.reduce((a, c) => a + c.acc * c.n, 0) / n : null;
      const r = await publicarModelo(out.model, out.labels, { acierto });
      decir(`Modelo publicado (${r.version}, ${r.kb} KB). El sitio de usuarios lo usará en unos segundos.`, 'ok');
    } catch (e) { decir(`No se pudo publicar: ${e.message}`, 'error'); }
    finally { $('#btnPublicar').disabled = false; }
  });

  refrescar();
}
