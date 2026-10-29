// Acceso de administrador (contraseña local).
//
// IMPORTANTE: GitHub Pages es un sitio estático, no tiene servidor. Esta contraseña
// evita que alguien manipule los datos "por accidente" en el equipo donde se administra,
// pero no es seguridad real frente a una persona con conocimientos técnicos.
// La protección real es que admin.html NO se publica en GitHub Pages (ver pages.yml):
// el entrenamiento se hace solo en tu laptop.

const KEY = 'lsp-admin';
const SESION = 'lsp-admin-sesion';
const FALLOS = 'lsp-admin-fallos';
const ITER = 150000;
const MAX_FALLOS = 5, BLOQUEO_MS = 60000;
const enc = new TextEncoder();

const toHex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

async function derivar(clave, saltHex, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex), iterations: iter, hash: 'SHA-256' }, base, 256);
  return toHex(bits);
}

export const auth = {
  disponible: () => !!(window.crypto && crypto.subtle),
  existe: () => !!localStorage.getItem(KEY),
  sesion: () => sessionStorage.getItem(SESION) === '1',
  cerrar: () => sessionStorage.removeItem(SESION),

  async crear(clave) {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derivar(clave, salt, ITER);
    localStorage.setItem(KEY, JSON.stringify({ salt, iter: ITER, hash }));
    localStorage.removeItem(FALLOS);
    sessionStorage.setItem(SESION, '1');
  },

  /** Segundos que faltan para poder reintentar (0 si no hay bloqueo). */
  espera() {
    const f = JSON.parse(localStorage.getItem(FALLOS) || '{"n":0,"hasta":0}');
    return Math.max(0, Math.ceil((f.hasta - Date.now()) / 1000));
  },

  async verificar(clave) {
    if (this.espera() > 0) return false;
    const reg = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!reg) return false;
    const ok = (await derivar(clave, reg.salt, reg.iter)) === reg.hash;
    if (ok) { localStorage.removeItem(FALLOS); sessionStorage.setItem(SESION, '1'); return true; }
    const f = JSON.parse(localStorage.getItem(FALLOS) || '{"n":0,"hasta":0}');
    f.n += 1;
    if (f.n >= MAX_FALLOS) { f.hasta = Date.now() + BLOQUEO_MS; f.n = 0; }
    localStorage.setItem(FALLOS, JSON.stringify(f));
    return false;
  },
};
