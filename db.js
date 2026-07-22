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
  // Etiquetas múltiples por término, como lista (ej. ["productos", "competencia"])
  await pool.query(`
    ALTER TABLE keywords ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
  `);
  // Fecha en la que el término empezó a aparecer citado, DESPUÉS de no haber aparecido
  // en una revisión anterior (para la medalla de "mejoró"). Null = nunca hubo esa transición.
  await pool.query(`
    ALTER TABLE keywords ADD COLUMN IF NOT EXISTS first_appeared_at TIMESTAMPTZ;
  `);
  // Migrar datos de la columna vieja "tag" (un solo valor) a la nueva "tags" (lista), si existe
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keywords' AND column_name='tag') THEN
        UPDATE keywords
        SET tags = ARRAY[tag]
        WHERE tag IS NOT NULL AND tag <> '' AND (array_length(tags, 1) IS NULL);
      END IF;
    END $$;
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
// Texto completo de la respuesta de ChatGPT, para mostrar el detalle/resumen en el popup
  await pool.query(`
    ALTER TABLE checks ADD COLUMN IF NOT EXISTS response_text TEXT;
  `);
  // Posición (1, 2, 3...) en la que aparece tu dominio dentro de las fuentes citadas, sin duplicados.
  // Null = no aparece citado como fuente en esa revisión.
  await pool.query(`
    ALTER TABLE checks ADD COLUMN IF NOT EXISTS own_position INTEGER;
  `);
}

// Si este término tiene una revisión anterior en 'not_found' y ahora aparece,
// guarda (una sola vez) la fecha en la que empezó a aparecer -> es la "medalla".
async function marcarPrimeraAparicionSiMejoro(keywordId, checkedAt) {
  await pool.query(
    `UPDATE keywords k
     SET first_appeared_at = $2
     WHERE k.id = $1
       AND k.first_appeared_at IS NULL
       AND EXISTS (
         SELECT 1 FROM checks c2
         WHERE c2.keyword_id = k.id AND c2.status = 'not_found' AND c2.checked_at < $2
       )`,
    [keywordId, checkedAt]
  );
}

module.exports = { pool, init, marcarPrimeraAparicionSiMejoro };