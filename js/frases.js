// Convierte la lista de señas reconocidas en una oración en español (subtítulo y voz).
// Lógica pura, sin navegador. Las reglas están en data/frases.json (editable sin tocar código).
//
// Orden de resolución:
//   1) saludos / «sí» / «no» al inicio; «por favor», «gracias», «adiós» al final;
//   2) plantilla explícita que coincida (la que use más señas, en cualquier orden);
//   3) pregunta + tema(s), «ayuda» + tema(s) o «necesito información sobre» + tema(s).

const unir = (nombres) => (nombres.length < 2 ? nombres[0] || '' : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`);

/**
 * @param {string[]} ids   señas confirmadas, en el orden en que se hicieron
 * @param {{senas:Array<{id:string,nombre:string,categoria:string}>}} vocab
 * @param {object} reglas  contenido de data/frases.json
 * @returns {string}
 */
export function componerFrase(ids, vocab, reglas = {}) {
  const senas = new Map(vocab.senas.map((s) => [s.id, s]));
  const unicos = [...new Set(ids)].filter((id) => senas.has(id));
  if (!unicos.length) return '';

  const sust = reglas.sustantivos || {};
  const nombre = (id) => sust[id] || senas.get(id).nombre.toLowerCase();
  const rellenar = (plantilla, ids2) => plantilla.replace('{tema}', unir(ids2.map(nombre)));
  const usados = new Set();
  const inicio = [], medio = [], final = [];

  // 1) cortesía
  for (const id of unicos) {
    if (reglas.inicio?.[id]) { inicio.push(reglas.inicio[id]); usados.add(id); }
    else if (reglas.final?.[id]) { final.push(reglas.final[id]); usados.add(id); }
  }

  // 2) plantilla explícita más específica
  const restantes = () => unicos.filter((id) => !usados.has(id));
  const candidatas = (reglas.plantillas || [])
    .filter((p) => p.senas?.length && p.senas.every((id) => restantes().includes(id)))
    .sort((a, b) => b.senas.length - a.senas.length);
  if (candidatas.length) {
    medio.push(candidatas[0].texto);
    candidatas[0].senas.forEach((id) => usados.add(id));
  }

  // 3) reglas generales con lo que quede
  const resto = restantes();
  const preguntas = resto.filter((id) => reglas.preguntas?.[id]);
  const hayAyuda = resto.includes('ayuda') && reglas.ayuda;
  const temas = resto.filter((id) => !reglas.preguntas?.[id] && id !== 'ayuda');
  const todosLugares = temas.length > 0 && temas.every((id) => senas.get(id).categoria === 'lugares');

  for (const q of preguntas) {
    const r = reglas.preguntas[q];
    if (temas.length) medio.push(rellenar(todosLugares && r.con_lugar ? r.con_lugar : r.con_tema, temas));
    else medio.push(r.solo);
  }
  if (hayAyuda) medio.push(temas.length && !preguntas.length ? rellenar(reglas.ayuda.con_tema, temas) : reglas.ayuda.solo);
  else if (!preguntas.length && temas.length && reglas.sinPregunta) medio.push(rellenar(reglas.sinPregunta, temas));
  else if (!preguntas.length && !hayAyuda && temas.length) medio.push(`${unir(temas.map(nombre))}.`.replace(/^./, (c) => c.toUpperCase()));

  return [...inicio, ...medio, ...final].join(' ').trim();
}
