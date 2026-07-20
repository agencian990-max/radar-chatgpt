const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Frecuencia de revisión en días (1 = diario, 3 = cada 3 días, 7 = semanal).
  // Se agrega con IF NOT EXISTS para no romper bases de datos ya existentes.
  await pool.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS frequency_days INTEGER NOT NULL DEFAULT 1;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS keywords (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      term TEXT NOT NULL,
      city TEXT,
      region TEXT,
      country TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Etiqueta libre para agrupar/filtrar términos (ej. "productos", "servicios", "competencia")
  await pool.query(`
    ALTER TABLE keywords ADD COLUMN IF NOT EXISTS tag TEXT;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS checks (
      id SERIAL PRIMARY KEY,
      keyword_id INTEGER NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL, -- 'found' | 'not_found' | 'error'
      sources TEXT
    );
  `);
}

module.exports = { pool, init };