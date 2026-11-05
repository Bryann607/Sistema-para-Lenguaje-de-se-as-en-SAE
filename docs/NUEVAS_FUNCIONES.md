# Nuevas funciones: videos, subtítulos y voz

## 1. Importar videos para entrenar (admin.html → Datos → «Importar videos de señas»)

Convierte videos de LSP en muestras de 30 fotogramas, con el mismo detector y las mismas características que
usa la cámara. **No se guarda el video**, solo coordenadas.

**Cómo usarlo**
1. Reúne los videos (MP4/WebM). Lo ideal: un video por seña, hombros y manos visibles.
2. Nómbralos con el id de la seña: `matricula_01.mp4`, `por_favor_2.mp4`, `reposo_1.mp4`
   (los ids están en `data/vocabulario.json`; se ignoran tildes y mayúsculas).
   También puedes elegir una seña fija en la lista y subir todos los videos de esa seña.
3. Pon un identificador de fuente (`V01`, `V02`…; usa uno distinto por cada origen o persona del video).
4. **Elegir videos…** y espera. El avance y los avisos aparecen en el cuadro oscuro.
5. Revisa el avance, entrena y exporta como siempre.

**Qué hace con cada video**
- Detecta el tramo con manos visibles y lo recorta.
- Genera varias muestras: 3 velocidades (0,8× · 1× · 1,25×) × hasta 4 posiciones dentro de los 2 s.
- **Versión en espejo** (opcional): simula a una persona zurda.
- Los tramos de 2 s sin manos se guardan como «Reposo» (opcional).

**Importante**
- Un video = **una sola fuente independiente**, aunque genere 20 muestras. El avance lo cuenta así.
- El entrenamiento ahora separa la validación **por video/fuente**, para que el porcentaje de acierto no
  salga inflado. El registro avisa si una seña tiene menos de 3 fuentes.
- Un modelo entrenado con pocos videos de una sola persona **no funcionará bien en la cámara del SAE**.
  Combínalos con grabaciones propias (aunque sean pocas) y haz la prueba con personas nuevas (GUIA_DE_DATOS, Fase 3).
- Usa solo videos que tengas permiso de usar y cita la fuente en el informe. Verifica que la seña del video
  sea la que se usa en el SAE (el vocabulario administrativo, como «matrícula», puede no estar en diccionarios generales).

## 1b. Aprender mejor: repeticiones, oraciones y aumento de datos

### Video con la misma seña repetida
En «Importar videos de señas» marca **«Este video repite la misma seña varias veces»**. El video se corta por el movimiento de las manos y cada repetición se guarda como una muestra aislada (hasta 3 ventanas por velocidad; se descartan los tramos muy cortos, que suelen ser ruido). Un solo video de 20 s con 5 repeticiones aporta mucho más que antes.

### Video con una oración (varias señas)
1. Graba una oración haciendo **una pausa de medio segundo** entre seña y seña (baja las manos o quédate quieto).
2. En «Seña de estos videos» elige **«Oración: varias señas en orden»**.
3. Escribe las señas en el orden en que aparecen: `hola, matrícula, cuándo` (también vale `hola matricula cuando`, con o sin tildes, y «por favor» se entiende como una sola seña).
4. Elige el video. El sistema lo corta por movimiento y etiqueta cada tramo **en orden**.

Si la cantidad de tramos detectados **no coincide** con la de señas escritas, **no se guarda nada** (para no enseñarle a la IA algo equivocado) y el registro dice cuántos tramos vio y en qué segundos. Ajusta entonces la **«pausa mínima entre señas»**: súbela si vio de más (una seña partida en dos), bájala si vio de menos (dos señas pegadas).

Cada seña de la oración se guarda **aislada** (con su propio recorte), porque el modelo reconoce señas sueltas de unos 2 s. Los tramos del mismo video comparten el mismo identificador de fuente, así que en la validación siguen contando como un solo video.

### Aumento de datos mejorado (Entrenamiento)
El factor **×N** ahora **equilibra** las clases: las señas con pocas muestras se refuerzan con variantes realistas hasta N veces la mediana, y las que ya tienen muchas no se tocan (así «reposo» no domina). Las variantes cambian: velocidad (más lenta o rápida), ladeo de la cámara, distancia, proporciones del cuerpo, desplazamiento, error constante del detector, ruido por fotograma, espejo (personas zurdas) y pérdida breve de una mano. **Una mano que no existe nunca se inventa.** Se aplica solo al entrenamiento, nunca a la validación (así la precisión no se infla).

Dos límites importantes: (1) las variantes son parientes de la muestra original, no personas nuevas; no reemplazan grabar a más señantes; (2) con menos de 10 muestras reales de una seña el registro muestra un aviso.

### Otras mejoras del entrenamiento
- Se **conserva el modelo de la mejor época** (menor pérdida en validación) en vez del de la última.
- **Parada anticipada**: si la validación no mejora en N épocas (por defecto 12) se detiene.
- **Suavizado de etiquetas** (0,05): evita que el modelo se vuelva «demasiado seguro» con pocos datos.
- Al terminar se muestran **«Señas que más se confunden»** (ej. «Matrícula se confundió con Pensión, 3 veces»): indican qué señas conviene volver a grabar.

## 2. Subtítulos y voz (index.html)

- Cada seña detectada se suma a la frase en curso (línea de señas en mayúsculas) y se muestra una oración provisional.
  **La información del SAE ya no aparece seña por seña**: se muestra cuando la frase se cierra, interpretando la
  oración completa (ver 2b).
- Tras la **pausa entre frases** (3–8 s, por defecto 4 s) sin nuevas señas, la frase se cierra: se muestra la
  oración final y se lee en voz alta **exactamente el mismo texto**. Si empieza una seña nueva, se corta la lectura.
- Si la voz del navegador informa qué palabra lee, esa palabra se resalta en el subtítulo.
- El botón **Listo** cierra la frase al instante, sin esperar la pausa.
- **Voz** activa/desactiva la lectura; **Repetir** vuelve a leer la última frase.
- Los botones de «Temas frecuentes» funcionan igual que las señas: se suman a la oración y la información sale al
  completarla (pausa o botón **Listo**). Se pueden combinar toques: Hola + Matrícula + Por favor.
- Usa la voz del navegador (sin internet, sin claves). El idioma preferido es es-PE; si no existe, usa otra
  variante del español. Prueba en la PC del SAE qué voz tiene instalada.

## 2b. Información según la oración completa (`js/intencion.js`)

Antes, la tarjeta mostraba la información de **la última seña** (con «hola, matrícula, por favor» salía «por favor»).
Ahora, al cerrarse la frase, se interpreta la oración entera:

| Se hizo… | Se muestra… |
|---|---|
| `matrícula` | Matrícula |
| `hola, matrícula, por favor` | Matrícula (hola y por favor son cortesía, no un tema) |
| `cuándo, matrícula` | Matrícula, con el **horario resaltado** y «Entendí: ¿Cuándo es la matrícula?» |
| `hola, matrícula, pensión` | Matrícula, y un botón **«También mencionaste: Pensión»** para ver la otra |
| `ayuda, constancia` | Constancias |
| `hola` / `gracias` / `por favor` solos | La respuesta de cortesía de esa seña |
| `ayuda` sola, o solo una pregunta | La respuesta de ayuda / «¿Sobre qué tema?» |

Reglas: **el tema manda** sobre la cortesía, la ayuda y las preguntas; el orden de las señas no cambia el tema; si hay
varios temas, el primero es el principal. La palabra interrogativa resalta el dato que responde (¿dónde? → lugar,
¿cuándo? → horario, ¿quién? → contacto, ¿cómo? → pasos, ¿qué? → resumen).

**Respuesta puntual opcional** (sin tocar código): en `data/respuestas.json`, un tema puede traer `por_pregunta`:
`"matricula": { ..., "por_pregunta": { "cuando": "La matrícula es del 1 al 15 de cada ciclo." } }`.
Si la consulta incluye esa pregunta, el texto aparece destacado sobre el resumen. Usa solo datos oficiales del SAE.

> Esta lógica por reglas es la base para el chatbot: más adelante `interpretarConsulta()` puede reemplazarse (o
> complementarse) por un asistente que genere la respuesta a partir de la oración completa.

## 2c. Vocabulario ampliado (57 señas) y palabras de contexto

Se agregaron 18 señas relacionadas con lo que hace el SAE (informar, orientar y atender trámites y consultas):
- **Cortesía:** buenos días, buenas tardes, disculpa.
- **Conversación básica:** yo, estudiante, problema, repetir, no entiendo, esperar.
- **Trámites y vida académica:** reserva de matrícula, convalidación, justificación de inasistencias, quejas y reclamos, grado y título, revisión de evaluaciones.
- **Cuentas y tecnología:** contraseña, wifi, plataforma del SAE.

Las palabras de conversación (`contexto` en `data/frases.json`) **acompañan, no son un tema**: «yo, estudiante, matrícula» →
«Soy estudiante. Necesito información sobre la matrícula.» y responde Matrícula; «problema, wifi» → «Tengo un problema con el wifi.»

**Importante:** son señas nuevas, así que hay que **grabarlas y reentrenar**; el modelo actual no las conoce. Los temas
nuevos también se pueden tocar en la pantalla sin modelo. Antes de grabar, **verifica la forma de cada seña** con el
Diccionario de LSP de la PUCP (grupo Señas Gramaticales) o con personas señantes: la lista se eligió por los temas del
SAE, no copiando un listado de la PUCP.

## 2d. Contenido de `data/respuestas.json`

Ahora está orientado al SAE e incluye sus canales oficiales (correo helpdesk@upsjb.edu.pe, teléfono (01) 644 9131 opción 2,
WhatsApp (51) 948 780 735) y la plataforma sae.upsjb.edu.pe. Los pasos son **generales** (no se inventaron costos, plazos ni
horarios): hay que reemplazarlos con los procedimientos oficiales y poner `verificado: true`.

## 3. Cómo se arma la oración (`data/frases.json`)

Son **reglas de partida**, no gramática de la LSP. Deben ser validadas por personas señantes o intérpretes.
- `sustantivos`: cómo se nombra cada tema («la matrícula», «el SAE»…).
- `inicio` / `final`: «Hola.», «Gracias.», «Por favor.», «Adiós.», «Sí.», «No.».
- `preguntas`: plantillas por palabra interrogativa (`{tema}` se reemplaza).
- `plantillas`: casos especiales (por ejemplo, `cuando + pension` → «¿Cuándo vence la pensión?»). Se aplica la que
  coincida con más señas, en cualquier orden.

Ejemplos: `cuánto + matrícula` → «¿Cuánto cuesta la matrícula?» · `ayuda + constancia` → «Necesito ayuda con la constancia.»

## 4. Limitaciones conocidas

- Después de confirmar una seña, el sistema necesita ~2,6 s para detectar la siguiente (llenar los 30 fotogramas).
  Por eso la pausa mínima es de 3 s y la voz llega unos segundos después de la última seña.
- Las palabras interrogativas no tienen botón táctil (solo se detectan con la cámara).
- La importación de videos usa el detector en modo imagen; la cámara usa modo video (con seguimiento). Las
  diferencias son pequeñas, pero conviene validar con la cámara real.

### Qué no resuelve todavía este paso
- Sigue reconociendo **señas sueltas** de ~2 s; las oraciones se forman uniendo señas reconocidas con las reglas de `data/frases.json`. Entre una seña y la siguiente hay que dejar pasar unos 2 segundos.
- Reconocer oraciones **fluidas** (sin pausas) requiere un modelo continuo y muchos más datos; es una etapa posterior.
