const MODELO = process.env.OPENAI_MODEL || "gpt-4.1";

async function consultarChatGPT(termino, ubicacion) {
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
      model: MODELO,
      input: termino,
      tools: [tool],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${text}`);
  }
  return resp.json();
}

function extraerTextoYFuentes(data) {
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

function apareceDominio(texto, fuentes, dominio) {
  const d = dominio.toLowerCase();
  if (texto.toLowerCase().includes(d)) return true;
  return fuentes.some((f) => f.toLowerCase().includes(d));
}

// Corre una consulta para una keyword y devuelve { status, sources, responseText }
async function checkKeyword(termino, dominio, ubicacion) {
  try {
    const data = await consultarChatGPT(termino, ubicacion);
    const { texto, fuentes } = extraerTextoYFuentes(data);
    const found = apareceDominio(texto, fuentes, dominio);
    return {
      status: found ? "found" : "not_found",
      sources: fuentes.join("; "),
      responseText: texto,
    };
  } catch (err) {
    return { status: "error", sources: String(err.message || err), responseText: "" };
  }
}

module.exports = { checkKeyword };