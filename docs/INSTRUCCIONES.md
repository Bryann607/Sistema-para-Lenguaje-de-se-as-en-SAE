# Instrucciones

## 1. Dos perfiles

| Perfil | Página | Qué puede hacer | Dónde está disponible |
|---|---|---|---|
| **Usuario** | `index.html` | Hacer señas frente a la cámara o elegir un tema y leer la información del SAE. No ve datos ni entrenamiento. | Laptop **y** GitHub Pages |
| **Administrador** | `admin.html` | Grabar muestras, entrenar el modelo, exportar datasets y descargar el modelo. Pide contraseña. | **Solo en tu laptop** (no se publica) |

GitHub Pages es un sitio estático y no tiene servidor, así que **no puede guardar usuarios ni contraseñas de forma segura**.
Por eso la protección real es que `admin.html` y todo el código de entrenamiento **no se suben al sitio público**
(lo controla `.github/workflows/pages.yml`). La contraseña del administrador agrega una barrera extra en tu equipo
(evita que alguien toque los datos por accidente), pero no detiene a una persona con conocimientos técnicos que
tenga acceso físico a esa computadora.

## 2. Qué necesitas

- **Navegador:** Chrome o Edge actualizados (también sirve Firefox).
- **Cámara web** y permiso para usarla.
- **Internet** (la primera carga descarga MediaPipe, TensorFlow.js y las fuentes).
- **Python 3** solo para abrir la página en tu laptop: https://www.python.org/downloads/
  (marca **Add Python to PATH**). Alternativas: extensión *Live Server* de VS Code, o `npx serve`.

> No abras `index.html` con doble clic: el navegador bloquea la carga de datos desde `file://`.

## 3. Ejecutarlo en tu laptop

**Windows:**
- `iniciar.bat` → abre el módulo de **usuario**.
- `administrador.bat` → abre directamente la **administración**.

**macOS / Linux:** `./iniciar.sh` (usuario) o `./iniciar.sh admin` (administración).

Se abre una ventana negra con el servidor y el navegador. **Esa ventana debe quedarse abierta** mientras uses la página.
Muestra las direcciones exactas, por ejemplo:

```
 Usuario         : http://localhost:8000/
 Administración  : http://localhost:8000/admin.html
```

El programa busca un puerto libre (8000, 8001, 8002…), así que **usa siempre la dirección que muestra la ventana**:
el número puede no ser 8000.

**A mano (alternativa):** `python tools/servidor.py` (en Windows también `py tools\servidor.py`).

### Si `admin.html` no abre o sale en blanco

| Qué ves | Causa | Solución |
|---|---|---|
| «No se puede acceder a este sitio» / `ERR_CONNECTION_REFUSED` | El servidor no está abierto. | Ejecuta `administrador.bat` y deja abierta su ventana. |
| «Error response / File not found» o **404** | Tienes abierto un servidor **viejo** (de otra carpeta o versión) en el mismo puerto. | Cierra **todas** las ventanas negras de servidores anteriores y ejecuta `administrador.bat` de la carpeta nueva. Usa la dirección que muestra la ventana. |
| Página en blanco o sin colores | Falló la carga de un script, o el navegador guardó una versión vieja. | Recarga con `Ctrl + F5`. Abajo debería aparecer un aviso rojo con el archivo que falló. |
| Aviso rojo «No se pudo cargar…» | Sin internet, o servidor abierto en la carpeta equivocada. | Verifica internet y que la ruta de «Carpeta servida» en la ventana sea la del proyecto nuevo. |

Para ver el error exacto pulsa **F12 → pestaña Console**.

**Primera vez como administrador:** te pide crear una contraseña (mínimo 6 caracteres). Queda guardada, cifrada,
en ese navegador. Tras 5 intentos fallidos se bloquea 1 minuto.

**Olvidé la contraseña:** en `admin.html` pulsa F12 → pestaña *Application* → *Local Storage* → borra las claves
`lsp-admin` y `lsp-admin-fallos` y recarga. (Las muestras grabadas no se borran.)

> **Importante:** las muestras se guardan en el navegador de esa laptop. Si borras los datos del sitio o cambias
> de navegador, se pierden. **Exporta un respaldo seguido** (Datos → Exportar todo) y guárdalo en `data/dataset/`.

## 4. Flujo para tener la traducción funcionando

> **Si trabajan varias personas**, lean primero [`COLABORACION.md`](COLABORACION.md): explica cómo juntar los datos de todos y quién entrena y publica el modelo.

Está explicado a fondo en [`GUIA_DE_DATOS.md`](GUIA_DE_DATOS.md). Resumen:

1. `admin.html` → **Datos**: graba muestras de las señas del piloto y de «Reposo».
2. **Exportar muestras nuevas** y guarda el `.json.gz` en `data/dataset/` (respaldo y trabajo en equipo).
3. **Entrenamiento** → **Entrenar**. Revisa el acierto por seña.
4. Abre el módulo de usuario en tu laptop y **pruébalo** (en localhost usa el modelo recién entrenado).
5. Cuando estés conforme: **Entrenamiento → Descargar modelo para el repositorio** y copia los 3 archivos
   (`modelo-lsp.json`, `modelo-lsp.weights.bin`, `etiquetas.json`) a la carpeta `model/`.
   El navegador puede pedir permiso para descargar varios archivos: acéptalo.
6. Sube los cambios a GitHub (sección 5). El sitio público ya usará el nuevo modelo.

Para **editar la información que se muestra** abre `data/respuestas.json` (una entrada por seña) y cambia
`"verificado": false` a `true` cuando el SAE valide el texto. Para **agregar una seña** añádela en
`data/vocabulario.json`, graba sus muestras y vuelve a entrenar.

## 5. Publicarlo en GitHub Pages (URL web gratuita)

Tu sitio quedará en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/` y solo tendrá el módulo de usuario.

1. Crea una cuenta en https://github.com y un repositorio nuevo **público** (por ejemplo `senasjb`).
   No marques «Add a README».
2. Sube el proyecto. Desde una terminal dentro de la carpeta del proyecto:

   ```bash
   git init
   git add .
   git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/NOMBRE-DEL-REPO.git
   git push -u origin main
   ```

   (Sin Git: en el repositorio usa **Add file → Upload files** y arrastra el contenido de la carpeta, incluida
   `.github`. La web acepta archivos de hasta 25 MB.)
3. En **Settings → Pages → Build and deployment → Source** elige **GitHub Actions**.
4. Ve a la pestaña **Actions**: verás «Publicar en GitHub Pages». Cuando termine (1–2 minutos) la URL aparece en
   **Settings → Pages**.
5. La cámara funciona porque GitHub Pages usa **https**.

Para actualizar el sitio (nuevo modelo, textos del SAE, audios):

```bash
git add .
git commit -m "Actualiza modelo"
git push
```

> El repositorio es público: cualquiera puede ver el código y los datasets de `data/dataset/`. Los datasets solo
> contienen coordenadas de puntos (sin imagen ni video), pero si prefieres no exponerlos usa un repositorio
> **privado** (GitHub Pages en repos privados requiere un plan de pago) o guarda los datasets fuera del repositorio.

**Tamaño:** GitHub rechaza archivos de más de 100 MB y recomienda no pasar de 50 MB. Si un dataset es muy grande,
exporta por partes.

## 6. Uso en el SAE (módulo de atención)

- Abre la URL pública en el equipo del mostrador y pulsa **Pantalla completa**.
- Acepta el permiso de cámara una sola vez; el navegador lo recuerda para ese sitio.
- Cámara a la altura del pecho, buena luz de frente y fondo liso.
- Tras 60 segundos sin actividad se borra la conversación para la siguiente persona.
- Si el reconocimiento falla, la persona puede elegir su tema en **También puedes elegir un tema**.

## 7. Problemas frecuentes

| Síntoma | Solución |
|---|---|
| «No se pudieron leer los datos» | Abriste el archivo con doble clic. Usa `iniciar.bat` o GitHub Pages. |
| «No se pudo cargar TensorFlow.js» / el detector no inicia | Sin internet o una red que bloquea `cdn.jsdelivr.net` o `storage.googleapis.com`. |
| Permiso de cámara denegado | Candado de la barra de direcciones → Cámara → Permitir, y recarga. |
| No detecta las manos | Más luz, más distancia de la cámara, fondo liso, mangas que contrasten con la piel. |
| Detecta señas sin que nadie haga nada | Falta «Reposo» o tiene pocas muestras: graba 150 o más, con varias personas. |
| Muy lento / pocos fps | Cierra otras pestañas, usa Chrome, modelo «Rápido (Conv1D)». |
| El sitio público no cambió | Revisa que el workflow terminó en verde (Actions) y recarga con `Ctrl + F5`. |
| `admin.html` da 404 en GitHub Pages | Es lo esperado: la administración solo existe en tu laptop. |
