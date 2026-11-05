// Interpreta la ORACIÓN COMPLETA (no cada seña suelta) y decide qué información del SAE mostrar.
// Lógica pura, sin navegador. Se usa cuando la frase se cierra (pausa o botón «Listo»).
//
// Ejemplos:
//   ['matricula']                         -> tema: matrícula
//   ['hola', 'matricula', 'por_favor']    -> tema: matrícula  (hola y por favor son cortesía, no tema)
//   ['cuando', 'matricula']               -> tema: matrícula, pregunta: cuándo (se resalta el horario)
//   ['hola']                              -> cortesía: saludo
//   ['ayuda']                             -> ayuda
//   ['matricula', 'pension']              -> tema principal: matrícula, otros: pensión

// Qué dato de la tarjeta conviene resaltar según la palabra interrogativa.
export const CAMPO_POR_PREGUNTA = {
  que: 'resumen', donde: 'lugar', cuando: 'horario', cuanto: null, como: 'pasos', quien: 'contacto',
};

/**
 * @param {string[]} ids   señas confirmadas, en el orden en que se hicieron
 * @param {{senas:Array<{id:string,categoria:string}>}} vocab
 * @param {object} reglas  contenido de data/frases.json
 * @returns {{tipo:'tema'|'ayuda'|'pregunta'|'contexto'|'cortesia'|'vacio', principal:string|null,
 *            otros:string[], pregunta:string|null, cortesia:string[], ids:string[]}}
 */
export function interpretarConsulta(ids, vocab, reglas = {}) {
  const senas = new Map(vocab.senas.map((s) => [s.id, s]));
  const unicos = [...new Set(ids)].filter((id) => senas.has(id));

  const esPregunta = (id) => Boolean(reglas.preguntas?.[id]) || senas.get(id).categoria === 'preguntas';
  const esCortesia = (id) => Boolean(reglas.inicio?.[id] || reglas.final?.[id]);
  const esAyuda = (id) => id === 'ayuda';
  const esContexto = (id) => Boolean(reglas.contexto?.[id]);   // yo, estudiante, problema…: acompañan, no son un tema

  const cortesia = unicos.filter(esCortesia);
  const preguntas = unicos.filter((id) => esPregunta(id) && !esCortesia(id));
  const contexto = unicos.filter((id) => esContexto(id) && !esCortesia(id) && !esPregunta(id));
  const temas = unicos.filter((id) => !esCortesia(id) && !esPregunta(id) && !esAyuda(id) && !esContexto(id));
  const base = { otros: [], pregunta: preguntas[0] || null, cortesia, ids: unicos };

  if (temas.length) return { ...base, tipo: 'tema', principal: temas[0], otros: temas.slice(1) };
  if (unicos.includes('ayuda')) return { ...base, tipo: 'ayuda', principal: 'ayuda' };
  if (preguntas.length) return { ...base, tipo: 'pregunta', principal: preguntas[0] };
  if (contexto.length) {
    // «yo» solo acompaña (junto = ''): se prefiere la otra palabra de contexto, p. ej. «estudiante».
    const fuerte = contexto.find((id) => reglas.contexto[id].junto !== '');
    return { ...base, tipo: 'contexto', principal: fuerte || contexto[0] };
  }
  if (cortesia.length) {
    // Un saludo manda sobre una despedida; si solo hay cierres, se responde al último («gracias», «adiós»).
    const saludo = cortesia.find((id) => reglas.inicio?.[id]);
    return { ...base, tipo: 'cortesia', principal: saludo || cortesia[cortesia.length - 1] };
  }
  return { ...base, tipo: 'vacio', principal: null };
}
