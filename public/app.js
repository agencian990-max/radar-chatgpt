let currentProjectId = null;
let chart = null;
let projectsCache = [];

const projectList = document.getElementById("projectList");
const projectTitle = document.getElementById("projectTitle");
const projectDomain = document.getElementById("projectDomain");
const frequencyControl = document.getElementById("frequencyControl");
const projectFrequencySelect = document.getElementById("projectFrequency");
const chartsSection = document.getElementById("chartsSection");
const toggleChartsBtn = document.getElementById("toggleChartsBtn");
const chartsToggleIcon = document.getElementById("chartsToggleIcon");
const chartsContainer = document.getElementById("chartsContainer");

toggleChartsBtn.addEventListener("click", () => {
  chartsContainer.classList.toggle("collapsed");
  chartsToggleIcon.classList.toggle("collapsed");
});

const frequencyLegend = document.getElementById("frequencyLegend");
let monthlyBarChart = null;
let growthChart = null;
const keywordsPanel = document.getElementById("keywordsPanel");
const emptyState = document.getElementById("emptyState");
const keywordsBody = document.getElementById("keywordsBody");
const tagFilterSelect = document.getElementById("tagFilterSelect");
const locationFilterSelect = document.getElementById("locationFilterSelect");
let keywordsCache = [];
let selectedKeywordIds = new Set();
let currentlyVisibleIds = [];

const bulkTagBar = document.getElementById("bulkTagBar");
const bulkTagCount = document.getElementById("bulkTagCount");
const bulkTagInput = document.getElementById("bulkTagInput");
const bulkTagApplyBtn = document.getElementById("bulkTagApplyBtn");
const bulkTagCancelBtn = document.getElementById("bulkTagCancelBtn");

function updateBulkTagBar() {
  if (selectedKeywordIds.size === 0) {
    bulkTagBar.hidden = true;
    return;
  }
  bulkTagBar.hidden = false;
  bulkTagCount.textContent = `${selectedKeywordIds.size} seleccionados`;
  renderTagPicker("bulkTagPicker", "bulkTagInput");
}

bulkTagCancelBtn.addEventListener("click", () => {
  selectedKeywordIds.clear();
  renderKeywordsTable();
  updateBulkTagBar();
});

bulkTagApplyBtn.addEventListener("click", async () => {
  const tags = bulkTagInput.value.split(",").map((t) => t.trim()).filter(Boolean);
  if (!tags.length || !selectedKeywordIds.size) return;
  bulkTagApplyBtn.textContent = "Aplicando...";
  try {
    await api("/api/keywords/bulk-tag", {
      method: "POST",
      body: JSON.stringify({ keyword_ids: [...selectedKeywordIds], tags }),
    });
    selectedKeywordIds.clear();
    bulkTagInput.value = "";
    await loadSummary();
    updateBulkTagBar();
  } catch (err) {
    alert("No se pudo aplicar la etiqueta: " + err.message);
  } finally {
    bulkTagApplyBtn.textContent = "Agregar etiqueta a seleccionados";
  }
});

const keywordCountBadge = document.getElementById("keywordCountBadge");
const statsPanel = document.getElementById("statsPanel");
const statsSummaryText = document.getElementById("statsSummaryText");
const statsBarFill = document.getElementById("statsBarFill");

function renderStats(stats) {
  const total = Number(stats.total) || 0;
  const conVisibilidad = Number(stats.con_visibilidad) || 0;
  const pct = total > 0 ? Math.round((conVisibilidad / total) * 100) : 0;

  keywordCountBadge.textContent = `${total} término${total === 1 ? "" : "s"} agregado${total === 1 ? "" : "s"}`;
  keywordCountBadge.hidden = false;

  statsSummaryText.textContent = `De ${total} términos, tienes visibilidad en ${conVisibilidad} (${pct}%).`;
  statsBarFill.style.width = `${pct}%`;

  document.getElementById("statsTop3").textContent = stats.top_3 || 0;
  document.getElementById("statsTop410").textContent = stats.top_4_10 || 0;
  document.getElementById("statsTop11").textContent = stats.top_11_mas || 0;
  document.getElementById("statsMencionSinUrl").textContent = stats.mencionado_sin_url || 0;
  document.getElementById("statsSinVisibilidad").textContent = total - conVisibilidad;
}

const newlyAppearedBanner = document.getElementById("newlyAppearedBanner");
const newlyAppearedTitle = document.getElementById("newlyAppearedTitle");
const newlyAppearedList = document.getElementById("newlyAppearedList");
let newlyAppearedIds = new Set();

function getAllTags() {
  const set = new Set();
  keywordsCache.forEach((k) => (k.tags || []).forEach((t) => set.add(t)));
  return [...set].sort();
}

function addTagToInput(inputEl, tag) {
  const actuales = inputEl.value.split(",").map((t) => t.trim()).filter(Boolean);
  if (actuales.includes(tag)) return; // ya está, no la duplicamos
  actuales.push(tag);
  inputEl.value = actuales.join(", ");
}

function renderTagPicker(containerId, inputId) {
  const container = document.getElementById(containerId);
  const input = document.getElementById(inputId);
  const tags = getAllTags();
  container.innerHTML = "";
  if (!tags.length) return;

  const label = document.createElement("span");
  label.className = "tag-picker-label";
  label.textContent = "Reutilizar:";
  container.appendChild(label);

  tags.forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "tag-picker-pill";
    pill.textContent = tag;
    pill.addEventListener("click", () => addTagToInput(input, tag));
    container.appendChild(pill);
  });
}

function refreshTagPickers() {
  renderTagPicker("newKeywordTagsPicker", "newKeywordTags");
  renderTagPicker("bulkTagsPicker", "bulkTags");
}

const COLUMN_DEFS = [
  { key: "position", label: "Posición", default: true },
  { key: "tags", label: "Etiquetas", default: true },
  { key: "location", label: "Ubicación", default: true },
  { key: "status", label: "Estado actual", default: true },
  { key: "lastCheck", label: "Última revisión", default: true },
  { key: "added", label: "Agregado", default: false },
  { key: "firstAppeared", label: "Primera aparición", default: false },
];

function loadVisibleColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem("radar_visible_columns"));
    if (saved) return saved;
  } catch (e) {}
  const defaults = {};
  COLUMN_DEFS.forEach((c) => (defaults[c.key] = c.default));
  return defaults;
}
let visibleColumns = loadVisibleColumns();
function saveVisibleColumns() {
  localStorage.setItem("radar_visible_columns", JSON.stringify(visibleColumns));
}

const columnsModal = document.getElementById("columnsModal");
const openColumnsBtn = document.getElementById("openColumnsBtn");
const closeColumnsBtn = document.getElementById("closeColumnsBtn");
const columnsToggleList = document.getElementById("columnsToggleList");

openColumnsBtn.addEventListener("click", () => {
  renderColumnsModal();
  columnsModal.hidden = false;
});
closeColumnsBtn.addEventListener("click", () => (columnsModal.hidden = true));
columnsModal.addEventListener("click", (e) => {
  if (e.target === columnsModal) columnsModal.hidden = true;
});

function renderColumnsModal() {
  columnsToggleList.innerHTML = "";
  COLUMN_DEFS.forEach((col) => {
    const pill = document.createElement("span");
    pill.className = "column-toggle-pill" + (visibleColumns[col.key] ? " active" : "");
    pill.textContent = col.label;
    pill.addEventListener("click", () => {
      visibleColumns[col.key] = !visibleColumns[col.key];
      saveVisibleColumns();
      renderColumnsModal();
      renderTableHeader();
      renderKeywordsTable();
    });
    columnsToggleList.appendChild(pill);
  });
}

function renderTableHeader() {
  const tr = document.getElementById("tableHeaderRow");
  let html = `<th><input type="checkbox" id="selectAllCheckbox" class="select-all-checkbox" /></th>`;
  html += "<th>Término</th>";
  COLUMN_DEFS.forEach((col) => {
    if (visibleColumns[col.key]) html += `<th>${col.label}</th>`;
  });
  html += "<th></th>";
  tr.innerHTML = html;

  document.getElementById("selectAllCheckbox").addEventListener("change", (e) => {
    if (e.target.checked) {
      currentlyVisibleIds.forEach((id) => selectedKeywordIds.add(id));
    } else {
      currentlyVisibleIds.forEach((id) => selectedKeywordIds.delete(id));
    }
    renderKeywordsTable();
    updateBulkTagBar();
  });
}
renderTableHeader();

const PERU_CITIES = [
  "Lima", "Arequipa", "Trujillo", "Chiclayo", "Piura", "Iquitos", "Cusco", "Chimbote",
  "Huancayo", "Tacna", "Ica", "Juliaca", "Sullana", "Ayacucho", "Cajamarca", "Pucallpa",
  "Chincha Alta", "Huánuco", "Puno", "Tarapoto", "Tumbes", "Talara", "Jaén", "Huaraz",
  "Cerro de Pasco", "Moquegua", "Abancay", "Moyobamba", "Puerto Maldonado", "Huancavelica",
];

function populateCitySelect(select) {
  select.innerHTML =
    '<option value="">Ciudad (opcional)</option>' +
    PERU_CITIES.map((c) => `<option value="${c}">${c}</option>`).join("");
}

function populateCountrySelect(select) {
  // Por ahora solo Perú; se pueden agregar más países aquí más adelante.
  select.innerHTML = '<option value="PE">Perú</option>';
}

[document.getElementById("newKeywordCity"), document.getElementById("bulkCity")].forEach(populateCitySelect);
[document.getElementById("newKeywordCountry"), document.getElementById("bulkCountry")].forEach(populateCountrySelect);

const toggleBulkBtn = document.getElementById("toggleBulkBtn");
const bulkForm = document.getElementById("bulkForm");
toggleBulkBtn.addEventListener("click", () => {
  bulkForm.hidden = !bulkForm.hidden;
});

document.getElementById("bulkSubmitBtn").addEventListener("click", async (e) => {
  if (!currentProjectId) return;
  const terms = document
    .getElementById("bulkTerms")
    .value.split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!terms.length) return;

  const city = document.getElementById("bulkCity").value;
  const country = document.getElementById("bulkCountry").value;
  const tags = document
    .getElementById("bulkTags")
    .value.split(",")
    .map((t) => t.trim())
    .filter(Boolean);

e.target.textContent = "Agregando...";
  try {
    const resultado = await api(`/api/projects/${currentProjectId}/keywords/bulk`, {
      method: "POST",
      body: JSON.stringify({ terms, city, country, tags }),
    });
    document.getElementById("bulkTerms").value = "";
    document.getElementById("bulkTags").value = "";
    bulkForm.hidden = true;
    await loadSummary();
    if (resultado.duplicates && resultado.duplicates.length) {
      alert(
        `Se agregaron ${resultado.inserted.length} términos.\n` +
        `${resultado.duplicates.length} no se agregaron por estar repetidos:\n` +
        resultado.duplicates.map((t) => `• ${t}`).join("\n")
      );
    }
  } catch (err) {
    alert("No se pudieron agregar los términos: " + err.message);
  } finally {
    e.target.textContent = "Agregar todos";
  }
});

const detailModal = document.getElementById("detailModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalTerm = document.getElementById("modalTerm");
const modalStatus = document.getElementById("modalStatus");
const modalLocation = document.getElementById("modalLocation");
const modalDate = document.getElementById("modalDate");
const modalSources = document.getElementById("modalSources");
const modalSummary = document.getElementById("modalSummary");

function closeDetailModal() {
  detailModal.hidden = true;
}
closeModalBtn.addEventListener("click", closeDetailModal);
detailModal.addEventListener("click", (e) => {
  if (e.target === detailModal) closeDetailModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !detailModal.hidden) closeDetailModal();
});

async function openDetailModal(k) {
  modalTerm.textContent = k.term;
  modalLocation.textContent = locationLabel(k);
  modalSources.innerHTML = "";
  modalSummary.textContent = "Cargando...";
  detailModal.hidden = false;

  document.getElementById("modalAddedAt").textContent = k.added_at
    ? `Agregado: ${new Date(k.added_at).toLocaleDateString("es-PE")}`
    : "";
  document.getElementById("modalFirstAppearedAt").textContent = k.first_appeared_at
    ? `🏅 Empezó a aparecer: ${new Date(k.first_appeared_at).toLocaleDateString("es-PE")}`
    : "";

  try {
    const detalle = await api(`/api/keywords/${k.keyword_id}/latest-check`);
    if (!detalle) {
      modalStatus.textContent = "Sin revisar";
      modalStatus.className = "status-pill pending";
      modalDate.textContent = "";
      modalSummary.textContent = "Este término todavía no se ha revisado.";
      return;
    }

    const label = { found: "Aparece", not_found: "No aparece", error: "Error" }[detalle.status] || detalle.status;
    modalStatus.textContent = label;
    modalStatus.className = `status-pill ${detalle.status}`;
    modalDate.textContent = new Date(detalle.checked_at).toLocaleString("es-PE");

    const dominioProyecto = (projectDomain.textContent || "").trim().toLowerCase();
    const urls = (detalle.sources || "").split(";").map((u) => u.trim()).filter(Boolean);
    if (urls.length) {
      urls.forEach((url) => {
        const esMio = dominioProyecto && url.toLowerCase().includes(dominioProyecto);
        const li = document.createElement("li");
        if (esMio) li.className = "own-source";
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = url;
        li.appendChild(a);
        if (esMio) {
          const badge = document.createElement("span");
          badge.className = "own-source-badge";
          badge.textContent = "Tu sitio";
          li.appendChild(badge);
        }
        modalSources.appendChild(li);
      });
    } else {
      modalSources.innerHTML = `<li class="muted">No se citaron URLs en esta respuesta.</li>`;
    }

    modalSummary.textContent = detalle.response_text
      ? detalle.response_text
      : "No hay texto de respuesta guardado para esta revisión.";
  } catch (err) {
    modalSummary.textContent = "No se pudo cargar el detalle: " + err.message;
  }
}

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let mensaje = `API error ${res.status}`;
    try {
      const cuerpo = await res.json();
      if (cuerpo && cuerpo.error) mensaje = cuerpo.error;
    } catch (e) {}
    throw new Error(mensaje);
  }
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
      statsPanel.hidden = true;
      keywordCountBadge.hidden = true;
      chartsSection.hidden = true;
      keywordsPanel.hidden = true;
      emptyState.hidden = false;
      frequencyControl.hidden = true;
      frequencyLegend.hidden = true;
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
  statsPanel.hidden = false;
  chartsSection.hidden = false;
  keywordsPanel.hidden = false;
  emptyState.hidden = true;
  frequencyControl.hidden = false;
  projectFrequencySelect.value = String(frequencyDays || 1);
  updateFrequencyLegend();
  await loadProjects();
  await loadSummary();
}

const LEYENDAS_FRECUENCIA = {
  1: "Se revisa todos los días a las 8:00 am (hora de Lima).",
  3: "Se revisa cada 3 días a las 8:00 am (hora de Lima), en un ciclo que arranca en lunes (ej. lunes, jueves, domingo, miércoles...).",
  7: "Se revisa una vez por semana, los domingos a las 8:00 am (hora de Lima).",
};

function updateFrequencyLegend() {
  frequencyLegend.textContent = LEYENDAS_FRECUENCIA[Number(projectFrequencySelect.value)] || "";
  frequencyLegend.hidden = false;
}

projectFrequencySelect.addEventListener("change", updateFrequencyLegend);

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
  const [{ keywords, dailyVisibility }, monthly, newlyAppeared, stats] = await Promise.all([
    api(`/api/projects/${currentProjectId}/summary`),
    api(`/api/projects/${currentProjectId}/monthly-summary`),
    api(`/api/projects/${currentProjectId}/newly-appeared`),
    api(`/api/projects/${currentProjectId}/stats`),
  ]);
  keywordsCache = keywords;
  refreshTagPickers();

  renderStats(stats);

  newlyAppearedIds = new Set(newlyAppeared.map((n) => n.keyword_id));
  renderNewlyAppearedBanner(newlyAppeared);

  renderTableHeader();
  populateFilters(keywords);
  renderKeywordsTable();
  renderChart(dailyVisibility);
  renderMonthlyBarChart(monthly);
  renderGrowthChart(monthly);
}

function renderNewlyAppearedBanner(newlyAppeared) {
  if (!newlyAppeared.length) {
    newlyAppearedBanner.hidden = true;
    return;
  }
  newlyAppearedBanner.hidden = false;
  const plural = newlyAppeared.length === 1 ? "término empezó" : "términos empezaron";
  newlyAppearedTitle.textContent = `${newlyAppeared.length} ${plural} a aparecer desde tu última revisión anterior:`;
  newlyAppearedList.innerHTML = newlyAppeared
    .map((n) => `<span>• ${n.term}</span>`)
    .join("");
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
  currentlyVisibleIds = visibles.map((k) => k.keyword_id);

  keywordsBody.innerHTML = "";
  visibles.forEach((k) => {
    const tr = document.createElement("tr");
    tr.dataset.id = k.keyword_id;
    renderViewRow(tr, k);
    keywordsBody.appendChild(tr);
  });

  const selectAllCheckbox = document.getElementById("selectAllCheckbox");
  if (selectAllCheckbox) {
    selectAllCheckbox.checked =
      currentlyVisibleIds.length > 0 && currentlyVisibleIds.every((id) => selectedKeywordIds.has(id));
  }
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
  const addedFecha = k.added_at ? new Date(k.added_at).toLocaleDateString("es-PE") : "—";
  const firstAppearedFecha = k.first_appeared_at ? new Date(k.first_appeared_at).toLocaleDateString("es-PE") : "—";
  const tags = k.tags || [];
  const tagsHtml = tags.length
    ? tags.map((t) => `<span class="tag-pill">${t}</span>`).join(" ")
    : `<span class="muted">—</span>`;
  const esNuevo = newlyAppearedIds.has(k.keyword_id);
  const tieneMedalla = !!k.first_appeared_at;
  const statusHtml = `
    <span class="status-pill-wrap">
      <span class="status-pill ${status}">${label}</span>
      ${esNuevo ? '<span class="new-badge">↑ Nuevo</span>' : ""}
    </span>`;

  const cellsByKey = {
    position: `<td class="mono">${k.own_position ? `#${k.own_position}` : "—"}</td>`,
    tags: `<td>${tagsHtml}</td>`,
    location: `<td class="mono">${locationLabel(k)}</td>`,
    status: `<td>${statusHtml}</td>`,
    lastCheck: `<td class="mono">${fecha}</td>`,
    added: `<td class="mono">${addedFecha}</td>`,
    firstAppeared: `<td class="mono">${firstAppearedFecha}</td>`,
  };

  const medalla = tieneMedalla
    ? `<span class="medal-badge" title="Empezó a aparecer el ${firstAppearedFecha}, tras no aparecer antes">🏅</span>`
    : "";

  let rowHtml = `<td><input type="checkbox" class="row-select" ${selectedKeywordIds.has(k.keyword_id) ? "checked" : ""} /></td>`;
  rowHtml += `<td><span class="term-link" data-action="open-detail">${k.term}</span>${medalla}</td>`;
  COLUMN_DEFS.forEach((col) => {
    if (visibleColumns[col.key]) rowHtml += cellsByKey[col.key];
  });
  rowHtml += `
    <td class="row-actions">
      <button data-action="check">Revisar</button>
      <button data-action="edit">Editar</button>
      <button data-action="delete">Eliminar</button>
    </td>`;
  tr.innerHTML = rowHtml;

  tr.querySelector(".row-select").addEventListener("change", (e) => {
    if (e.target.checked) selectedKeywordIds.add(k.keyword_id);
    else selectedKeywordIds.delete(k.keyword_id);
    updateBulkTagBar();
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    if (selectAllCheckbox) {
      selectAllCheckbox.checked =
        currentlyVisibleIds.length > 0 && currentlyVisibleIds.every((id) => selectedKeywordIds.has(id));
    }
  });

  tr.querySelector("[data-action='open-detail']").addEventListener("click", () => openDetailModal(k));

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
  const totalCols = 3 + COLUMN_DEFS.filter((c) => visibleColumns[c.key]).length;
  tr.innerHTML = `
    <td colspan="${totalCols}">
      <div class="edit-inline-form">
        <input type="text" class="edit-term" value="${k.term.replace(/"/g, "&quot;")}" style="flex:2; min-width:200px;" />
        <input type="text" class="edit-tags" placeholder="etiqueta1, etiqueta2" value="${tagsTexto}" style="flex:1; min-width:140px;" />
        <input type="text" class="edit-city" placeholder="Ciudad" value="${k.city || ""}" style="width:110px;" />
        <input type="text" class="edit-country" placeholder="País ISO2" maxlength="2" value="${k.country || ""}" style="width:70px;" />
        <button type="button" data-action="save">Guardar</button>
        <button type="button" data-action="cancel">Cancelar</button>
      </div>
    </td>`;

  tr.querySelector("[data-action='cancel']").addEventListener("click", () => renderViewRow(tr, k));
tr.querySelector("[data-action='save']").addEventListener("click", async () => {
    const term = tr.querySelector(".edit-term").value.trim();
    const tags = tr.querySelector(".edit-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
    const city = tr.querySelector(".edit-city").value.trim();
    const country = tr.querySelector(".edit-country").value.trim();
    if (!term) return;
    try {
      await api(`/api/keywords/${k.keyword_id}`, {
        method: "PUT",
        body: JSON.stringify({ term, tags, city, country }),
      });
      await loadSummary();
    } catch (err) {
      alert(err.message);
    }
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

function mesLabel(mesISO) {
  const d = new Date(mesISO);
  return d.toLocaleDateString("es-PE", { month: "short", year: "numeric" });
}

function renderMonthlyBarChart(monthly) {
  const ctx = document.getElementById("monthlyBarChart");
  const labels = monthly.map((m) => mesLabel(m.mes));
  const data = monthly.map((m) => Number(m.terminos_con_visibilidad));

  if (monthlyBarChart) monthlyBarChart.destroy();
  monthlyBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Términos con visibilidad",
        data,
        backgroundColor: "#38bdf8",
        borderRadius: 6,
      }],
    },
    options: {
      scales: {
        y: { beginAtZero: true, ticks: { color: "#7e93a8", precision: 0 }, grid: { color: "#1a2534" } },
        x: { ticks: { color: "#7e93a8" }, grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderGrowthChart(monthly) {
  const ctx = document.getElementById("growthChart");
  const labels = monthly.map((m) => mesLabel(m.mes));
  const data = monthly.map((m) => Number(m.terminos_con_visibilidad));

  if (growthChart) growthChart.destroy();
  growthChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Términos con visibilidad (tendencia)",
        data,
        borderColor: "#34d399",
        backgroundColor: "rgba(52,211,153,0.12)",
        tension: 0.35,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: "#34d399",
      }],
    },
    options: {
      scales: {
        y: { beginAtZero: true, ticks: { color: "#7e93a8", precision: 0 }, grid: { color: "#1a2534" } },
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
  try {
    await api(`/api/projects/${currentProjectId}/keywords`, {
      method: "POST",
      body: JSON.stringify({ term, city, country, tags }),
    });
    e.target.reset();
    await loadSummary();
  } catch (err) {
    alert(err.message);
  }
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