// --- Proveedor de IA: "openai" (por defecto) o "openrouter" ---
// Se controla con la variable de entorno AI_PROVIDER en Render.
const PROVEEDOR = (process.env.AI_PROVIDER || "openai").toLowerCase();

const MODELO_OPENAI = process.env.OPENAI_MODEL || "gpt-4.1";
// Modelo de OpenRouter, con ":online" activa la búsqueda web (plugin Exa).
const MODELO_OPENROUTER = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini:online";

// ---------- OpenAI directo ----------
async function consultarOpenAI(termino, ubicacion) {
  const tool = { type: "web_search" };
  if (ubicacion && (ubicacion.city || ubicacion.region || ubicacion.country)) {
    tool.user_location = {
      type: "approximate",
      ...(ubicacion.country ? { country: ubicacion.country } : {}),
      ...(ubicacion.city ? { city: ubicacion.city } : {}),
      ...(ubicacion.region ? { region: ubicacion.region } : {}),
    };
  }

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO_OPENAI,
      input: termino,
      tools: [tool],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${text}`);
  }
  const data = await resp.json();

  const texto = data.output_text || "";
  const fuentes = [];
  for (const item of data.output || []) {
    if (item.type === "message") {
      for (const c of item.content || []) {
        for (const ann of c.annotations || []) {
          if (ann.type === "url_citation" && ann.url) fuentes.push(ann.url);
        }
      }
    }
  }
  return { texto, fuentes };
}

// ---------- OpenRouter ----------
async function consultarOpenRouter(termino, ubicacion) {
  // OpenRouter no tiene un parámetro nativo de ubicación como OpenAI,
  // así que la incorporamos como contexto dentro del mensaje.
  let mensaje = termino;
  if (ubicacion && (ubicacion.city || ubicacion.country)) {
    const partes = [ubicacion.city, ubicacion.country].filter(Boolean).join(", ");
    mensaje = `${termino} (la búsqueda debe considerar la ubicación: ${partes})`;
  }

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://radar-chatgpt.onrender.com",
      "X-Title": "Radar - Visibilidad en ChatGPT",
    },
    body: JSON.stringify({
      model: MODELO_OPENROUTER.replace(/:online$/, ""), // quitamos ":online", usamos el plugin explícito de abajo
      messages: [{ role: "user", content: mensaje }],
      plugins: [
        {
          id: "web",
          max_results: Number(process.env.OPENROUTER_MAX_RESULTS || 2), // menos resultados = menos tokens = menos costo
        },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${text}`);
  }
  const data = await resp.json();

  const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
  const texto = msg.content || "";
  const fuentes = (msg.annotations || [])
    .filter((a) => a.type === "url_citation" && a.url_citation && a.url_citation.url)
    .map((a) => a.url_citation.url);

  return { texto, fuentes };
}

// Corre una consulta para una keyword y devuelve { status, sources, responseText, ownPosition }
async function checkKeyword(termino, dominio, ubicacion) {
  try {
    const { texto, fuentes } =
      PROVEEDOR === "openrouter"
        ? await consultarOpenRouter(termino, ubicacion)
        : await consultarOpenAI(termino, ubicacion);

    const fuentesUnicas = [...new Set(fuentes)]; // quita URLs repetidas, conserva el orden de aparición

    const d = dominio.toLowerCase();
    const posicionIndex = fuentesUnicas.findIndex((f) => f.toLowerCase().includes(d));
    const found = texto.toLowerCase().includes(d) || posicionIndex !== -1;

    return {
      status: found ? "found" : "not_found",
      sources: fuentesUnicas.join("; "),
      responseText: texto,
      ownPosition: posicionIndex !== -1 ? posicionIndex + 1 : null,
    };
  } catch (err) {
    return { status: "error", sources: String(err.message || err), responseText: "", ownPosition: null };
  }
}

module.exports = { checkKeyword };