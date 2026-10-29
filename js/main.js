// Módulo de USUARIO (index.html): solo traducción y consulta. Sin datos ni entrenamiento.

import { createApp, loadContent, loadModel, setupCamera } from './app.js';
import { initTraductor } from './traductor.js';

const $ = (s) => document.querySelector(s);

async function boot() {
  const app = createApp();
  window.app = app;
  setupCamera(app);

  // El enlace a administración solo aparece al abrir el sitio en esta misma computadora
  // (localhost). En el sitio publicado no existe admin.html.
  if (['localhost', '127.0.0.1', ''].includes(location.hostname)) $('#linkAdmin').hidden = false;

  $('#btnPantalla').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });

  try {
    await loadContent(app);
  } catch (e) {
    $('#avisoModelo').textContent = `No se pudieron leer los datos (${e.message}). Abre el sitio desde un servidor (ver docs/INSTRUCCIONES.md), no con doble clic.`;
    $('#avisoModelo').className = 'aviso';
    return;
  }
  initTraductor(app);
  app.setVista('traductor');
  await loadModel(app);
}

boot();
