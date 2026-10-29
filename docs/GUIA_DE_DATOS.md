# Guía para entrenar el modelo de Lengua de Señas Peruana

El sistema solo reconocerá bien lo que haya visto bien grabado y con suficiente variedad de personas.
Esta guía es el plan para llegar a algo realmente utilizable en el SAE.

## Regla de oro: empieza pequeño

No entrenes las 39 señas de golpe. Empieza con el **piloto de 12 señas** (marcadas en
`data/vocabulario.json` con `"piloto": true`; en la pestaña Datos está activo «Mostrar solo las 12 señas del piloto»):

> hola · gracias · adiós · sí · no · ayuda · matrícula · pensión · constancia · certificado · horario · requisitos

Cuando el piloto funcione bien con personas nuevas, amplías en tandas de unas 10 señas.

## Quién debe grabar las señas

- **Personas sordas usuarias de LSP o intérpretes de LSP.** La LSP está reconocida oficialmente en el Perú
  (Ley 29535) y tiene su propia gramática; no es español señado.
- **Valida el vocabulario con ellas** antes de grabar: hay variaciones regionales y de comunidad, y la seña de
  «matrícula» o «constancia» debe ser la que realmente usan.
- Pide **consentimiento escrito**. El dataset guarda solo coordenadas de puntos (sin imagen ni video), pero el
  consentimiento sigue siendo necesario.
- Ideal: que personas sordas participen también en las pruebas y en el diseño, no solo como fuente de datos.

## Plan paso a paso

### Fase 1 · Grabar el piloto (≈ 1 a 2 horas de grabación en total)

| Qué | Meta mínima | Mejor |
|---|---|---|
| Muestras por seña | 40 | 80–100 |
| Señantes distintos | 3 | 6 o más |
| Muestras de «Reposo» | 150 | 300 |

- Cada señante graba **15 repeticiones por seña** (3 tandas de 5, cambiando algo entre tandas: distancia, velocidad,
  ropa, mano dominante, posición en el cuadro).
- Usa un **ID de señante distinto** por persona (S01, S02…).
- **Reposo** es tan importante como las señas: manos abajo, manos quietas, rascarse, acomodarse el cabello,
  hablar sin señar, personas entrando y saliendo. Sin esto el sistema detecta señas cuando nadie las hace.
- Condiciones: cámara a la altura del pecho, 1–2 m, **hombros, brazos y manos** visibles, luz de frente, fondo liso.
- Cada muestra dura 2 s: la seña debe empezar y terminar dentro de ese tiempo.
- **Exporta al terminar cada sesión** («Exportar muestras nuevas») y súbelo siguiendo `COLABORACION.md`.

### Fase 2 · Entrenar y leer los resultados

1. Pestaña **Entrenamiento** → **Entrenar** (modelo «Rápido», 40 épocas, aumento ×2).
2. Mira la tabla de acierto por seña. Meta orientativa: **global ≥ 90 % y ninguna seña por debajo de 80 %**.
3. **Ojo:** esa cifra está inflada, porque la validación mezcla muestras de las mismas personas que entrenaron.
   La cifra que cuenta es la de la Fase 3.
4. Si una seña sale baja: graba más muestras de ella (y de la que se confunde), con más personas. Más datos
   mejora más que cambiar el tipo de modelo.

### Fase 3 · Prueba real con personas nuevas (la que decide)

1. En tu laptop abre el módulo de usuario (usa el modelo recién entrenado).
2. Pide a **2 o 3 personas que NO participaron en la grabación** que hagan cada seña **10 veces**, sin guía.
3. Anota en una hoja: seña hecha / seña detectada / no detectó.
4. **Meta para usarlo con público: ≥ 85 % de aciertos** y casi ningún falso positivo con las manos en reposo.
5. Si no llegas: vuelve a la Fase 1 sumando esas personas al entrenamiento (y busca otras nuevas para probar).

### Fase 4 · Ajustar

- Detecta señas que nadie hizo → más «Reposo» y sube la **Sensibilidad** (85–90 %).
- No detecta señas bien hechas → baja la sensibilidad a 70–75 % y revisa luz y encuadre.
- Confunde dos señas → graba más de ambas, con movimientos bien marcados.

### Fase 5 · Publicar y ampliar

1. **Descargar modelo para el repositorio** → copiar a `model/` → `git push`.
2. Primero un **piloto supervisado** en el SAE con alguien del personal presente, y mantén los *temas frecuentes*
   como alternativa siempre visible.
3. Amplía el vocabulario en tandas, **reentrenando siempre con todos los datos** (los modelos no se «suman»).

## Cómo combinar datos de varias personas o equipos

El procedimiento completo (roles, Pull Requests, quién publica el modelo) está en [`COLABORACION.md`](COLABORACION.md).

1. Cada persona exporta sus muestras nuevas (**Datos → Exportar muestras nuevas**).
2. Se guardan todos los `.json.gz` en `data/dataset/`.
3. En **Entrenamiento** deja marcada «Incluir datasets de la carpeta data/dataset».
4. La lista de datasets se actualiza sola cada vez que inicias `iniciar.bat` / `administrador.bat`.

## Alcance y siguientes pasos

- Esta versión reconoce **señas aisladas** (vocabulario cerrado) para consultas del SAE, no oraciones de LSP.
- Para frases completas hace falta otro tipo de modelo (reconocimiento continuo) y mucho más dato.
- El chatbot de texto está reservado en el diseño para una etapa posterior.
