let currentProjectId = null;
let chart = null;
let projectsCache = [];

const projectList = document.getElementById("projectList");
const projectTitle = document.getElementById("projectTitle");
const projectDomain = document.getElementById("projectDomain");
const frequencyControl = document.getElementById("frequencyControl");
const projectFrequencySelect = document.getElementById("projectFrequency");
const chartPanel = document.getElementById("chartPanel");
const keywordsPanel = document.getElementById("keywordsPanel");
const emptyState = document.getElementById("emptyState");
const keywordsBody = document.getElementById("keywordsBody");
const tagFilterSelect = document.getElementById("tagFilterSelect");
const locationFilterSelect = document.getElementById("locationFilterSelect");
let keywordsCache = [];

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
  projectsCache = projects;
  projectList.innerHTML = "";
  projects.forEach((p) => {
    const div = document.createElement("div");
    div.className = "project-item" + (p.id === currentProjectId ? " active" : "");
    renderProjectView(div, p);
    projectList.appendChild(div);
  });

  if (!currentProjectId && projects.length) {
    selectProject(projects[0].id, projects[0].name, projects[0].domain, projects[0].frequency_days);
  }
}

function renderProjectView(div, p) {
  div.innerHTML = `<span class="proj-name">${p.name}</span><span class="proj-actions"><span class="edit" data-id="${p.id}">✎</span><span class="del" data-id="${p.id}">✕</span></span>`;
  div.addEventListener("click", (e) => {
    if (e.target.classList.contains("del") || e.target.classList.contains("edit")) return;
    selectProject(p.id, p.name, p.domain, p.frequency_days);
  });
  div.querySelector(".edit").addEventListener("click", (e) => {
    e.stopPropagation();
    renderProjectEdit(div, p);
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
      frequencyControl.hidden = true;
      projectTitle.textContent = "Selecciona un proyecto";
      projectDomain.textContent = "";
    }
    loadProjects();
  });
}

function renderProjectEdit(div, p) {
  div.innerHTML = `
    <div class="proj-edit-form" onclick="event.stopPropagation()">
      <input type="text" class="proj-edit-name" value="${p.name.replace(/"/g, "&quot;")}" />
      <input type="text" class="proj-edit-domain" value="${p.domain.replace(/"/g, "&quot;")}" />
      <div class="proj-edit-buttons">
        <button type="button" data-action="save">Guardar</button>
        <button type="button" data-action="cancel">Cancelar</button>
      </div>
    </div>`;
  div.querySelector("[data-action='cancel']").addEventListener("click", () => renderProjectView(div, p));
  div.querySelector("[data-action='save']").addEventListener("click", async () => {
    const name = div.querySelector(".proj-edit-name").value.trim();
    const domain = div.querySelector(".proj-edit-domain").value.trim();
    if (!name || !domain) return;
    const updated = await api(`/api/projects/${p.id}`, {
      method: "PUT",
      body: JSON.stringify({ name, domain }),
    });
    if (currentProjectId === p.id) {
      projectTitle.textContent = updated.name;
      projectDomain.textContent = updated.domain;
    }
    await loadProjects();
  });
}

async function selectProject(id, name, domain, frequencyDays) {
  currentProjectId = id;
  projectTitle.textContent = name;
  projectDomain.textContent = domain;
  chartPanel.hidden = false;
  keywordsPanel.hidden = false;
  emptyState.hidden = true;
  frequencyControl.hidden = false;
  projectFrequencySelect.value = String(frequencyDays || 1);
  await loadProjects();
  await loadSummary();
}

const saveFrequencyBtn = document.getElementById("saveFrequencyBtn");
const frequencySaved = document.getElementById("frequencySaved");

saveFrequencyBtn.addEventListener("click", async () => {
  if (!currentProjectId) return;
  saveFrequencyBtn.textContent = "Guardando...";
  try {
    await api(`/api/projects/${currentProjectId}`, {
      method: "PUT",
      body: JSON.stringify({ frequency_days: Number(projectFrequencySelect.value) }),
    });
    frequencySaved.style.display = "inline";
    setTimeout(() => (frequencySaved.style.display = "none"), 2000);
  } catch (err) {
    alert("No se pudo guardar la frecuencia: " + err.message);
  } finally {
    saveFrequencyBtn.textContent = "Guardar";
  }
});

async function loadSummary() {
  if (!currentProjectId) return;
  const { keywords, dailyVisibility } = await api(`/api/projects/${currentProjectId}/summary`);
  keywordsCache = keywords;

  populateFilters(keywords);
  renderKeywordsTable();
  renderChart(dailyVisibility);
}

function populateFilters(keywords) {
  // --- Etiquetas: cada keyword puede tener varias, juntamos todas las que existan ---
  const tagsActuales = new Set();
  keywords.forEach((k) => (k.tags || []).forEach((t) => tagsActuales.add(t)));
  const tagSeleccionado = tagFilterSelect.value;
  tagFilterSelect.innerHTML = '<option value="">Todas</option>';
  [...tagsActuales].sort().forEach((tag) => {
    const opt = document.createElement("option");
    opt.value = tag;
    opt.textContent = tag;
    tagFilterSelect.appendChild(opt);
  });
  if ([...tagsActuales].includes(tagSeleccionado)) tagFilterSelect.value = tagSeleccionado;

  // --- Ubicaciones: usamos la etiqueta legible (Ciudad, PAÍS o "Global") ---
  const ubicacionesActuales = new Set(keywords.map((k) => locationLabel(k)));
  const ubicacionSeleccionada = locationFilterSelect.value;
  locationFilterSelect.innerHTML = '<option value="">Todas</option>';
  [...ubicacionesActuales].sort().forEach((loc) => {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    locationFilterSelect.appendChild(opt);
  });
  if ([...ubicacionesActuales].includes(ubicacionSeleccionada)) locationFilterSelect.value = ubicacionSeleccionada;
}

function renderKeywordsTable() {
  const tagFiltro = tagFilterSelect.value;
  const locFiltro = locationFilterSelect.value;

  const visibles = keywordsCache.filter((k) => {
    const pasaTag = !tagFiltro || (k.tags || []).includes(tagFiltro);
    const pasaLoc = !locFiltro || locationLabel(k) === locFiltro;
    return pasaTag && pasaLoc;
  });

  keywordsBody.innerHTML = "";
  visibles.forEach((k) => {
    const tr = document.createElement("tr");
    tr.dataset.id = k.keyword_id;
    renderViewRow(tr, k);
    keywordsBody.appendChild(tr);
  });
}

tagFilterSelect.addEventListener("change", renderKeywordsTable);
locationFilterSelect.addEventListener("change", renderKeywordsTable);

function locationLabel(k) {
  const parts = [k.city, k.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Global";
}

function renderViewRow(tr, k) {
  const status = k.status || "pending";
  const label = { found: "Aparece", not_found: "No aparece", error: "Error", pending: "Sin revisar" }[status];
  const fecha = k.checked_at ? new Date(k.checked_at).toLocaleString("es-PE") : "—";
  const tags = k.tags || [];
  const tagsHtml = tags.length
    ? tags.map((t) => `<span class="tag-pill">${t}</span>`).join(" ")
    : `<span class="muted">—</span>`;
  tr.innerHTML = `
    <td>${k.term}</td>
    <td>${tagsHtml}</td>
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
  const tagsTexto = (k.tags || []).join(", ");
  tr.innerHTML = `
    <td><input type="text" class="edit-term" value="${k.term.replace(/"/g, "&quot;")}" style="width:100%;" /></td>
    <td><input type="text" class="edit-tags" placeholder="etiqueta1, etiqueta2" value="${tagsTexto}" style="width:140px;" /></td>
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
    const tags = tr.querySelector(".edit-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
    const city = tr.querySelector(".edit-city").value.trim();
    const country = tr.querySelector(".edit-country").value.trim();
    if (!term) return;
    await api(`/api/keywords/${k.keyword_id}`, {
      method: "PUT",
      body: JSON.stringify({ term, tags, city, country }),
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
  const frequency_days = Number(document.getElementById("newProjectFrequency").value);
  if (!name || !domain) return;
  const project = await api("/api/projects", { method: "POST", body: JSON.stringify({ name, domain, frequency_days }) });
  e.target.reset();
  await selectProject(project.id, project.name, project.domain, project.frequency_days);
});

document.getElementById("newKeywordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentProjectId) return;
  const term = document.getElementById("newKeywordTerm").value.trim();
  const city = document.getElementById("newKeywordCity").value.trim();
  const country = document.getElementById("newKeywordCountry").value.trim();
  const tags = document.getElementById("newKeywordTags").value.split(",").map((t) => t.trim()).filter(Boolean);
  if (!term) return;
  await api(`/api/projects/${currentProjectId}/keywords`, {
    method: "POST",
    body: JSON.stringify({ term, city, country, tags }),
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