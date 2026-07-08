# 🚀 Publicar APP Partidos en internet (gratis)

La app usa **Render** (servidor gratis) + **Supabase** (base de datos gratis).
Así los datos no se pierden aunque el servidor se reinicie.

Tiempo estimado: 15-20 minutos. Todo se hace desde el navegador.

---

## Paso 1: Crear la base de datos en Supabase

1. Entra a https://supabase.com y crea una cuenta (puedes usar tu cuenta de GitHub).
2. Crea un proyecto nuevo: botón **New project**. Ponle nombre (ej: `app-partidos`), elige una contraseña de base de datos cualquiera (no la usaremos directamente) y la región más cercana (South America - São Paulo).
3. Cuando el proyecto termine de crearse, ve a **SQL Editor** (ícono de terminal en el menú izquierdo) y ejecuta esto:

```sql
create table estado (
  id bigint primary key,
  data jsonb
);
```

4. Ve a **Project Settings → API** (engranaje en el menú) y copia dos cosas:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **service_role key** (en "Project API keys", la clave larga marcada como `service_role` — ⚠️ es secreta, no la compartas ni la subas a GitHub)

---

## Paso 2: Subir el código a GitHub

Desde la carpeta de la app en tu computador (necesitas [Git](https://git-scm.com/download/win) instalado):

```
cd "C:\Users\NCLGP\Documents\APP partidos"
git init
git add .
git commit -m "APP Partidos"
```

Luego crea un repositorio en https://github.com/new (nombre: `app-partidos`, puede ser **privado**) y sigue las instrucciones que te muestra GitHub:

```
git remote add origin https://github.com/TU_USUARIO/app-partidos.git
git branch -M main
git push -u origin main
```

> El archivo `.gitignore` ya está configurado para NO subir `node_modules` ni tus datos locales.

---

## Paso 3: Desplegar en Render

1. Entra a https://render.com y crea una cuenta con tu GitHub.
2. Botón **New → Web Service** y conecta tu repositorio `app-partidos`.
3. Configuración:
   - **Language**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. En **Environment Variables** agrega:

   | Nombre | Valor |
   |---|---|
   | `SUPABASE_URL` | la Project URL del paso 1 (ej: `https://abcdefgh.supabase.co`) |
   | `SUPABASE_KEY` | la service_role key del paso 1 |
   | `ADMIN_USERNAME` | tu nombre de usuario en la app (opcional: te permite resetear contraseñas de otros desde Mi perfil) |

5. Botón **Deploy Web Service**. En unos minutos tendrás una URL tipo `https://app-partidos.onrender.com`.

---

## Paso 4: ¡Compartir!

Pásale la URL a tus amigos. Cada uno se crea su cuenta y listo.

### Cosas a saber del plan gratuito

- **El servidor se duerme** tras ~15 minutos sin uso. La primera visita después tarda ~30-60 segundos en cargar. Después anda normal.
- **Los datos están seguros** en Supabase aunque el servidor se duerma o reinicie.
- Para actualizar la app: haz cambios, `git add . && git commit -m "cambios" && git push` y Render redespliega solo.

### Uso local (sin internet)

Nada cambia: `npm start` en tu PC sigue usando el archivo `data/db.json` local.
El modo nube solo se activa cuando existen las variables `SUPABASE_URL` y `SUPABASE_KEY`.
