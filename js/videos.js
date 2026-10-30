// Vista "Datos" · tarjeta «Importar videos de señas».
// Convierte videos de LSP en muestras de entrenamiento y las guarda en el mismo almacén local
// que las grabaciones con cámara (pestaña Datos → Exportar para compartirlas con el equipo).

import { REPOSO } from './config.js';
import { db } from './db.js';
import { ExtractorVideo, construirMuestras, senaDesdeNombre } from './videoimport.js';

const $ = (s) => document.querySelector(s);
const AUTO = '__auto__';

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
    const opciones = { espejo: $('#vidEspejo').checked, usarReposo: $('#vidReposo').checked };
    let total = 0, ok = 0;
    try {
      setMsg('Cargando el detector de manos… (la primera vez tarda unos segundos)');
      await extractor.init();
      for (let i = 0; i < archivos.length; i++) {
        const f = archivos[i];
        const label = sel.value === AUTO ? senaDesdeNombre(f.name, app.vocab) : sel.value;
        if (!label) { addLog(`✗ ${f.name}: no se reconoce la seña por el nombre; se omite.`); continue; }
        setMsg(`Video ${i + 1} de ${archivos.length}: ${f.name} → ${app.nombreDe(label)}`);
        try {
          const r = await extractor.leer(f, (p) => { barra.style.width = `${((i + p) / archivos.length) * 100}%`; });
          if (r.conCuerpo < 0.5) addLog(`! ${f.name}: solo en ${(r.conCuerpo * 100).toFixed(0)} % de los fotogramas se vieron los hombros; el resultado puede ser pobre.`);
          const { muestras, avisos } = construirMuestras(r.frames, r.manos, { label, signer, grupo: `${signer}:${f.name}`, ...opciones });
          avisos.forEach((a) => addLog(`! ${f.name}: ${a}`));
          if (!muestras.length) { addLog(`✗ ${f.name}: no se generaron muestras.`); continue; }
          await db.addMany(muestras);
          const reposo = muestras.filter((m) => m.label === REPOSO && label !== REPOSO).length;
          addLog(`✓ ${f.name}: ${muestras.length - reposo} muestras de «${app.nombreDe(label)}»${reposo ? ` + ${reposo} de reposo` : ''}`);
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
  construirSelector();
}
