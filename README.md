# Radar — Visibilidad en ChatGPT

Dashboard para trackear, para varios proyectos/sitios a la vez, si tus dominios
aparecen citados cuando ChatGPT responde a ciertos términos de búsqueda.
Corre sola todos los días y guarda el historial para mostrarte la tendencia.

## Qué incluye

- Varios **proyectos** (uno por sitio web)
- Varios **términos** por proyecto, cada uno con su propia ubicación simulada (ciudad/país)
- Un **cron interno** que revisa todo automáticamente cada día
- Un **botón "Revisar ahora"** para chequear todo al instante
- Gráfico de **% de visibilidad en el tiempo** por proyecto

## Cómo desplegarlo (gratis)

Vas a necesitar 3 cuentas gratuitas: **GitHub**, **Neon** (base de datos) y
**Render** (hosting). Todo el proceso toma unos 15-20 minutos.

### Paso 1 — Sube el código a GitHub

1. Crea un repositorio nuevo en [github.com/new](https://github.com/new) (puede ser privado).
2. Sube esta carpeta completa (`ai-visibility-tracker`) a ese repositorio.
   Si nunca usaste GitHub, la forma más fácil es arrastrar los archivos
   directamente en la página web del repo ("uploading an existing file").

### Paso 2 — Crea la base de datos en Neon

1. Ve a [neon.tech](https://neon.tech) y crea una cuenta gratis.
2. Crea un proyecto nuevo (cualquier nombre, región cercana a Perú si te la da la opción).
3. En el dashboard de Neon, copia el **Connection string** (empieza con `postgres://...`).
   Guárdalo, lo vas a necesitar en el paso 4.

### Paso 3 — Consigue tu API key de OpenAI

Desde [platform.openai.com/api-keys](https://platform.openai.com/api-keys), la misma
que ya usaste con el script anterior (necesita saldo cargado).

### Paso 4 — Despliega en Render

1. Ve a [render.com](https://render.com), crea una cuenta gratis (puedes entrar con GitHub).
2. Click en **New +** → **Web Service**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio que subiste.
4. Configura:
   - **Name**: lo que quieras, ej. `radar-chatgpt`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. En la sección **Environment Variables**, agrega estas (mira `.env.example`):
   - `OPENAI_API_KEY` → tu key de OpenAI
   - `DATABASE_URL` → el connection string que copiaste de Neon
   - `DASHBOARD_USER` → un usuario cualquiera, ej. `admin`
   - `DASHBOARD_PASSWORD` → una contraseña que solo tú sepas
   - `CRON_SCHEDULE` → `0 8 * * *` (corre todos los días 8am hora de Lima; puedes cambiarlo)
6. Click en **Create Web Service**. Render va a instalar todo y desplegar la app
   (tarda 2-3 minutos la primera vez).
7. Cuando termine, Render te da una URL tipo `https://radar-chatgpt.onrender.com`.
   Entra ahí, te va a pedir el usuario/contraseña que configuraste — esa es tu plataforma.

### Nota sobre el plan gratuito de Render

El plan free "duerme" el servicio si nadie lo visita en 15 minutos, y tarda
unos segundos en despertar la próxima vez que entres — es normal, no es un error.
El cron diario también podría no dispararse si el servicio está dormido a esa hora.
Si te importa que el chequeo diario sea 100% confiable, el plan pago de Render
(~$7/mes) mantiene el servicio siempre despierto. Tus datos en Neon están seguros
de cualquier forma, sin importar el plan de Render.

## Uso local (opcional, para probar antes de desplegar)

```bash
cp .env.example .env
# edita .env con tus datos reales
npm install
npm start
```

Abre `http://localhost:3000` (te pedirá el usuario/contraseña que pusiste en `.env`).

## Cómo se usa

1. Entra al dashboard con tu usuario/contraseña.
2. Crea un proyecto (nombre + dominio, ej. "Manga Gástrica Lima" / `mangagastricalima.com`).
3. Agrega los términos que quieres monitorear, con ciudad/país si quieres
   simular una búsqueda local (ej. Lima / PE).
4. Click en "Revisar ahora" para el primer chequeo, o espera al cron diario.
5. El gráfico de arriba te muestra el % de tus términos donde ChatGPT te cita,
   día a día.

## Costos a tener en cuenta

- **Neon**: gratis en el plan hobby (suficiente para este uso).
- **Render**: gratis en el plan free (con las limitaciones de arriba).
- **OpenAI API**: pago por uso, según cuántos términos monitorees y con
  qué frecuencia. Cada chequeo de un término cuesta unos centavos de dólar.
