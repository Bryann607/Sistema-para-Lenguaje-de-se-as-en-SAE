# Cómo funciona el sistema (y qué no romper al cambiarlo)

## Arquitectura en una frase
Aplicación web **estática del lado del cliente** (sin servidor propio): el navegador captura la cámara, detecta cuerpo y manos con MediaPipe, y un modelo de TensorFlow.js clasifica la seña. Se publica en **GitHub Pages**. Opcionalmente usa **Supabase** (BaaS en la nube) solo para guardar datasets y modelos del equipo.
Estilo: *cliente web estático (JAMstack) + inferencia en el borde*, organizado en capas y módulos ES; dos módulos por rol (usuario y administrador).

## Dos páginas, dos roles
| | `index.html` (usuario) | `admin.html` (administrador) |
|---|---|---|
| Entrada | `js/main.js` | `js/admin.js` (pide contraseña) |
| Se publica en GitHub Pages | Sí | **No** |
| Hace | reconocer, mostrar respuesta, subtítulos y voz | grabar, importar videos, entrenar, exportar, nube |

## Flujo de una seña (módulo de usuario)
```
cámara → vision.js (MediaPipe) → features.js (201 números por fotograma, normalizados)
       → ventana de 30 fotogramas → model.js (red) → traductor.js (umbral + votación + enfriamiento)
       → (cada seña se suma a la oración en curso; al cerrarla por pausa o botón «Listo»:)
       → intencion.js (tema + pregunta de la oración completa) → respuestas.json (tarjeta)
         + frases.js (oración con data/frases.json) + voz.js
```

## Flujo de aprendizaje (módulo de administrador)
```
cámara ──► datos.js ──┐
videos ──► videos.js + videoimport.js ──┤──► db.js (IndexedDB) ──► entrenar.js ──► model.js (trainModel)
datasets .json/.json.gz (data/dataset, nube) ──┘                              │ aumento.js (variantes) + evaluacion.js
                                                                              ▼
                                                      modelo → pestaña Traductor / carpeta model/ / nube
```

## Mapa de archivos
| Archivo | Rol | ¿Público? |
|---|---|---|
| `js/config.js` | constantes del modelo y URLs | sí |
| `js/features.js` | de puntos de MediaPipe a 201 números; espejo | sí |
| `js/vision.js`, `js/app.js` | cámara, detección, estado común | sí |
| `js/model.js` | construir, entrenar, cargar y predecir | sí |
| `js/aumento.js`, `js/evaluacion.js` | variantes de datos y métricas (lógica pura) | sí (los importa model.js) |
| `js/traductor.js`, `js/frases.js`, `js/intencion.js`, `js/voz.js` | interfaz de usuario, oraciones, qué información mostrar según la oración, voz | sí |
| `js/admin.js`, `auth.js`, `datos.js`, `videos.js`, `videoimport.js`, `entrenar.js`, `db.js`, `dataset.js`, `nube*.js` | administración | **no** |
| `data/vocabulario.json`, `respuestas.json`, `frases.json` | contenido editable | sí |
| `data/dataset/*.json(.gz)` | datos de entrenamiento del equipo | no |
| `model/` | modelo entrenado que ve el público | sí |

## Contratos que NO se deben cambiar sin reentrenar
`SEQ_LEN = 30`, `SAMPLE_MS = 66`, `FEATURE_DIM = 201`, el orden de los 201 valores (cuerpo 0–74, mano izquierda 75–137, derecha 138–200) y la normalización de `features.js`. Si alguno cambia, **los datasets y modelos anteriores dejan de servir**. Las pruebas lo vigilan (`contrato: dimensiones del modelo`).

## Reglas para cambiar el código sin romper nada
1. **Un módulo nuevo que use el sitio público se publica solo.** `tools/armar_sitio.py` sigue los `import` desde `main.js`; no hay lista que mantener. Si un módulo público importa código de administración, la publicación **falla a propósito**.
2. **Nunca importes `datos.js`, `db.js`, `dataset.js`, `auth.js`, etc. desde un módulo público.** (Las pruebas y GitHub Actions lo detectan.)
3. Usa **imports relativos con extensión** (`./features.js`) y que el archivo exista en `js/`.
4. **Antes de cada `git push`**: `node --test` (Node 18+). Si todo está en verde, se puede subir.
5. Los textos de `respuestas.json` y las reglas de `frases.json` se editan sin tocar código; cada seña del vocabulario **debe** tener su respuesta (hay una prueba para eso).
6. Si agregas una seña a `vocabulario.json`: agrega su respuesta, graba muestras y **reentrena**: un modelo viejo no la conoce.
7. Un modelo nuevo se publica reemplazando los 3 archivos de `model/` (`modelo-lsp.json`, `.weights.bin`, `etiquetas.json`) **juntos**.
8. Los datasets se **suman** (nunca se editan a mano); al entrenar se eliminan las muestras repetidas.

## Qué probar después de un cambio
| Cambié… | Pruebo… |
|---|---|
| Algo de `features.js`, `config.js` o `aumento.js` | `node --test` y reentrenar |
| `videoimport.js` / `videos.js` | importar un video de prueba y leer el registro |
| `traductor.js`, `frases.js`, `intencion.js`, `voz.js` | `node --test` y abrir `index.html` y usar los temas (no necesita modelo) |
| `pages.yml` o archivos públicos | `python tools/armar_sitio.py --verificar` y abrir `_site/` con `python -m http.server` |
| `model.js` | entrenar un modelo pequeño en `admin.html` y ver que termine y se vea en Traductor |

## Errores típicos
| Síntoma | Causa probable |
|---|---|
| Sitio publicado en blanco, 404 en consola | un módulo público no se copió → `python tools/armar_sitio.py --verificar` |
| «Dataset incompatible» | cambió `SEQ_LEN` o `FEATURE_DIM` → hay que regrabar o reconvertir |
| Detecta señas sin que nadie haga nada | falta «Reposo» o tiene pocas muestras |
| El modelo cambia entre entrenamientos con los mismos datos | la partición de validación es aleatoria (sin semilla): es normal |
