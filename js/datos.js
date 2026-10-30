// Vista "Datos": graba muestras de señas (30 fotogramas ≈ 2 s), las guarda en el navegador
// y permite exportar / importar el dataset.

import { SEQ_LEN, REPOSO, META_MUESTRAS } from './config.js';
import { flattenSequence } from './features.js';
import { db } from './db.js';
import { exportDataset, parseDataset, downloadBlob } from './dataset.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function initDatos(app) {
  const sel = $('#selSena'), msg = $('#recMsg'), cuenta = $('#cuenta');
  let rec = { activo: false, frames: [], manos: [], listo: null };
  let cancelar = false, grabando = false;

  const setMsg = (t, tipo = '') => { msg.textContent = t; msg.className = `msg ${tipo}`; };

  // ---------- señas visibles (todas o solo el piloto) ----------
  const senasVisibles = () => ($('#soloPiloto').checked ? app.vocab.senas.filter((s) => s.piloto) : app.vocab.senas);

  // ---------- selector ----------
  function construirSelector() {
    sel.replaceChildren();
    const g0 = document.createElement('optgroup'); g0.label = 'Especial';
    g0.appendChild(new Option('Reposo (sin hacer seña)', REPOSO));
    sel.appendChild(g0);
    for (const cat of app.vocab.categorias) {
      const lista = senasVisibles().filter((s) => s.categoria === cat.id);
      if (!lista.length) continue;
      const g = document.createElement('optgroup'); g.label = cat.nombre;
      lista.forEach((s) => g.appendChild(new Option(s.nombre, s.id)));
      sel.appendChild(g);
    }
  }

  // ---------- avance ----------
  async function actualizarAvance() {
    const counts = await db.countsIndependientes();   // un video = 1, aunque genere varias ventanas
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const ventanas = await db.count();
    $('#totalMuestras').textContent = `${total} fuente${total === 1 ? '' : 's'}` + (ventanas !== total ? ` · ${ventanas} muestras` : '');
    const ul = $('#avance'); ul.replaceChildren();
    const fila = (id, nombre) => {
      const n = counts[id] || 0;
      const li = document.createElement('li'); li.dataset.id = id;
      if (sel.value === id) li.classList.add('sel');
      const a = document.createElement('span'); a.textContent = nombre;
      const m = document.createElement('span'); m.className = 'meter';
      const i = document.createElement('i'); i.style.width = `${Math.min(100, (n / META_MUESTRAS) * 100)}%`;
      if (n >= META_MUESTRAS) i.className = 'listo';
      m.appendChild(i);
      const c = document.createElement('span'); c.className = 'n'; c.textContent = n;
      li.append(a, m, c);
      li.addEventListener('click', () => { sel.value = id; actualizarAvance(); });
      ul.appendChild(li);
    };
    fila(REPOSO, 'Reposo (sin seña)');
    for (const cat of app.vocab.categorias) {
      const lista = senasVisibles().filter((s) => s.categoria === cat.id);
      if (!lista.length) continue;
      const h = document.createElement('h3'); h.textContent = cat.nombre; ul.appendChild(h);
      lista.forEach((s) => fila(s.id, s.nombre));
    }
  }
  sel.addEventListener('change', actualizarAvance);
  window.addEventListener('lsp-datos-cambio', actualizarAvance);   // lo emite la importación de videos
  $('#soloPiloto').addEventListener('change', () => { construirSelector(); actualizarAvance(); });

  // ---------- grabación ----------
  function onSample(f, info) {
    if (!rec.activo) return;
    rec.frames.push(f); rec.manos.push(info.left || info.right);
    cuenta.textContent = `Grabando ${rec.frames.length}/${SEQ_LEN}`;
    if (rec.frames.length >= SEQ_LEN) { rec.activo = false; rec.listo?.(); }
  }

  async function grabarUna(espera) {
    cuenta.className = 'cuenta on';
    for (let n = espera; n >= 1; n--) { cuenta.textContent = n; await sleep(1000); if (cancelar) { cuenta.className = 'cuenta'; return null; } }
    rec = { activo: true, frames: [], manos: [], listo: null };
    cuenta.className = 'cuenta on grabando'; cuenta.textContent = `Grabando 0/${SEQ_LEN}`;
    await new Promise((res) => { rec.listo = res; });
    cuenta.className = 'cuenta'; cuenta.textContent = '';
    return rec;
  }

  async function grabarSerie() {
    const label = sel.value, signer = ($('#signer').value.trim() || 'S01');
    const reps = Math.max(1, Math.min(30, Number($('#reps').value) || 1));
    localStorage.setItem('lsp-signer', signer);
    cancelar = false; grabando = true;
    $('#btnGrabar').disabled = true; $('#btnCancelar').hidden = false;
    let guardadas = 0, intentos = 0;
    try {
      while (guardadas < reps && intentos < reps * 3 && !cancelar) {
        intentos++;
        setMsg(`${app.nombreDe(label)}: repetición ${guardadas + 1} de ${reps}. Prepárate…`);
        const r = await grabarUna(guardadas === 0 ? 3 : 2);
        if (!r) break;
        const conManos = r.manos.filter(Boolean).length / SEQ_LEN;
        if (label !== REPOSO && conManos < 0.4) {
          setMsg('Casi no se vieron las manos. Colócate más lejos de modo que se vean hombros y manos, y repite.', 'error');
          await sleep(1500); continue;
        }
        await db.add({ label, signer, ts: Date.now(), data: flattenSequence(r.frames) });
        guardadas++;
        await actualizarAvance();
        await sleep(400);
      }
      setMsg(cancelar ? `Cancelado. Se guardaron ${guardadas} muestras.` : `Listo: se guardaron ${guardadas} muestras de «${app.nombreDe(label)}».`, 'ok');
    } finally {
      grabando = false; cancelar = false; rec.activo = false;
      cuenta.className = 'cuenta'; cuenta.textContent = '';
      $('#btnCancelar').hidden = true; $('#btnGrabar').disabled = !app.cameraOn;
    }
  }
  $('#btnGrabar').addEventListener('click', grabarSerie);
  $('#btnCancelar').addEventListener('click', () => { cancelar = true; rec.activo = false; rec.listo?.(); });

  // ---------- acciones ----------
  $('#btnDeshacer').addEventListener('click', async () => {
    const l = await db.removeLast();
    setMsg(l ? `Se eliminó la última muestra (${app.nombreDe(l)}).` : 'No hay muestras para eliminar.');
    actualizarAvance();
  });
  // Exporta solo las muestras nuevas desde la última exportación (evita subir lo mismo dos veces).
  const LS_EXPORT = 'lsp-export-hasta';
  async function exportar(todo) {
    const todas = await db.all();
    const desde = todo ? 0 : Number(localStorage.getItem(LS_EXPORT) || 0);
    const sel = todas.filter((m) => (m.ts || 0) > desde);
    if (!sel.length) {
      return setMsg(todo ? 'No hay muestras para exportar.' : 'No hay muestras nuevas desde la última exportación. Usa «Exportar todo» si quieres un respaldo completo.', 'error');
    }
    setMsg('Preparando archivo…');
    const { blob, ext } = await exportDataset(sel);
    const signer = ($('#signer').value.trim() || 'S01').replace(/[^A-Za-z0-9_-]/g, '');
    const marca = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-'); // 20261028-1530
    downloadBlob(blob, `dataset-lsp-${signer}-${marca}${todo ? '-completo' : ''}.${ext}`);
    if (!todo) localStorage.setItem(LS_EXPORT, String(Math.max(...sel.map((m) => m.ts || 0))));
    setMsg(`Exportadas ${sel.length} muestras (${(blob.size / 1048576).toFixed(1)} MB). Súbelas a data/dataset/ siguiendo docs/COLABORACION.md.`, 'ok');
  }
  $('#btnExportar').addEventListener('click', () => exportar(false));
  $('#btnExportarTodo').addEventListener('click', () => exportar(true));
  $('#fileImportar').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      setMsg('Importando…');
      const muestras = await parseDataset(file);
      const clave = (m) => `${m.signer}|${m.ts}|${m.label}`;
      const existentes = new Set((await db.all()).map(clave));
      const nuevas = muestras.filter((m) => !m.ts || !existentes.has(clave(m)));
      await db.addMany(nuevas);
      setMsg(`Se importaron ${nuevas.length} muestras nuevas (${muestras.length - nuevas.length} ya estaban).`, 'ok');
      actualizarAvance();
    } catch (err) { setMsg(err.message, 'error'); }
  });
  $('#btnBorrar').addEventListener('click', async () => {
    if (!confirm('¿Borrar TODAS las muestras guardadas en este navegador? Esta acción no se puede deshacer.')) return;
    await db.clear(); setMsg('Se borraron todas las muestras.'); actualizarAvance();
  });

  // ---------- integración ----------
  $('#signer').value = localStorage.getItem('lsp-signer') || 'S01';
  app.cameraListeners.push((on) => {
    if (!grabando) $('#btnGrabar').disabled = !on;
    if (!on) setMsg('Activa la cámara para grabar.');
    else if (app.vista === 'datos') setMsg('Elige la seña y pulsa Grabar.');
  });
  app.vistaListeners.push((v) => {
    if (v === 'datos') {
      app.onSample = onSample; actualizarAvance();
      if (app.cameraOn) setMsg('Elige la seña y pulsa Grabar.');
    }
  });
  construirSelector();
  actualizarAvance();
}
