require("dotenv").config();
const express = require("express");
const basicAuth = require("express-basic-auth");
const path = require("path");
const { pool, init } = require("./db");
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
  const { term, city, region, country, tags } = req.body;
  if (!term) return res.status(400).json({ error: "Falta term" });
  const tagsArray = Array.isArray(tags) ? tags.filter(Boolean) : [];
  const { rows } = await pool.query(
    `INSERT INTO keywords (project_id, term, city, region, country, tags)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.params.id, term, city || null, region || null, country || null, tagsArray]
  );
  res.json(rows[0]);
});

app.post("/api/projects/:id/keywords/bulk", async (req, res) => {
  const { terms, city, region, country, tags } = req.body;
  if (!Array.isArray(terms) || !terms.length) return res.status(400).json({ error: "Falta terms (lista)" });
  const tagsArray = Array.isArray(tags) ? tags.filter(Boolean) : [];

  const insertados = [];
  for (const raw of terms) {
    const term = (raw || "").trim();
    if (!term) continue;
    const { rows } = await pool.query(
      `INSERT INTO keywords (project_id, term, city, region, country, tags)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, term, city || null, region || null, country || null, tagsArray]
    );
    insertados.push(rows[0]);
  }
  res.json(insertados);
});

app.delete("/api/keywords/:id", async (req, res) => {
  await pool.query("DELETE FROM keywords WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

app.put("/api/keywords/:id", async (req, res) => {
  const { term, city, region, country, tags } = req.body;
  if (!term) return res.status(400).json({ error: "Falta term" });
  const tagsArray = Array.isArray(tags) ? tags.filter(Boolean) : [];
  const { rows } = await pool.query(
    `UPDATE keywords SET term = $1, city = $2, region = $3, country = $4, tags = $5
     WHERE id = $6 RETURNING *`,
    [term, city || null, region || null, country || null, tagsArray, req.params.id]
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

  const result = await checkKeyword(kw.term, kw.domain, {
    city: kw.city,
    region: kw.region,
    country: kw.country,
  });
  const inserted = await pool.query(
    `INSERT INTO checks (keyword_id, status, sources, response_text) VALUES ($1, $2, $3, $4) RETURNING *`,
    [kw.id, result.status, result.sources, result.responseText || null]
  );
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
            c.status, c.checked_at
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
    `SELECT status, sources, response_text, checked_at
     FROM checks WHERE keyword_id = $1
     ORDER BY checked_at DESC LIMIT 1`,
    [req.params.id]
  );
  res.json(rows[0] || null);
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