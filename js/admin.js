// Módulo de ADMINISTRADOR (admin.html): recolección de datos y entrenamiento.
// Los módulos de datos y entrenamiento se cargan SOLO después de iniciar sesión.

import { createApp, loadContent, loadModel, setupCamera } from './app.js';
import { auth } from './auth.js';

const $ = (s) => document.querySelector(s);

// ---------- puerta de acceso ----------
function mostrarPuerta() {
  const crear = !auth.existe();
  $('#gateTitulo').textContent = crear ? 'Crea la contraseña de administrador' : 'Acceso de administrador';
  $('#gateAyuda').textContent = crear
    ? 'Es la primera vez en este equipo. Elige una contraseña de al menos 6 caracteres; la necesitarás para grabar datos y entrenar.'
    : 'Ingresa tu contraseña para grabar datos y entrenar el modelo.';
  $('#gateRepetir').hidden = !crear;
  $('#gateBtn').textContent = crear ? 'Crear contraseña' : 'Ingresar';
  $('#gate').hidden = false; $('#panelAdmin').hidden = true;
  $('#gateClave').focus();

  const form = $('#gateForm');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#gateMsg'), clave = $('#gateClave').value;
    msg.className = 'msg error';
    if (!auth.disponible()) { msg.textContent = 'Este navegador no permite el cifrado necesario. Abre el sitio desde localhost o https.'; return; }
    if (crear) {
      if (clave.length < 6) { msg.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
      if (clave !== $('#gateClave2').value) { msg.textContent = 'Las contraseñas no coinciden.'; return; }
      await auth.crear(clave);
    } else {
      const espera = auth.espera();
      if (espera > 0) { msg.textContent = `Demasiados intentos. Espera ${espera} s.`; return; }
      if (!(await auth.verificar(clave))) {
        const e = auth.espera();
        msg.textContent = e > 0 ? `Contraseña incorrecta. Espera ${e} s para volver a intentar.` : 'Contraseña incorrecta.';
        $('#gateClave').select(); return;
      }
    }
    form.reset(); msg.textContent = '';
    iniciarPanel();
  };
}

// ---------- panel ----------
let iniciado = false;
async function iniciarPanel() {
  $('#gate').hidden = true; $('#panelAdmin').hidden = false;
  if (iniciado) return;
  iniciado = true;

  const app = createApp();
  window.app = app;
  app.vista = 'datos';
  setupCamera(app);
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => app.setVista(t.dataset.vista)));
  $('#btnSalir').addEventListener('click', () => { auth.cerrar(); location.reload(); });

  try { await loadContent(app); }
  catch (e) { $('#gateMsg').textContent = `No se pudieron leer los datos (${e.message}).`; return; }

  const [{ initDatos }, { initEntrenar }] = await Promise.all([import('./datos.js'), import('./entrenar.js')]);
  initDatos(app);
  initEntrenar(app);
  app.setVista('datos');
  await loadModel(app);
}

if (auth.sesion()) iniciarPanel(); else mostrarPuerta();
