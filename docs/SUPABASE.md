# Nube con Supabase (opcional)

Centraliza los datasets del equipo (sin pasar por Git) y publica el modelo para el sitio de usuarios.
Si no lo configuras, todo sigue funcionando como antes con Git.

## Qué se guarda y dónde
| Qué | Dónde | Quién lo ve |
| --- | --- | --- |
| Datasets (`.json.gz`, solo coordenadas) | Bucket privado `datasets` | Solo administradores |
| Registro de datasets, fuentes y señantes | Tablas `datasets`, `dataset_fuentes`, `senantes` | Solo administradores |
| Modelo entrenado (`modelo-lsp.json`, pesos, etiquetas) | Bucket público `modelo/actual` | Cualquiera (lo descarga `index.html`) |
| Historial de modelos (versión, acierto, señas) | Tabla `modelos` | Solo administradores |

No se guardan videos, imágenes ni nombres: solo códigos (`S01`, `V01`). Marca `consentimiento = true` en `senantes` cuando exista el consentimiento firmado.

## Puesta en marcha (una sola vez)
1. Crea un proyecto en supabase.com (plan gratuito). Revisa los límites vigentes de almacenamiento e inactividad.
2. **SQL Editor** → pega y ejecuta todo `supabase/esquema.sql`.
3. **Authentication → Users → Add user**: crea tu usuario (correo + contraseña). En los ajustes de Authentication
   desactiva el registro público de usuarios («Allow new users to sign up»).
4. Registra tu usuario como administrador (última sección del SQL):
   `insert into public.admins (user_id) select id from auth.users where email = 'tu-correo@…';`
5. **Project Settings → API**: copia *Project URL* y la clave *anon public* en `js/config.js`
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). **Nunca** pegues la clave `service_role`.
6. Sube los cambios a GitHub. En `admin.html` verás «Conectado: tu-correo».

## Flujo de trabajo
1. **Datos → Nube → Ingresar** con tu correo de Supabase (aparte de la contraseña local del administrador).
2. Graba o importa videos como siempre → **Subir muestras nuevas** (solo sube lo que no se subió antes). Las muestras subidas quedan marcadas localmente para no volver a cargarlas.
3. Al volver a ingresar con una cuenta administradora, se descargan las muestras de la nube y se guardan en IndexedDB de ese navegador. Las que ya estén guardadas no se duplican; las restauradas quedan listas para entrenar y exportar.
4. **Entrenamiento**: marca «Incluir datasets de la nube» y entrena (junta los datos de todo el equipo; los repetidos se descartan).
5. Si el resultado es bueno → **Publicar modelo en la nube**. `index.html` lo carga solo, sin tocar Git.
   Orden de búsqueda del modelo en el sitio de usuarios: nube → repositorio (`model/`) → navegador.

## Seguridad
- La clave `anon` es pública por diseño. La protección son las reglas RLS: solo usuarios en la tabla `admins` leen o escriben.
- Solo el bucket `modelo` es público de lectura (el modelo no contiene datos de personas).
- Cada administrador necesita su propio usuario en Supabase.

## Si algo falla
- «Conectado sin permisos»: falta el paso 4.
- El modelo no carga en `index.html`: confirma que el bucket `modelo` es público y que publicaste al menos una vez.
- Cambios de modelo que tardan en verse: el archivo se cachea hasta 60 s.
