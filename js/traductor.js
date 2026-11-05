// Vista "Traductor": reconoce señas con la cámara y muestra la información del SAE.

import { SEQ_LEN, REPOSO } from './config.js';
import { flattenSequence } from './features.js';
import { componerFrase } from './frases.js';
import { interpretarConsulta, CAMPO_POR_PREGUNTA } from './intencion.js';
import { Voz } from './voz.js';

const $ = (s) => document.querySelector(s);

export function initTraductor(app) {
  let buffer = [], manos = [], votos = [], tick = 0;
  let ultimo = { id: null, t: 0 };
  const fichas = $('#fichas');
  const voz = new Voz();

  // ---------- subtítulos + voz ----------
  // Cada seña confirmada se suma a la frase en curso. Pasada la pausa elegida sin nuevas señas, la
  // frase se cierra: se muestra la oración final y se lee en voz alta EXACTAMENTE ese mismo texto.
  let frase = [], tFrase = null, ultimaFrase = '', palabras = [];
  const subFrase = $('#subFrase');

  function mostrarFrase(texto, estado) {                       // estado: 'vacio' | 'provisional' | 'final'
    subFrase.replaceChildren(); palabras = [];
    subFrase.className = `sub-frase ${estado === 'final' ? '' : estado}`.trim();
    let pos = 0;
    for (const trozo of texto.split(/(\s+)/)) {
      if (!trozo) continue;
      if (/^\s+$/.test(trozo)) subFrase.appendChild(document.createTextNode(trozo));
      else { const sp = document.createElement('span'); sp.textContent = trozo; subFrase.appendChild(sp); palabras.push({ ini: pos, fin: pos + trozo.length, el: sp }); }
      pos += trozo.length;
    }
  }
  function resaltar(charIndex) {
    palabras.forEach((p) => p.el.classList.toggle('hablando', charIndex >= p.ini && charIndex < p.fin));
  }
  const quitarResalte = () => palabras.forEach((p) => p.el.classList.remove('hablando'));

  function sumarASubtitulo(id) {
    voz.cancelar();                                            // una seña nueva interrumpe la lectura anterior
    frase.push(id);
    $('#subGlosas').textContent = frase.map((i) => app.nombreDe(i).toUpperCase()).join(' · ');
    mostrarFrase(componerFrase(frase, app.vocab, app.frases), 'provisional');
    clearTimeout(tFrase);
    tFrase = setTimeout(cerrarFrase, Number($('#pausa').value) * 1000);
  }
  function cerrarFrase() {
    clearTimeout(tFrase);
    if (!frase.length) return;
    const ids = frase;
    const texto = componerFrase(ids, app.vocab, app.frases);
    frase = [];
    if (!texto) return;
    ultimaFrase = texto;
    mostrarFrase(texto, 'final');
    responderOracion(ids, texto);                              // la información sale DESPUÉS de completar la oración
    voz.decir(texto, { onPalabra: resaltar, onFin: quitarResalte });
    programarReinicio();
  }
  $('#vozOn').addEventListener('change', (e) => { voz.activa = e.target.checked; if (!voz.activa) voz.cancelar(); });
  $('#btnRepetir').addEventListener('click', () => { if (ultimaFrase) voz.decir(ultimaFrase, { forzar: true, onPalabra: resaltar, onFin: quitarResalte }); });
  $('#pausa').addEventListener('input', (e) => { $('#pausaOut').textContent = `${e.target.value} s`; });
  if (!voz.disponible) { $('#vozOn').checked = false; $('#vozOn').disabled = true; $('#btnRepetir').hidden = true; }

  // ---------- respuesta del SAE ----------
  // Se decide con la oración completa: «hola, matrícula, por favor» responde sobre la matrícula,
  // no sobre la última seña. La cortesía (hola, gracias, por favor…) solo cuenta si es lo único dicho.
  let textoVoz = '';
  const CAMPOS = { resumen: '#rResumen', pasos: '#rPasos', lugar: '#rLugar', horario: '#rHorario', contacto: '#rContacto' };

  function responderOracion(ids, texto) {
    const c = interpretarConsulta(ids, app.vocab, app.frases);
    if (!c.principal) return;
    mostrarRespuesta(c.principal, { oracion: texto, pregunta: c.pregunta, otros: c.otros });
  }

  function mostrarRespuesta(id, ctx = {}) {
    const e = app.respuestas[id] || {
      titulo: app.nombreDe(id), verificado: false,
      resumen: 'Todavía no hay información cargada para esta seña. Se puede agregar en data/respuestas.json.',
    };
    $('#rTitulo').textContent = e.titulo;
    $('#rConsulta').textContent = ctx.oracion ? `Entendí: ${ctx.oracion}` : '';
    $('#rConsulta').hidden = !ctx.oracion;
    const directa = ctx.pregunta && e.por_pregunta?.[ctx.pregunta];   // respuesta puntual opcional (respuestas.json)
    $('#rDirecta').textContent = directa || ''; $('#rDirecta').hidden = !directa;
    $('#rResumen').textContent = e.resumen || '';
    const ol = $('#rPasos'); ol.replaceChildren();
    (e.pasos || []).forEach((p) => { const li = document.createElement('li'); li.textContent = p; ol.appendChild(li); });
    ol.hidden = !(e.pasos || []).length;
    const filas = [['#rLugar', e.lugar], ['#rHorario', e.horario], ['#rContacto', e.contacto]];
    filas.forEach(([sel, v]) => { $(sel).textContent = v || ''; $(sel).parentElement.hidden = !v; });
    document.querySelector('.datos-r').hidden = !filas.some(([, v]) => v);
    $('#rPendiente').hidden = e.verificado !== false;
    // Resalta el dato que responde a la pregunta (¿dónde? → lugar, ¿cuándo? → horario…).
    const campo = ctx.pregunta ? CAMPO_POR_PREGUNTA[ctx.pregunta] : null;
    Object.entries(CAMPOS).forEach(([k, sel]) => {
      const el = $(sel), fila = (k === 'resumen' || k === 'pasos') ? el : el.parentElement;
      fila.classList.toggle('destacado', k === campo);
    });
    // Otros temas que se mencionaron en la misma oración: botones para verlos.
    const otros = $('#rOtros'); otros.replaceChildren();
    (ctx.otros || []).forEach((oid) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tema'; b.textContent = app.nombreDe(oid);
      const resto = [id, ...(ctx.otros || []).filter((x) => x !== oid)];
      b.addEventListener('click', () => mostrarRespuesta(oid, { ...ctx, otros: resto, pregunta: ctx.pregunta }));
      otros.appendChild(b);
    });
    $('#rOtrosWrap').hidden = !(ctx.otros || []).length;
    const r = $('#respuesta'); r.hidden = false;
    textoVoz = [e.titulo, directa, e.resumen, ...(e.pasos || [])].filter(Boolean).join('. ');
    if (window.matchMedia('(max-width: 900px)').matches) r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function agregarFicha(id) {
    fichas.querySelector('.vacio')?.remove();
    const li = document.createElement('li');
    li.textContent = app.nombreDe(id);
    fichas.appendChild(li);
    while (fichas.children.length > 8) fichas.firstElementChild.remove();
  }

  // Kiosco: tras 60 s sin actividad se borra la conversación para la siguiente persona.
  let temporizador = null;
  function programarReinicio() {
    clearTimeout(temporizador);
    temporizador = setTimeout(limpiar, 60000);
  }

  // Una seña de la cámara solo se suma a la oración en curso; la información aparece al cerrarla.
  function confirmar(id) {
    agregarFicha(id);
    sumarASubtitulo(id);
    programarReinicio();
  }
  // Un toque en «Temas frecuentes» se comporta igual que una seña: se suma a la oración y la información
  // aparece al completarla (pausa o botón «Listo»). Así se pueden combinar toques: Hola + Matrícula + Por favor.
  const confirmarToque = confirmar;
  $('#btnListo').addEventListener('click', cerrarFrase);       // terminar la oración sin esperar la pausa

  function limpiar() {
    clearTimeout(temporizador);
    voz.cancelar(); clearTimeout(tFrase); frase = []; ultimaFrase = '';
    $('#subGlosas').textContent = ''; mostrarFrase('Los subtítulos aparecerán aquí.', 'vacio');
    fichas.replaceChildren();
    const li = document.createElement('li'); li.className = 'vacio'; li.textContent = 'Aún no hay señas detectadas.';
    fichas.appendChild(li);
    $('#respuesta').hidden = true; ultimo = { id: null, t: 0 };
  }
  $('#btnLimpiar').addEventListener('click', limpiar);
  $('#btnVoz').addEventListener('click', () => {
    if (!textoVoz) return;
    voz.decir(textoVoz, { forzar: true });
  });

  // ---------- indicadores ----------
  const out = $('#umbralOut'), umbral = $('#umbral');
  umbral.addEventListener('input', () => { out.textContent = `${umbral.value} %`; });
  function mostrarVivo(id, p) {
    const el = $('#senaActual');
    el.textContent = id ? app.nombreDe(id) : '—';
    el.classList.toggle('vacio', !id);
    $('#confBar').style.width = `${Math.round(p * 100)}%`;
    $('#confWrap').setAttribute('aria-valuenow', Math.round(p * 100));
  }

  // ---------- reconocimiento ----------
  function onSample(f, info) {
    buffer.push(f); manos.push(info.left || info.right);
    if (buffer.length > SEQ_LEN) { buffer.shift(); manos.shift(); }
    if (!app.recognizer || buffer.length < SEQ_LEN) return;
    if (++tick % 3) return;                                  // evalúa ~5 veces por segundo

    const activo = manos.filter(Boolean).length / SEQ_LEN;
    if (activo < 0.25) { mostrarVivo(null, 0); votos = []; return; } // casi sin manos a la vista

    const probs = app.recognizer.predict(flattenSequence(buffer));
    let b = 0; for (let i = 1; i < probs.length; i++) if (probs[i] > probs[b]) b = i;
    const id = app.recognizer.labels[b], p = probs[b];
    if (id === REPOSO || p < Number(umbral.value) / 100) { mostrarVivo(null, p); votos = []; return; }

    mostrarVivo(id, p);
    votos.push(id); if (votos.length > 3) votos.shift();
    const estable = votos.length === 3 && votos.every((v) => v === id);
    const enfriado = id !== ultimo.id || performance.now() - ultimo.t > 2500;
    if (estable && enfriado) {
      ultimo = { id, t: performance.now() };
      buffer = []; manos = []; votos = [];                   // evita detectar dos veces la misma seña
      confirmar(id);
    }
  }

  app.vistaListeners.push((v) => {
    if (v === 'traductor') { app.onSample = onSample; buffer = []; manos = []; votos = []; }
  });
  app.onSample = onSample;

  // ---------- temas frecuentes (acceso táctil) ----------
  const cont = $('#temas');
  for (const cat of app.vocab.categorias) {
    if (cat.id === 'preguntas') continue;
    const senas = app.vocab.senas.filter((s) => s.categoria === cat.id);
    if (!senas.length) continue;
    const g = document.createElement('div'); g.className = 'grupo';
    const h = document.createElement('h3'); h.textContent = cat.nombre;
    const fila = document.createElement('div');
    senas.forEach((s) => {
      const b = document.createElement('button'); b.className = 'tema'; b.type = 'button'; b.textContent = s.nombre;
      b.addEventListener('click', () => confirmarToque(s.id));
      fila.appendChild(b);
    });
    g.append(h, fila); cont.appendChild(g);
  }
}
