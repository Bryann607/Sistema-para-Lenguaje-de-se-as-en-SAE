// Voz del módulo: lee en voz alta el mismo texto que se muestra como subtítulo.
// Usa la síntesis de voz del navegador (Web Speech API): no necesita internet, clave ni plugin.

const PREFERIDAS = ['es-pe', 'es-419', 'es-mx', 'es-us', 'es-co', 'es-cl', 'es-ar', 'es-es'];

export class Voz {
  constructor() {
    this.disponible = 'speechSynthesis' in window;
    this.activa = true;
    this.voz = null;
    if (this.disponible) {
      this._elegir();
      speechSynthesis.addEventListener?.('voiceschanged', () => this._elegir());   // Chrome las carga tarde
    }
  }

  _elegir() {
    const voces = speechSynthesis.getVoices();
    const lang = (v) => (v.lang || '').replace('_', '-').toLowerCase();
    this.voz = null;
    for (const l of PREFERIDAS) { const v = voces.find((x) => lang(x) === l); if (v) { this.voz = v; break; } }
    this.voz ||= voces.find((x) => lang(x).startsWith('es')) || null;
  }

  get descripcion() { return this.voz ? `${this.voz.name} (${this.voz.lang})` : 'voz predeterminada del equipo'; }

  /**
   * @param {string} texto
   * @param {{forzar?:boolean, onPalabra?:(charIndex:number)=>void, onFin?:()=>void}} op
   *   forzar: habla aunque la voz esté desactivada (botones «Repetir» / «Leer en voz alta»).
   *   onPalabra: avisa qué carácter se está leyendo (no todas las voces lo informan).
   */
  decir(texto, { forzar = false, onPalabra, onFin } = {}) {
    if (!this.disponible || !texto || !(this.activa || forzar)) { onFin?.(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = this.voz?.lang || 'es-PE';
    if (this.voz) u.voice = this.voz;
    u.rate = 0.95;
    u.onboundary = (e) => { if (e.name === undefined || e.name === 'word') onPalabra?.(e.charIndex); };
    u.onend = () => onFin?.();
    u.onerror = () => onFin?.();
    speechSynthesis.speak(u);
  }

  cancelar() { if (this.disponible) speechSynthesis.cancel(); }
}
