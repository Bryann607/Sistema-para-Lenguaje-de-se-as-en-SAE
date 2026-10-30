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

## 2. Subtítulos y voz (index.html)

- Cada seña detectada se suma a la frase en curso (línea de señas en mayúsculas) y se muestra una oración provisional.
- Tras la **pausa entre frases** (3–8 s, por defecto 4 s) sin nuevas señas, la frase se cierra: se muestra la
  oración final y se lee en voz alta **exactamente el mismo texto**. Si empieza una seña nueva, se corta la lectura.
- Si la voz del navegador informa qué palabra lee, esa palabra se resalta en el subtítulo.
- **Voz** activa/desactiva la lectura; **Repetir** vuelve a leer la última frase.
- Los botones de «Temas frecuentes» también alimentan los subtítulos y la voz.
- Usa la voz del navegador (sin internet, sin claves). El idioma preferido es es-PE; si no existe, usa otra
  variante del español. Prueba en la PC del SAE qué voz tiene instalada.

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
