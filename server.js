require("dotenv").config();
const express = require("express");
const basicAuth = require("express-basic-auth");
const path = require("path");
const { pool, init, marcarPrimeraAparicionSiMejoro } = require("./db");
const { checkKeyword } = require("./checker");
const { startScheduler, runAllChecks } = require("./scheduler");

const app = express();
app.use(express.json());

// --- Autenticación simple (usuario/contraseña compartidos) ---
app.use(
  basicAuth({
    users: { [process.env.DASHBOARD_USER || "admin"]: process.env.DASHBOARD_PASSWORD || "cambia-esta-clave" },
    challenge: true,
  })
);

app.use(express.static(path.join(__dirname, "public")));

// --- Proyectos ---
app.get("/api/projects", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM projects ORDER BY created_at DESC");
  res.json(rows);
});

app.post("/api/projects", async (req, res) => {
  const { name, domain, frequency_days } = req.body;
  if (!name || !domain) return res.status(400).json({ error: "Falta name o domain" });
  const { rows } = await pool.query(
    "INSERT INTO projects (name, domain, frequency_days) VALUES ($1, $2, $3) RETURNING *",
    [name, domain, frequency_days || 1]
  );
  res.json(rows[0]);
});

app.put("/api/projects/:id", async (req, res) => {
  const { name, domain, frequency_days } = req.body;
  const { rows } = await pool.query(
    `UPDATE projects SET
       name = COALESCE($1, name),
       domain = COALESCE($2, domain),
       frequency_days = COALESCE($3, frequency_days)
     WHERE id = $4 RETURNING *`,
    [name || null, domain || null, frequency_days || null, req.params.id]
  );
  res.json(rows[0]);
});

app.delete("/api/projects/:id", async (req, res) => {
  await pool.query("DELETE FROM projects WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

// --- Keywords ---
app.get("/api/projects/:id/keywords", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM keywords WHERE project_id = $1 ORDER BY created_at",
    [req.params.id]
  );
  res.json(rows);
});




app.post("/api/projects/:id/keywords", async (req, res) => {
  const { term, city, region, country, tags, ai_provider } = req.body;
  if (!term) return res.status(400).json({ error: "Falta term" });
  const tagsArray = Array.isArray(tags) ? tags.filter(Boolean) : [];

const dup = await pool.query(
    `SELECT id FROM keywords
     WHERE project_id = $1
       AND lower(trim(term)) = lower(trim($2))
       AND NULLIF(trim(city), '') IS NOT DISTINCT FROM NULLIF(trim($3), '')
       AND NULLIF(trim(country), '') IS NOT DISTINCT FROM NULLIF(trim($4), '')
       AND ai_provider IS NOT DISTINCT FROM $5`,
    [req.params.id, term, city || null, country || null, ai_provider || null]
  );
  if (dup.rows.length) {
    return res.status(409).json({
      error: `Ese término ya existe en este proyecto con la misma ubicación y proveedor de IA: "${term.trim()}"`,
    });
  }

  const { rows } = await pool.query(
    `INSERT INTO keywords (project_id, term, city, region, country, tags, ai_provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.params.id, term, city || null, region || null, country || null, tagsArray, ai_provider || null]
  );
  res.json(rows[0]);
});

app.post("/api/projects/:id/keywords/bulk", async (req, res) => {
  const { terms, city, region, country, tags, ai_provider } = req.body;
  if (!Array.isArray(terms) || !terms.length) return res.status(400).json({ error: "Falta terms (lista)" });
  const tagsArray = Array.isArray(tags) ? tags.filter(Boolean) : [];

const cityKey = (city || "").trim().toLowerCase();
  const countryKey = (country || "").trim().toLowerCase();
  const providerKey = ai_provider || "auto";

  const { rows: existentes } = await pool.query(
    `SELECT lower(trim(term)) AS t,
            lower(trim(COALESCE(city, ''))) AS c,
            lower(trim(COALESCE(country, ''))) AS p,
            COALESCE(ai_provider, 'auto') AS prov
     FROM keywords WHERE project_id = $1`,
    [req.params.id]
  );
  const existentesSet = new Set(existentes.map((r) => `${r.t}|${r.c}|${r.p}|${r.prov}`));
  const vistosEnEsteLote = new Set();

  const insertados = [];
  const duplicados = [];
  for (const raw of terms) {
    const term = (raw || "").trim();
    if (!term) continue;
    const key = `${term.toLowerCase()}|${cityKey}|${countryKey}|${providerKey}`;
    if (existentesSet.has(key) || vistosEnEsteLote.has(key)) {
      duplicados.push(term);
      continue;
    }
    vistosEnEsteLote.add(key);
    const { rows } = await pool.query(
      `INSERT INTO keywords (project_id, term, city, region, country, tags, ai_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.id, term, city || null, region || null, country || null, tagsArray, ai_provider || null]
    );
    insertados.push(rows[0]);
  }
  res.json({ inserted: insertados, duplicates: duplicados });
});

app.post("/api/keywords/bulk-tag", async (req, res) => {
  const { keyword_ids, tags } = req.body;
  if (!Array.isArray(keyword_ids) || !keyword_ids.length) return res.status(400).json({ error: "Falta keyword_ids" });
  const tagsArray = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (!tagsArray.length) return res.status(400).json({ error: "Falta tags" });

  // Une las etiquetas nuevas con las que ya tenía cada término, sin duplicar.
  const { rows } = await pool.query(
    `UPDATE keywords
     SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags || $2::text[])))
     WHERE id = ANY($1::int[])
     RETURNING *`,
    [keyword_ids, tagsArray]
  );
  res.json(rows);
});
app.post("/api/keywords/bulk-tag", async (req, res) => {
  const { keyword_ids, tags } = req.body;
  if (!Array.isArray(keyword_ids) || !keyword_ids.length) return res.status(400).json({ error: "Falta keyword_ids" });
  const tagsArray = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (!tagsArray.length) return res.status(400).json({ error: "Falta tags" });

  const { rows } = await pool.query(
    `UPDATE keywords
     SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags || $2::text[])))
     WHERE id = ANY($1::int[])
     RETURNING *`,
    [keyword_ids, tagsArray]
  );
  res.json(rows);
});
app.delete("/api/keywords/:id", async (req, res) => {
  await pool.query("DELETE FROM keywords WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

app.put("/api/keywords/:id", async (req, res) => {
  const { term, city, region, country, tags, ai_provider } = req.body;
  if (!term) return res.status(400).json({ error: "Falta term" });
  const tagsArray = Array.isArray(tags) ? tags.filter(Boolean) : [];

  const actual = await pool.query(`SELECT project_id FROM keywords WHERE id = $1`, [req.params.id]);
  if (!actual.rows.length) return res.status(404).json({ error: "Keyword no encontrada" });
  const projectId = actual.rows[0].project_id;

const dup = await pool.query(
    `SELECT id FROM keywords
     WHERE project_id = $1
       AND lower(trim(term)) = lower(trim($2))
       AND id <> $3
       AND NULLIF(trim(city), '') IS NOT DISTINCT FROM NULLIF(trim($4), '')
       AND NULLIF(trim(country), '') IS NOT DISTINCT FROM NULLIF(trim($5), '')
       AND ai_provider IS NOT DISTINCT FROM $6`,
    [projectId, term, req.params.id, city || null, country || null, ai_provider || null]
  );
  if (dup.rows.length) {
    return res.status(409).json({
      error: `Ese término ya existe en este proyecto con la misma ubicación y proveedor de IA: "${term.trim()}"`,
    });
  }

  const { rows } = await pool.query(
    `UPDATE keywords SET term = $1, city = $2, region = $3, country = $4, tags = $5, ai_provider = $6
     WHERE id = $7 RETURNING *`,
    [term, city || null, region || null, country || null, tagsArray, ai_provider || null, req.params.id]
  );
  res.json(rows[0]);
});

// Correr una keyword manualmente, ya
app.post("/api/keywords/:id/check", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT k.*, p.domain FROM keywords k JOIN projects p ON p.id = k.project_id WHERE k.id = $1`,
    [req.params.id]
  );
  const kw = rows[0];
  if (!kw) return res.status(404).json({ error: "Keyword no encontrada" });

const result = await checkKeyword(
    kw.term,
    kw.domain,
    { city: kw.city, region: kw.region, country: kw.country },
    kw.ai_provider
  );
const inserted = await pool.query(
    `INSERT INTO checks (keyword_id, status, sources, response_text, own_position) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [kw.id, result.status, result.sources, result.responseText || null, result.ownPosition]
  );
  if (result.status === "found") {
    await marcarPrimeraAparicionSiMejoro(kw.id, inserted.rows[0].checked_at);
  }
  res.json(inserted.rows[0]);
});

// Correr TODAS las keywords ahora (botón manual "revisar todo")
app.post("/api/check-all", async (req, res) => {
  res.json({ ok: true, message: "Chequeo iniciado en segundo plano" });
  runAllChecks({ forzarTodo: true }).catch((err) => console.error("[check-all] Error:", err));
});

// Historial de una keyword, para el gráfico
app.get("/api/keywords/:id/history", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT status, checked_at FROM checks WHERE keyword_id = $1 ORDER BY checked_at",
    [req.params.id]
  );
  res.json(rows);
});

// Resumen por proyecto: última visibilidad de cada keyword + serie diaria (% encontrado)
app.get("/api/projects/:id/summary", async (req, res) => {
  const { id } = req.params;

const latest = await pool.query(
    `SELECT DISTINCT ON (k.id) k.id AS keyword_id, k.term, k.city, k.region, k.country, k.tags,
            k.created_at AS added_at, k.first_appeared_at, k.ai_provider,
            c.status, c.checked_at, c.own_position
     FROM keywords k
     LEFT JOIN checks c ON c.keyword_id = k.id
     WHERE k.project_id = $1
     ORDER BY k.id, c.checked_at DESC NULLS LAST`,
    [id]
  );

  const daily = await pool.query(
    `SELECT date_trunc('day', c.checked_at) AS dia,
            ROUND(100.0 * SUM(CASE WHEN c.status = 'found' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct
     FROM checks c
     JOIN keywords k ON k.id = c.keyword_id
     WHERE k.project_id = $1
     GROUP BY dia
     ORDER BY dia`,
    [id]
  );

  res.json({ keywords: latest.rows, dailyVisibility: daily.rows });
});

// Resumen mensual: cuántos términos tenían visibilidad ("found") cada mes,
// usando el último estado registrado de cada término dentro de ese mes.
app.get("/api/projects/:id/monthly-summary", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `WITH estado_mensual AS (
       SELECT k.id AS keyword_id,
              date_trunc('month', c.checked_at) AS mes,
              (array_agg(c.status ORDER BY c.checked_at DESC))[1] AS ultimo_estado
       FROM checks c
       JOIN keywords k ON k.id = c.keyword_id
       WHERE k.project_id = $1
       GROUP BY k.id, date_trunc('month', c.checked_at)
     )
     SELECT mes,
            COUNT(*) AS total_terminos,
            SUM(CASE WHEN ultimo_estado = 'found' THEN 1 ELSE 0 END) AS terminos_con_visibilidad
     FROM estado_mensual
     GROUP BY mes
     ORDER BY mes`,
    [id]
  );
  res.json(rows);
});

// Detalle de la última revisión de un término (para el popup: fuentes + resumen)
app.get("/api/keywords/:id/latest-check", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT status, sources, response_text, checked_at, own_position
     FROM checks WHERE keyword_id = $1
     ORDER BY checked_at DESC LIMIT 1`,
    [req.params.id]
  );
  res.json(rows[0] || null);
});

// Términos que en su revisión más reciente aparecen, pero en la anterior no aparecían
// (para saber qué mejoró desde el último rastreo)
app.get("/api/projects/:id/newly-appeared", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `WITH ranked AS (
       SELECT c.keyword_id, c.status, c.checked_at,
              ROW_NUMBER() OVER (PARTITION BY c.keyword_id ORDER BY c.checked_at DESC) AS rn
       FROM checks c
       JOIN keywords k ON k.id = c.keyword_id
       WHERE k.project_id = $1
     )
     SELECT k.id AS keyword_id, k.term,
            previous.status AS estado_anterior, previous.checked_at AS fecha_anterior,
            latest.status AS estado_actual, latest.checked_at AS fecha_actual
     FROM keywords k
     JOIN ranked latest ON latest.keyword_id = k.id AND latest.rn = 1
     JOIN ranked previous ON previous.keyword_id = k.id AND previous.rn = 2
     WHERE k.project_id = $1
       AND latest.status = 'found'
       AND previous.status = 'not_found'
     ORDER BY latest.checked_at DESC`,
    [id]
  );
  res.json(rows);
});
// Estadísticas generales del proyecto: total de términos, cuántos tienen visibilidad,
// y en qué rango de posición aparecen (según su revisión más reciente)
app.get("/api/projects/:id/stats", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `WITH ultimo AS (
       SELECT DISTINCT ON (k.id) k.id AS keyword_id, c.status, c.own_position
       FROM keywords k
       LEFT JOIN checks c ON c.keyword_id = k.id
       WHERE k.project_id = $1
       ORDER BY k.id, c.checked_at DESC NULLS LAST
     )
     SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'found') AS con_visibilidad,
       COUNT(*) FILTER (WHERE own_position BETWEEN 1 AND 3) AS top_3,
       COUNT(*) FILTER (WHERE own_position BETWEEN 4 AND 10) AS top_4_10,
       COUNT(*) FILTER (WHERE own_position > 10) AS top_11_mas,
       COUNT(*) FILTER (WHERE status = 'found' AND own_position IS NULL) AS mencionado_sin_url
     FROM ultimo`,
    [id]
  );
  res.json(rows[0]);
});
const PORT = process.env.PORT || 3000;

init()
  .then(() => {
    startScheduler();
    app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
  })
  .catch((err) => {
    console.error("Error inicializando la base de datos:", err);
    process.exit(1);
  });