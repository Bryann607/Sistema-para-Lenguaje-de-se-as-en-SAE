// Núcleo compartido por el módulo de usuario (index.html) y el de administrador (admin.html):
// estado de la aplicación, cámara, carga de contenido y del modelo.
// Aquí NO hay nada de grabación ni entrenamiento.

import { Vision } from './vision.js';
import { loadBestModel, Recognizer } from './model.js';
import { REPOSO } from './config.js';

const $ = (s) => document.querySelector(s);

export function createApp() {
  const app = {
    vista: 'traductor',
    vision: null,
    vocab: { categorias: [], senas: [] },
    respuestas: {},
    model: null,          // { model, labels, origen }
    recognizer: null,
    cameraOn: false,
    cameraListeners: [],
    vistaListeners: [],
    onSample: null,       // lo asigna la vista activa
    nombreDe(id) {
      if (id === REPOSO) return 'Reposo';
      return this.vocab.senas.find((s) => s.id === id)?.nombre || id;
    },
    setVista(v) {
      this.vista = v;
      document.body.dataset.vista = v;
      document.querySelectorAll('.tab').forEach((t) => {
        if (t.dataset.vista === v) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
      });
      this.vistaListeners.forEach((f) => f(v));
    },
    setModel(model, labels, origen) {
      if (this.model?.model && this.model.model !== model) { try { this.model.model.dispose(); } catch { /* ya liberado */ } }
      this.model = { model, labels, origen };
      this.recognizer = new Recognizer(model, labels);
      this.refreshBanner();
    },
    refreshBanner() {
      const aviso = $('#avisoModelo'), pie = $('#pieModelo');
      if (aviso) aviso.className = 'aviso';
      const say = (txt, ok) => { if (aviso) { aviso.textContent = txt; if (ok) aviso.classList.add('ok'); } };
      if (!window.tf) {
        say('No se pudo cargar TensorFlow.js. Revisa tu conexión a internet y recarga la página.');
        if (pie) pie.textContent = 'Modelo: no disponible';
      } else if (!this.model) {
        say('Aún no hay un modelo de reconocimiento. Puedes elegir tu tema más abajo.');
        if (pie) pie.textContent = 'Modelo: sin entrenar';
      } else {
        const n = this.model.labels.filter((l) => l !== REPOSO).length;
        say(`Reconocimiento activo: ${n} señas.`, true);
        if (pie) pie.textContent = `Modelo: ${n} señas · ${this.model.origen}`;
      }
    },
  };
  return app;
}

export async function loadJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

export async function loadContent(app) {
  [app.vocab, app.respuestas] = await Promise.all([loadJson('data/vocabulario.json'), loadJson('data/respuestas.json')]);
}

export async function loadModel(app) {
  if (window.tf) {
    try {
      const loaded = await loadBestModel();
      if (loaded) app.setModel(loaded.model, loaded.labels, loaded.origen);
    } catch (e) { console.warn('No se pudo cargar el modelo', e); }
  }
  app.refreshBanner();
}

export function setupCamera(app) {
  const btn = $('#btnCamara'), estado = $('#estadoCamara'), stage = document.querySelector('.escudo-in');
  const vision = new Vision($('#video'), $('#overlay'));
  app.vision = vision;
  vision.onSample = (f, info) => app.onSample?.(f, info);
  vision.onFrame = (info, fps) => {
    $('#chipManos').textContent = `Manos: ${(info.left ? 1 : 0) + (info.right ? 1 : 0)}`;
    $('#chipFps').textContent = `${fps} fps`;
  };
  const notify = () => app.cameraListeners.forEach((f) => f(app.cameraOn));

  btn.addEventListener('click', async () => {
    if (app.cameraOn) {
      vision.stop(); app.cameraOn = false;
      stage.classList.remove('activo'); $('#chips').hidden = true;
      btn.textContent = 'Activar cámara'; estado.textContent = 'Cámara apagada';
      notify(); return;
    }
    btn.disabled = true;
    try {
      estado.textContent = 'Cargando el detector de manos… (la primera vez tarda unos segundos)';
      await vision.init();
      estado.textContent = 'Solicitando permiso de cámara…';
      await vision.startCamera();
      app.cameraOn = true;
      stage.classList.add('activo'); $('#chips').hidden = false;
      btn.textContent = 'Apagar cámara';
      estado.textContent = 'Cámara activa';
      notify();
    } catch (e) {
      console.error(e);
      const permiso = e?.name === 'NotAllowedError';
      estado.textContent = permiso ? 'Permiso de cámara denegado. Habilítalo en la barra del navegador y vuelve a intentar.'
        : (e?.name === 'NotFoundError' ? 'No se encontró ninguna cámara.' : `No se pudo iniciar: ${e.message || e}. Verifica tu conexión a internet.`);
    } finally { btn.disabled = false; }
  });
}
