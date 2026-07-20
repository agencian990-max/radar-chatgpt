const cron = require("node-cron");
const { pool } = require("./db");
const { checkKeyword } = require("./checker");

async function runAllChecks() {
  const { rows: keywords } = await pool.query(`
    SELECT k.id, k.term, k.city, k.region, k.country, p.domain
    FROM keywords k
    JOIN projects p ON p.id = k.project_id
  `);

  console.log(`[scheduler] Corriendo ${keywords.length} keywords...`);

  for (const kw of keywords) {
    const result = await checkKeyword(kw.term, kw.domain, {
      city: kw.city,
      region: kw.region,
      country: kw.country,
    });
    await pool.query(
      `INSERT INTO checks (keyword_id, status, sources) VALUES ($1, $2, $3)`,
      [kw.id, result.status, result.sources]
    );
    console.log(`[scheduler] "${kw.term}" (${kw.domain}) -> ${result.status}`);
    // Pausa breve entre llamadas para no saturar la API
    await new Promise((r) => setTimeout(r, 2000));
  }
}

function startScheduler() {
  // Todos los días a las 08:00 hora de Lima
  const horario = process.env.CRON_SCHEDULE || "0 8 * * *";
  cron.schedule(horario, () => {
    runAllChecks().catch((err) => console.error("[scheduler] Error:", err));
  }, { timezone: "America/Lima" });

  console.log(`[scheduler] Programado con cron "${horario}" (America/Lima)`);
}

module.exports = { startScheduler, runAllChecks };
