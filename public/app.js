let currentProjectId = null;
let chart = null;

const projectList = document.getElementById("projectList");
const projectTitle = document.getElementById("projectTitle");
const projectDomain = document.getElementById("projectDomain");
const chartPanel = document.getElementById("chartPanel");
const keywordsPanel = document.getElementById("keywordsPanel");
const emptyState = document.getElementById("emptyState");
const keywordsBody = document.getElementById("keywordsBody");

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function loadProjects() {
  const projects = await api("/api/projects");
  projectList.innerHTML = "";
  projects.forEach((p) => {
    const div = document.createElement("div");
    div.className = "project-item" + (p.id === currentProjectId ? " active" : "");
    div.innerHTML = `<span>${p.name}</span><span class="del" data-id="${p.id}">✕</span>`;
    div.addEventListener("click", (e) => {
      if (e.target.classList.contains("del")) return;
      selectProject(p.id, p.name, p.domain);
    });
    div.querySelector(".del").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`¿Eliminar el proyecto "${p.name}" y todo su historial?`)) return;
      await api(`/api/projects/${p.id}`, { method: "DELETE" });
      if (currentProjectId === p.id) {
        currentProjectId = null;
        chartPanel.hidden = true;
        keywordsPanel.hidden = true;
        emptyState.hidden = false;
        projectTitle.textContent = "Selecciona un proyecto";
        projectDomain.textContent = "";
      }
      loadProjects();
    });
    projectList.appendChild(div);
  });

  if (!currentProjectId && projects.length) {
    selectProject(projects[0].id, projects[0].name, projects[0].domain);
  }
}

async function selectProject(id, name, domain) {
  currentProjectId = id;
  projectTitle.textContent = name;
  projectDomain.textContent = domain;
  chartPanel.hidden = false;
  keywordsPanel.hidden = false;
  emptyState.hidden = true;
  await loadProjects();
  await loadSummary();
}

async function loadSummary() {
  if (!currentProjectId) return;
  const { keywords, dailyVisibility } = await api(`/api/projects/${currentProjectId}/summary`);

  keywordsBody.innerHTML = "";
  keywords.forEach((k) => {
    const tr = document.createElement("tr");
    tr.dataset.id = k.keyword_id;
    renderViewRow(tr, k);
    keywordsBody.appendChild(tr);
  });

  renderChart(dailyVisibility);
}

function locationLabel(k) {
  const parts = [k.city, k.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Global";
}

function renderViewRow(tr, k) {
  const status = k.status || "pending";
  const label = { found: "Aparece", not_found: "No aparece", error: "Error", pending: "Sin revisar" }[status];
  const fecha = k.checked_at ? new Date(k.checked_at).toLocaleString("es-PE") : "—";
  tr.innerHTML = `
    <td>${k.term}</td>
    <td class="mono">${locationLabel(k)}</td>
    <td><span class="status-pill ${status}">${label}</span></td>
    <td class="mono">${fecha}</td>
    <td class="row-actions">
      <button data-action="check">Revisar</button>
      <button data-action="edit">Editar</button>
      <button data-action="delete">Eliminar</button>
    </td>`;

  tr.querySelector("[data-action='check']").addEventListener("click", async (e) => {
    e.target.textContent = "...";
    await api(`/api/keywords/${k.keyword_id}/check`, { method: "POST" });
    await loadSummary();
  });
  tr.querySelector("[data-action='edit']").addEventListener("click", () => renderEditRow(tr, k));
  tr.querySelector("[data-action='delete']").addEventListener("click", async () => {
    if (!confirm("¿Eliminar este término y su historial?")) return;
    await api(`/api/keywords/${k.keyword_id}`, { method: "DELETE" });
    await loadSummary();
  });
}

function renderEditRow(tr, k) {
  tr.innerHTML = `
    <td><input type="text" class="edit-term" value="${k.term.replace(/"/g, "&quot;")}" style="width:100%;" /></td>
    <td colspan="2">
      <div style="display:flex; gap:6px;">
        <input type="text" class="edit-city" placeholder="Ciudad" value="${k.city || ""}" style="width:100px;" />
        <input type="text" class="edit-country" placeholder="País ISO2" maxlength="2" value="${k.country || ""}" style="width:70px;" />
      </div>
    </td>
    <td></td>
    <td class="row-actions">
      <button data-action="save">Guardar</button>
      <button data-action="cancel">Cancelar</button>
    </td>`;

  tr.querySelector("[data-action='cancel']").addEventListener("click", () => renderViewRow(tr, k));
  tr.querySelector("[data-action='save']").addEventListener("click", async () => {
    const term = tr.querySelector(".edit-term").value.trim();
    const city = tr.querySelector(".edit-city").value.trim();
    const country = tr.querySelector(".edit-country").value.trim();
    if (!term) return;
    await api(`/api/keywords/${k.keyword_id}`, {
      method: "PUT",
      body: JSON.stringify({ term, city, country }),
    });
    await loadSummary();
  });
}

function renderChart(daily) {
  const ctx = document.getElementById("visibilityChart");
  const labels = daily.map((d) => new Date(d.dia).toLocaleDateString("es-PE"));
  const data = daily.map((d) => Number(d.pct));

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "% de términos donde apareces",
        data,
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56,189,248,0.12)",
        tension: 0.3,
        fill: true,
        pointRadius: 3,
      }],
    },
    options: {
      scales: {
        y: { min: 0, max: 100, ticks: { color: "#7e93a8" }, grid: { color: "#1a2534" } },
        x: { ticks: { color: "#7e93a8" }, grid: { display: false } },
      },
      plugins: { legend: { labels: { color: "#e7edf3" } } },
    },
  });
}

document.getElementById("newProjectForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("newProjectName").value.trim();
  const domain = document.getElementById("newProjectDomain").value.trim();
  if (!name || !domain) return;
  const project = await api("/api/projects", { method: "POST", body: JSON.stringify({ name, domain }) });
  e.target.reset();
  await selectProject(project.id, project.name, project.domain);
});

document.getElementById("newKeywordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentProjectId) return;
  const term = document.getElementById("newKeywordTerm").value.trim();
  const city = document.getElementById("newKeywordCity").value.trim();
  const country = document.getElementById("newKeywordCountry").value.trim();
  if (!term) return;
  await api(`/api/projects/${currentProjectId}/keywords`, {
    method: "POST",
    body: JSON.stringify({ term, city, country }),
  });
  e.target.reset();
  await loadSummary();
});

document.getElementById("checkAllBtn").addEventListener("click", async (e) => {
  e.target.textContent = "Revisando...";
  await api("/api/check-all", { method: "POST" });
  setTimeout(() => {
    e.target.textContent = "Revisar ahora";
    loadSummary();
  }, 5000);
});

loadProjects();