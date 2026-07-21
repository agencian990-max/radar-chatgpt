const cron = require("node-cron");
const { pool, marcarPrimeraAparicionSiMejoro } = require("./db");
const { checkKeyword } = require("./checker");

// Lunes de referencia para calcular el ciclo de "cada 3 días" (cualquier lunes sirve como ancla)
const LUNES_REFERENCIA = new Date("2024-01-01T00:00:00Z"); // ese día fue lunes

function debeRevisarHoy(frequencyDays, ahora = new Date()) {
  if (frequencyDays === 1) return true; // diario: siempre

  if (frequencyDays === 7) {
    return ahora.getDay() === 0; // domingo
  }

  if (frequencyDays === 3) {
    const dias = Math.floor((ahora - LUNES_REFERENCIA) / 86400000);
    return dias % 3 === 0; // cae en lunes, jueves, domingo, miércoles... (ciclo de 3 desde un lunes)
  }

  return true; // por si acaso hay otra frecuencia no contemplada
}

async function runAllChecks({ forzarTodo = false } = {}) {
  const { rows: keywords } = await pool.query(`
    SELECT k.id, k.term, k.city, k.region, k.country, p.domain, p.frequency_days,
           (SELECT MAX(c.checked_at) FROM checks c WHERE c.keyword_id = k.id) AS last_checked
    FROM keywords k
    JOIN projects p ON p.id = k.project_id
  `);

  const ahora = new Date();
  const pendientes = forzarTodo
    ? keywords
    : keywords.filter((kw) => {
        if (!kw.last_checked) return true; // nunca se revisó, siempre entra (primera revisión)
        return debeRevisarHoy(kw.frequency_days, ahora);
      });

  console.log(`[scheduler] ${pendientes.length} de ${keywords.length} keywords a revisar (forzarTodo=${forzarTodo}).`);

  for (const kw of pendientes) {
    const result = await checkKeyword(kw.term, kw.domain, {
      city: kw.city,
      region: kw.region,
      country: kw.country,
    });
    const inserted = await pool.query(
      `INSERT INTO checks (keyword_id, status, sources, response_text) VALUES ($1, $2, $3, $4) RETURNING checked_at`,
      [kw.id, result.status, result.sources, result.responseText || null]
    );
    if (result.status === "found") {
      await marcarPrimeraAparicionSiMejoro(kw.id, inserted.rows[0].checked_at);
    }
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