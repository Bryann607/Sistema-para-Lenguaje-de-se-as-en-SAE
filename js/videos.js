// Vista "Datos" · tarjeta «Importar videos de señas».
// Convierte videos de LSP en muestras de entrenamiento y las guarda en el mismo almacén local
// que las grabaciones con cámara (pestaña Datos → Exportar para compartirlas con el equipo).

import { REPOSO, SAMPLE_MS } from './config.js';
import { db } from './db.js';
import { ExtractorVideo, construirMuestras, construirMuestrasFrase, senaDesdeNombre, senasDesdeTexto, resumenCalidad } from './videoimport.js';

const $ = (s) => document.querySelector(s);
const AUTO = '__auto__';
const FRASE = '__frase__';

export function initVideos(app) {
  const sel = $('#vidSena'), msg = $('#vidMsg'), log = $('#vidLog'), barra = $('#vidBar');
  const extractor = new ExtractorVideo();
  let ocupado = false;

  const setMsg = (t, tipo = '') => { msg.textContent = t; msg.className = `msg ${tipo}`; };
  const addLog = (t) => { log.hidden = false; log.textContent += `${t}\n`; log.scrollTop = log.scrollHeight; };

  // ---------- selector: según el nombre del archivo, reposo o una seña concreta ----------
  function construirSelector() {
    sel.replaceChildren();
    sel.appendChild(new Option('Según el nombre del archivo (ej. matricula_01.mp4)', AUTO));
    sel.appendChild(new Option('Oración: varias señas en orden (el video se corta solo)', FRASE));
    sel.appendChild(new Option('Reposo (sin hacer seña)', REPOSO));
    for (const cat of app.vocab.categorias) {
      const lista = app.vocab.senas.filter((s) => s.categoria === cat.id);
      if (!lista.length) continue;
      const g = document.createElement('optgroup'); g.label = cat.nombre;
      lista.forEach((s) => g.appendChild(new Option(s.nombre, s.id)));
      sel.appendChild(g);
    }
  }

  async function importar(archivos) {
    if (ocupado || !archivos.length) return;
    ocupado = true;
    log.textContent = ''; log.hidden = true;
    $('#vidWrap').hidden = false; barra.style.width = '0';
    $('#vidArchivos').disabled = true;
    const signer = ($('#vidSigner').value.trim() || 'V01').replace(/[^A-Za-z0-9_-]/g, '');
    const hueco = Math.max(1, Math.round((Number($('#vidPausa').value) || 0.4) * 1000 / SAMPLE_MS));
    const opciones = { espejo: $('#vidEspejo').checked, usarReposo: $('#vidReposo').checked, repeticiones: $('#vidRepite').checked, hueco };
    const modoFrase = sel.value === FRASE;
    let secuencia = [];
    if (modoFrase) {
      const t = senasDesdeTexto($('#vidSecuencia').value, app.vocab);
      if (!t.ids.length || t.desconocidas.length) {
        setMsg(t.desconocidas.length ? `No reconozco estas señas: ${t.desconocidas.join(', ')}. Usa los nombres del vocabulario (ej. hola, matrícula, por favor).` : 'Escribe las señas del video en orden, separadas por coma (ej. hola, matrícula, cuándo).', 'error');
        ocupado = false; $('#vidArchivos').disabled = false; return;
      }
      secuencia = t.ids;
    }
    let total = 0, ok = 0;
    try {
      setMsg('Cargando el detector de manos… (la primera vez tarda unos segundos)');
      await extractor.init();
      for (let i = 0; i < archivos.length; i++) {
        const f = archivos[i];
        const label = modoFrase ? FRASE : (sel.value === AUTO ? senaDesdeNombre(f.name, app.vocab) : sel.value);
        if (!label) { addLog(`✗ ${f.name}: no se reconoce la seña por el nombre; se omite.`); continue; }
        setMsg(`Video ${i + 1} de ${archivos.length}: ${f.name} → ${modoFrase ? secuencia.map((x) => app.nombreDe(x)).join(' → ') : app.nombreDe(label)}`);
        try {
          const r = await extractor.leer(f, (p) => { barra.style.width = `${((i + p) / archivos.length) * 100}%`; });
          resumenCalidad(r.frames, r.manos, r.conCuerpo).avisos.forEach((a) => addLog(`! ${f.name}: ${a}`));
          const base = { signer, grupo: `${signer}:${f.name}`, ...opciones };
          const { muestras, avisos } = modoFrase
            ? construirMuestrasFrase(r.frames, r.manos, secuencia, base)
            : construirMuestras(r.frames, r.manos, { label, ...base });
          avisos.forEach((a) => addLog(`! ${f.name}: ${a}`));
          if (!muestras.length) { addLog(`✗ ${f.name}: no se generaron muestras.`); continue; }
          await db.addMany(muestras);
          const reposo = muestras.filter((m) => m.label === REPOSO && label !== REPOSO).length;
          if (modoFrase) {
            const cuenta = {}; muestras.filter((m) => m.label !== REPOSO).forEach((m) => { cuenta[m.label] = (cuenta[m.label] || 0) + 1; });
            addLog(`✓ ${f.name}: ${Object.entries(cuenta).map(([k, n]) => `${n} de «${app.nombreDe(k)}»`).join(', ')}${reposo ? ` + ${reposo} de reposo` : ''}`);
          } else {
            addLog(`✓ ${f.name}: ${muestras.length - reposo} muestras de «${app.nombreDe(label)}»${reposo ? ` + ${reposo} de reposo` : ''}`);
          }
          total += muestras.length; ok++;
        } catch (e) { addLog(`✗ ${f.name}: ${e.message}`); }
        barra.style.width = `${((i + 1) / archivos.length) * 100}%`;
      }
      setMsg(`Listo: ${ok} de ${archivos.length} videos importados (${total} muestras).`, ok ? 'ok' : 'error');
      window.dispatchEvent(new Event('lsp-datos-cambio'));
    } catch (e) {
      console.error(e);
      setMsg(`No se pudo iniciar el análisis: ${e.message}. Verifica tu conexión a internet (se descarga MediaPipe).`, 'error');
    } finally {
      ocupado = false; $('#vidArchivos').disabled = false;
    }
  }

  $('#vidArchivos').addEventListener('change', (e) => {
    const archivos = [...e.target.files]; e.target.value = '';
    importar(archivos);
  });
  // Mostrar u ocultar los campos según el modo (oración o seña única)
  const actualizarModo = () => {
    const frase = sel.value === FRASE;
    $('#vidFraseWrap').hidden = !frase; $('#vidFraseAyuda').hidden = !frase; $('#vidRepiteWrap').hidden = frase;
  };
  sel.addEventListener('change', actualizarModo);
  construirSelector();
  actualizarModo();
}
