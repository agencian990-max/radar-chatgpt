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
    const status = k.status || "pending";
    const label = { found: "Aparece", not_found: "No aparece", error: "Error", pending: "Sin revisar" }[status];
    const fecha = k.checked_at ? new Date(k.checked_at).toLocaleString("es-PE") : "—";
    tr.innerHTML = `
      <td>${k.term}</td>
      <td><span class="status-pill ${status}">${label}</span></td>
      <td class="mono">${fecha}</td>
      <td class="row-actions">
        <button data-action="check" data-id="${k.keyword_id}">Revisar</button>
        <button data-action="delete" data-id="${k.keyword_id}">Eliminar</button>
      </td>`;
    keywordsBody.appendChild(tr);
  });

  keywordsBody.querySelectorAll("[data-action='check']").forEach((btn) =>
    btn.addEventListener("click", async () => {
      btn.textContent = "...";
      await api(`/api/keywords/${btn.dataset.id}/check`, { method: "POST" });
      await loadSummary();
    })
  );
  keywordsBody.querySelectorAll("[data-action='delete']").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este término y su historial?")) return;
      await api(`/api/keywords/${btn.dataset.id}`, { method: "DELETE" });
      await loadSummary();
    })
  );

  renderChart(dailyVisibility);
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
