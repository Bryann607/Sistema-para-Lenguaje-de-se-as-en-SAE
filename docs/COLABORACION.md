# Trabajo en equipo: cómo juntar los avances de todos en un solo modelo

## La idea clave

**Los modelos no se pueden sumar.** Si cada persona entrena el suyo y lo sube, no se obtiene un modelo mejor: solo se pisan los archivos.
Lo que se comparte son los **datos** (las muestras grabadas) y **una sola persona entrena con todo**:

```
Colaborador 1 ─┐
Colaborador 2 ─┼─►  archivos dataset-*.json.gz  ─►  GitHub  ─►  Coordinador entrena con TODO  ─►  model/  ─►  GitHub Pages
Colaborador 3 ─┘        (cada uno sube los suyos)
```

| Rol | Qué hace | Qué NO hace |
|---|---|---|
| **Colaborador** | Graba muestras y sube sus archivos `dataset-*.json.gz` a `data/dataset/`. | No entrena para publicar. No toca `model/`. |
| **Coordinador** (1 persona) | Junta los datos, entrena, prueba con personas nuevas y publica el modelo en `model/`. | — |

> Los colaboradores **no descargan la página publicada**: en GitHub Pages no existe la administración. Trabajan con el **repositorio** (código completo).

---

## A. Preparación (una sola vez, la hace el coordinador)

1. Sube el proyecto a GitHub (ver `docs/INSTRUCCIONES.md`, sección 5).
2. **Invita a los colaboradores:** repositorio → *Settings → Collaborators → Add people*. (Si prefieres no dar acceso, ellos trabajan con un *fork* y te envían *Pull Request*; el resto es igual.)
3. **Protege `main`** (recomendado): *Settings → Branches → Add branch ruleset* → exigir *Pull Request* antes de fusionar. Así el sitio público solo cambia cuando tú apruebas.
4. **Asigna un prefijo único a cada colaborador** para los ID de señante, y repártelos por escrito:

   | Colaborador | Prefijo | Ejemplos de ID de señante |
   |---|---|---|
   | Juan Pérez | JP | `JP-S01`, `JP-S02` |
   | Ana Torres | AT | `AT-S01` |

   Un ID = una persona señante. **Nunca se repite un ID entre colaboradores.**
5. Acuerda con la comunidad sorda y el SAE la lista de señas del piloto y obtén el **consentimiento escrito** de cada señante.

## B. Colaborador: grabar y subir datos

### 1. Obtener el proyecto
- **Con Git (recomendado):**
  ```bash
  git clone https://github.com/USUARIO/REPO.git
  cd REPO
  ```
- **Sin Git:** en la página del repositorio → botón verde **Code → Download ZIP** (para subir luego usarás la web, ver paso 4).

### 2. Grabar
1. Ejecuta `administrador.bat` (o `./iniciar.sh admin`) y crea tu contraseña local.
2. En **Datos** escribe el **ID de señante** (por ejemplo `JP-S01`), activa la cámara y graba siguiendo `docs/GUIA_DE_DATOS.md`
   (15 repeticiones por seña, variando distancia, velocidad y ropa; y mucho «Reposo»).
3. Si cambia la persona que señala, **cambia el ID** antes de seguir grabando.

### 3. Exportar
Pulsa **Exportar muestras nuevas**. Baja un archivo como:

```
dataset-lsp-JP-S01-20261028-1530.json.gz
```

Cada vez que exportes solo salen las muestras grabadas **desde la exportación anterior**, así nunca subes lo mismo dos veces.
(**Exportar todo** es un respaldo completo para ti; no lo subas al repositorio.)

### 4. Subir al repositorio
**Con Git:**
```bash
git pull
git checkout -b datos-JP-20261028
# copia el archivo exportado a la carpeta data/dataset/
git add data/dataset/dataset-lsp-JP-S01-20261028-1530.json.gz
git commit -m "Datos de JP-S01: matrícula, pensión, reposo (140 muestras)"
git push -u origin datos-JP-20261028
```
Luego abre GitHub: aparece el botón **Compare & pull request** → **Create pull request**.

**Sin Git (desde la web):** en el repositorio abre la carpeta `data/dataset` → **Add file → Upload files** → arrastra tu archivo →
abajo elige **Create a new branch** → **Propose changes** → **Create pull request**. (La web acepta archivos de hasta 25 MB: si pasas ese tamaño, exporta con más frecuencia.)

### Reglas del colaborador
- El Pull Request incluye **solo archivos nuevos** en `data/dataset/` (la plantilla trae una lista para marcar).
- **No modifiques ni borres** archivos de otras personas.
- **No toques `model/`**, `js/`, `index.html` ni `admin.html`.
- No subas datos de personas que no firmaron el consentimiento.

## C. Coordinador: entrenar con todo y publicar

1. **Revisa y fusiona** los Pull Requests (*Merge pull request*).
2. En tu laptop trae todo: `git pull`.
3. Ejecuta `administrador.bat`. La ventana negra indica cuántos datasets encontró (`Datasets locales: N`).
4. **Entrenamiento** → deja marcada «Incluir datasets de la carpeta data/dataset» → **Entrenar**.
   - Los datos repetidos se descartan solos (misma persona + fecha + seña).
   - Revisa el acierto por seña y qué señas necesitan más muestras; avisa al equipo cuáles grabar.
5. **Prueba con 2–3 personas que no participaron en la grabación** (ver `GUIA_DE_DATOS.md`, Fase 3). Si no llegas a ~85 %, pide más datos.
6. **Descargar modelo para el repositorio** y copia los 3 archivos a `model/`:
   `modelo-lsp.json`, `modelo-lsp.weights.bin`, `etiquetas.json`.
7. Anota una fila en `model/HISTORIAL.md` (fecha, nº de muestras, señantes, acierto).
8. Publica:
   ```bash
   git checkout -b modelo-20261115
   git add model/
   git commit -m "Modelo v2: 12 señas, 780 muestras, 6 señantes"
   git push -u origin modelo-20261115
   ```
   Abre el Pull Request, fusiónalo, y en 1–2 minutos **GitHub Pages ya usa el modelo nuevo**.
9. Avisa al equipo: todos hacen `git pull` y siguen grabando lo que falte.

## D. Preguntas frecuentes

**¿Cuánto pesan los datos?** Estimo 10–25 KB por muestra comprimida (1 000 muestras ≈ 10–25 MB). GitHub rechaza archivos de más de 100 MB; por eso se exporta por tandas.

**¿Y la privacidad?** Los archivos contienen solo coordenadas de puntos (sin foto ni video), pero un repositorio público los puede ver cualquiera. Si prefieres que no sean públicos:
crea un segundo repositorio **privado** (por ejemplo `senasjb-datos`) solo para `data/dataset/`, y el coordinador copia esos archivos a su carpeta `data/dataset/` antes de entrenar
(añade `data/dataset/*.json.gz` a `.gitignore` del repositorio público para no subirlos por accidente).

**¿Y si alguien no sabe usar Git?** Puede enviar su archivo `.json.gz` por Drive o WhatsApp al coordinador, que lo copia a `data/dataset/`. Funciona igual.

**¿Dos personas entrenaron por su cuenta?** No pasa nada, pero ese modelo local no se publica. Solo vale el que entrena el coordinador con todos los datos.

**¿Hay algo más automático?** Sí: una base en la nube (por ejemplo Supabase) permitiría que todos suban muestras directo desde `admin.html`, sin Git ni Pull Requests. Es una mejora posible para una siguiente etapa.
