// Vista "Entrenamiento": entrena el modelo en el navegador con las muestras guardadas.

import { REPOSO } from './config.js';
import { db } from './db.js';
import { trainModel, downloadModelFiles } from './model.js';
import { loadRepoDatasets, downloadBlob } from './dataset.js';
import { descargarDatasets } from './nube.js';

const $ = (s) => document.querySelector(s);

export function initEntrenar(app) {
  let handle = null, ultimo = null, entrenando = false;
  const msg = $('#trainMsg'), log = $('#trainLog');
  const setMsg = (t, tipo = '') => { msg.textContent = t; msg.className = `msg ${tipo}`; };
  const addLog = (t) => { log.hidden = false; log.textContent += `${t}\n`; log.scrollTop = log.scrollHeight; };
  const pct = (v) => (v == null || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(0)} %`);

  async function resumen() {
    const c = await db.counts();
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    const senas = Object.keys(c).filter((k) => k !== REPOSO).length;
    let t = `${total} muestras locales de ${senas} señas.`;
    if (!c[REPOSO]) t += ' Falta grabar la clase «Reposo»: sin ella el modelo detectará señas aunque nadie las haga.';
    if (!window.tf) t = 'No se cargó TensorFlow.js: revisa tu conexión a internet y recarga.';
    $('#resumenDs').textContent = t;
  }

  $('#btnEntrenar').addEventListener('click', async () => {
    if (entrenando) return;
    if (!window.tf) return setMsg('TensorFlow.js no está disponible. Revisa tu conexión a internet.', 'error');
    entrenando = true;
    $('#btnEntrenar').disabled = true; $('#btnParar').hidden = false; $('#resultados').hidden = true;
    log.textContent = ''; $('#trainWrap').hidden = false; $('#trainBar').style.width = '0';
    try {
      setMsg('Preparando datos…');
      let muestras = await db.all();
      if ($('#optRepo').checked) {
        try { muestras = muestras.concat(await loadRepoDatasets(addLog)); }
        catch (e) { addLog(`No se pudieron leer los datasets del repositorio: ${e.message}`); }
      }
      if ($('#optNube').checked && !$('#optNube').disabled) {
        try { muestras = muestras.concat(await descargarDatasets(addLog)); }
        catch (e) { addLog(`No se pudieron leer los datasets de la nube: ${e.message}`); }
      }
      const vistos = new Set(), antes = muestras.length;
      muestras = muestras.filter((m) => {            // mismo señante + fecha + seña = misma muestra
        if (!m.ts) return true;
        const k = `${m.signer}|${m.ts}|${m.label}`;
        if (vistos.has(k)) return false;
        vistos.add(k); return true;
      });
      if (muestras.length < antes) addLog(`Se descartaron ${antes - muestras.length} muestras repetidas.`);
      if (!muestras.length) throw new Error('No hay muestras. Graba señas en la pestaña «Datos» o importa un dataset.');
      addLog(`Muestras totales: ${muestras.length} · backend: ${tf.getBackend()}`);
      setMsg('Entrenando… no cierres esta pestaña.');
      const out = await trainModel(muestras, {
        arch: $('#optArch').value,
        epochs: Number($('#optEpocas').value) || 40,
        augment: Number($('#optAug').value) || 1,
        minPerClass: Number($('#optMin').value) || 6,
        onLog: addLog,
        onHandle: (h) => { handle = h; },
        onEpoch: (e, total, l) => {
          $('#trainBar').style.width = `${(e / total) * 100}%`;
          setMsg(`Época ${e} de ${total} · acierto en validación: ${pct(l.valAcc)}`);
          addLog(`época ${e}/${total}  pérdida ${l.loss.toFixed(3)}  acierto ${pct(l.acc)}  val. ${pct(l.valAcc)}`);
        },
      });
      ultimo = out;
      app.ultimoEntrenamiento = out;          // lo usa «Publicar modelo en la nube»
      app.setModel(out.model, out.labels, 'entrenado en este navegador');
      const evaluadas = out.perClass.filter((c) => c.n);
      const total = evaluadas.reduce((a, c) => a + c.n, 0);
      const ok = evaluadas.reduce((a, c) => a + c.acc * c.n, 0);
      $('#resGlobal').textContent = `Acierto global en validación: ${pct(total ? ok / total : null)}. El modelo ya está activo en la pestaña Traductor.`;
      const tb = $('#resTabla'); tb.replaceChildren();
      out.perClass.forEach((c) => {
        const tr = document.createElement('tr');
        [app.nombreDe(c.label), c.n, pct(c.acc)].forEach((v, i) => {
          const td = document.createElement('td'); td.textContent = v;
          if (i === 2 && c.acc != null && c.acc < 0.7) td.className = 'bajo';
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      $('#resultados').hidden = false;
      setMsg('Entrenamiento terminado.', 'ok');
    } catch (e) {
      console.error(e); setMsg(e.message || String(e), 'error');
    } finally {
      entrenando = false; handle = null;
      $('#btnEntrenar').disabled = false; $('#btnParar').hidden = true;
    }
  });
  $('#btnParar').addEventListener('click', () => { handle?.stop(); setMsg('Deteniendo al final de esta época…'); });
  $('#btnDescargar').addEventListener('click', () => {
    if (ultimo) downloadModelFiles(ultimo.model, ultimo.labels, downloadBlob);
  });

  app.vistaListeners.push((v) => { if (v === 'entrenar') { app.onSample = null; resumen(); } });
  resumen();
}
