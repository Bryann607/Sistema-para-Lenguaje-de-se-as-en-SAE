# Atención en Lengua de Señas Peruana · UPSJB

Módulo web para el **SAE de la Universidad Privada San Juan Bautista**: una persona se
presenta en el área, hace una seña frente a la cámara y el sistema le muestra en pantalla la
información del trámite o tema que pidió.

Todo funciona **en el navegador** (cámara, detección de manos, entrenamiento y traducción):
no necesita servidor propio ni Python para usarse, por lo que se puede publicar gratis en
**GitHub Pages**.

## Estado actual

| Parte | Estado |
|---|---|
| Diseño temático UPSJB (rojo institucional, escudo, accesible, responsive) | Listo |
| Cámara y detección de cuerpo y manos (MediaPipe) | Listo |
| Perfiles: **usuario** (`index.html`) y **administrador** (`admin.html`, con contraseña, solo en tu laptop) | Listo |
| Recolección de datos de LSP desde `admin.html` | Listo |
| Entrenamiento del modelo desde `admin.html` (TensorFlow.js) | Listo |
| Traducción en vivo + respuesta con información del SAE | Listo, **requiere un modelo entrenado** |
| Temas frecuentes (menú táctil, no depende del modelo) | Listo |
| Chatbot de texto | Reservado en el diseño, pendiente |
| **Dataset de LSP y modelo entrenado** | **Pendiente: hay que grabarlos con personas señantes** (ver `docs/GUIA_DE_DATOS.md`) |
| Textos de respuestas del SAE | Contenido de ejemplo; reemplazar en `data/respuestas.json` |

> Este repositorio **no incluye señas reales de LSP ni un modelo entrenado**. El modelo del
> proyecto original (ASL, 4 palabras) se eliminó a propósito. La página incluye todo lo
> necesario para grabar el dataset y entrenar el modelo.

## Nuevo: videos, subtítulos y voz

Importar videos de LSP para entrenar, subtítulos con oraciones en español y lectura en voz alta: ver [`docs/NUEVAS_FUNCIONES.md`](docs/NUEVAS_FUNCIONES.md). Nube opcional con Supabase (datasets y modelo centralizados): [`docs/SUPABASE.md`](docs/SUPABASE.md).

## Empezar

- **Perfiles, laptop y GitHub Pages:** lee [`docs/INSTRUCCIONES.md`](docs/INSTRUCCIONES.md).
- **Cómo grabar bien los datos de LSP:** lee [`docs/GUIA_DE_DATOS.md`](docs/GUIA_DE_DATOS.md).
- **Trabajo en equipo (varias personas, un solo modelo):** lee [`docs/COLABORACION.md`](docs/COLABORACION.md).

En Windows: `iniciar.bat` abre el módulo de usuario y `administrador.bat` abre la administración (también en `/admin.html` del puerto que muestre la ventana).

El sitio publicado en GitHub Pages **solo incluye el módulo de usuario**; `admin.html`, la grabación y el entrenamiento no se publican.

## Estructura

```
index.html            Módulo de USUARIO (público): traducción y consulta
admin.html            Módulo de ADMINISTRADOR (solo local): datos y entrenamiento
css/styles.css        Tema UPSJB
js/                   Lógica (app, cámara, características, modelo, vistas, auth)
data/vocabulario.json Señas a reconocer (39 iniciales, editables)
data/respuestas.json  Información que se muestra por cada seña
data/frases.json      Reglas para armar la oración de los subtítulos
data/dataset/         Datasets exportados (.json.gz) que se versionan en Git
audio/                (opcional) Voz grabada por respuesta, p. ej. matricula.mp3
model/                Modelo entrenado (modelo-lsp.json, .weights.bin, etiquetas.json) + HISTORIAL.md
tools/                servidor.py (servidor local) y utilidades
docs/                 Instrucciones y guía de datos
.github/workflows/    Publicación automática en GitHub Pages
```

## Cómo funciona

1. MediaPipe detecta 25 puntos del cuerpo y 21 por mano en cada fotograma.
2. Los puntos se normalizan (origen en los hombros, escala = ancho de hombros) para que no
   dependan de la distancia a la cámara. Se guardan 30 fotogramas (~2 s) por seña.
3. Un modelo pequeño (Conv1D o GRU) clasifica la secuencia. Hay una clase «reposo» para
   evitar falsos positivos cuando nadie hace señas.
4. Si la seña es estable y supera la sensibilidad elegida, se muestra la respuesta del SAE.

Las muestras guardan **solo coordenadas de puntos**, no video ni fotos.

## Limitaciones conocidas

- Reconoce **señas aisladas** (vocabulario cerrado), no oraciones completas de LSP.
- La precisión depende de la cantidad y variedad de datos (personas, luz, ropa, distancia).
- Necesita internet la primera vez (descarga MediaPipe, TensorFlow.js y fuentes desde CDN).

## Créditos

Rediseñado a partir de la idea de [SignPal](https://github.com/jothsnapraveena/SignPal-Real-Time-Sign-Language-Translation)
(Streamlit + ASL). Esta versión es una reescritura completa para Lengua de Señas Peruana,
con la identidad visual de la UPSJB.
