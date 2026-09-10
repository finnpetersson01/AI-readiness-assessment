const projects = [];
const catalog = window.REQUIREMENT_CATALOG_DATA?.requirements || [];
const catalogById = new Map(catalog.map((requirement) => [requirement.id, requirement]));
const variantParentRequirementIds = new Set(
  catalog.map((requirement) => requirement.parent_requirement_id).filter(Boolean)
);
const scales = window.RESPONSE_SCALE_DATA?.scales || [];
const scalesById = new Map(scales.map((scale) => [scale.id, scale]));
const referenceProfiles = window.DEMO_REQUIREMENT_COVERAGE?.profiles || [];
const referenceProfileByProject = new Map(referenceProfiles.map((profile) => [profile.project_id, profile]));
const libraryDedupLlmConfig = window.LIBRARY_DEDUP_LLM_CONFIG || { enabled: false, endpoint: "", model: "", transport: "proxy" };

const requirementProfiles = {};
const confirmedProjects = new Set();
const answers = {};
const libraryDrafts = {};
const libraryDedupReviews = {};
const requirementSelectionMeta = {};
const requirementLlmState = {
  status: "checking",
  models: [],
  requirementsModel: localStorage.getItem("project-readiness-requirements-model") || "",
  ratingModel: localStorage.getItem("project-readiness-rating-model") || "",
  message: "Checking the local LiteLLM connector.",
  generationStartedAt: null,
  generationStage: ""
};
const assessmentAssistantState = {
  projectId: "",
  mappingId: "",
  loading: false,
  suggestion: null
};
let activeReviewProjectId = null;
let activeAssessmentProjectId = null;
let activeLibraryProjectId = null;
let customRequirementCounter = 0;
let generationTimerId = null;
let generationAbortController = null;
let generationFallbackRequested = false;
const generationHistoryStorageKey = "project-readiness-generation-history";

const elements = {
  navItems: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".view"),
  demo: document.getElementById("loadDemo"),
  projectFileInput: document.getElementById("projectFileInput"),
  chooseProjectFiles: document.getElementById("chooseProjectFiles"),
  openDemoFolder: document.getElementById("openDemoFolder"),
  projectUploadZone: document.getElementById("projectUploadZone"),
  projectImportStatus: document.getElementById("projectImportStatus"),
  continue: document.getElementById("continueToCards"),
  continueToRequirements: document.getElementById("continueToRequirements"),
  openReview: document.getElementById("openReview"),
  addConsultantRequirement: document.getElementById("addConsultantRequirement"),
  confirmCurrentProfile: document.getElementById("confirmCurrentProfile"),
  continueToAssessment: document.getElementById("continueToAssessment"),
  loadDemoAnswers: document.getElementById("loadDemoAnswers"),
  calculateResults: document.getElementById("calculateResults"),
  backToAssessment: document.getElementById("backToAssessment"),
  openLibraryEntry: document.getElementById("openLibraryEntry"),
  resetLibraryDraft: document.getElementById("resetLibraryDraft"),
  exportLibraryEntry: document.getElementById("exportLibraryEntry"),
  list: document.getElementById("projectList"),
  cards: document.getElementById("normalizedProjectCards"),
  selectionSummary: document.getElementById("requirementSelectionSummary"),
  requirementLlmStatus: document.getElementById("requirementLlmStatus"),
  requirementGenerationProject: document.getElementById("requirementGenerationProject"),
  refreshRequirementModels: document.getElementById("refreshRequirementModels"),
  generateRequirements: document.getElementById("generateRequirements"),
  cancelRequirementGeneration: document.getElementById("cancelRequirementGeneration"),
  restoreReferenceProfile: document.getElementById("restoreReferenceProfile"),
  requirementGenerationMessage: document.getElementById("requirementGenerationMessage"),
  requirementGenerationProgress: document.getElementById("requirementGenerationProgress"),
  requirementGenerationStage: document.getElementById("requirementGenerationStage"),
  requirementGenerationTimer: document.getElementById("requirementGenerationTimer"),
  requirementGenerationEstimate: document.getElementById("requirementGenerationEstimate"),
  reviewTabs: document.getElementById("reviewProjectTabs"),
  reviewStatus: document.getElementById("reviewStatusBar"),
  reviewList: document.getElementById("requirementReviewList"),
  assessmentTabs: document.getElementById("assessmentProjectTabs"),
  assessmentProgress: document.getElementById("assessmentProgress"),
  assessmentList: document.getElementById("assessmentQuestionList"),
  assistantModal: document.getElementById("assessmentAssistantModal"),
  assistantRequirement: document.getElementById("assessmentAssistantRequirement"),
  assistantContext: document.getElementById("assessmentAssistantContext"),
  assistantStatus: document.getElementById("assessmentAssistantStatus"),
  assistantResult: document.getElementById("assessmentAssistantResult"),
  assistantFollowUp: document.getElementById("assessmentAssistantFollowUp"),
  assistantFollowUpContext: document.getElementById("assessmentAssistantFollowUpContext"),
  assistantRefine: document.getElementById("refineAssessmentSuggestion"),
  assistantRequest: document.getElementById("requestAssessmentSuggestion"),
  assistantApply: document.getElementById("applyAssessmentSuggestion"),
  assistantClose: document.getElementById("closeAssessmentAssistant"),
  results: document.getElementById("resultSummary"),
  libraryTabs: document.getElementById("libraryProjectTabs"),
  libraryStatus: document.getElementById("libraryStatusBar"),
  libraryEditor: document.getElementById("libraryEditor"),
  catalogOverview: document.getElementById("catalogOverview"),
  useCaseCatalogList: document.getElementById("useCaseCatalogList"),
  catalogSearch: document.getElementById("catalogSearch"),
  catalogCategory: document.getElementById("catalogCategory"),
  catalogType: document.getElementById("catalogType"),
  clearCatalogFilters: document.getElementById("clearCatalogFilters"),
  catalogResultSummary: document.getElementById("catalogResultSummary"),
  requirementCatalogList: document.getElementById("requirementCatalogList"),
  listStatus: document.getElementById("projectListStatus"),
  count: document.getElementById("projectCount"),
  progress: document.getElementById("workflowProgress"),
  workflowStatus: document.getElementById("workflowStatus"),
  workspaceStage: document.getElementById("workspaceStage"),
  workspaceProjectSummary: document.getElementById("workspaceProjectSummary"),
  openModelSettings: document.getElementById("openModelSettings"),
  modelSettingsModal: document.getElementById("modelSettingsModal"),
  closeModelSettings: document.getElementById("closeModelSettings"),
  doneModelSettings: document.getElementById("doneModelSettings"),
  settingsConnectionStatus: document.getElementById("settingsConnectionStatus"),
  settingsConnectionMessage: document.getElementById("settingsConnectionMessage"),
  settingsRequirementModel: document.getElementById("settingsRequirementModel"),
  settingsRatingModel: document.getElementById("settingsRatingModel"),
  themeToggle: document.getElementById("themeToggle"),
  intakeHint: document.getElementById("intakeHint")
};

const importanceWeights = { supporting: 1, important: 2, critical: 3 };
const importanceLabels = { supporting: "Supporting", important: "Important", critical: "Critical" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    "\"": "&quot;"
  }[character]));
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  elements.themeToggle.setAttribute("aria-pressed", String(dark));
  elements.themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  localStorage.setItem("project-readiness-theme", dark ? "dark" : "light");
}

function modelDisplayName(model) {
  const labels = {
    "openai/gpt-5.6-sol": "GPT SOL",
    "EU_anthropic_claude_opus_4.8": "Claude Opus 4.8",
    "openai/gpt-5.6-luna": "GPT Luna",
    "EU_anthropic_claude_sonnet_4.6": "Claude Sonnet 4.6",
    "EU_anthropic_claude-haiku_4.5": "Claude Haiku 4.5"
  };
  return labels[model] || model;
}

function renderModelSettings() {
  const ready = requirementLlmState.status === "ready" && requirementLlmState.models.length > 0;
  const busy = ["checking", "generating"].includes(requirementLlmState.status);
  const options = requirementLlmState.models.length
    ? requirementLlmState.models.map((model) => {
        const label = modelDisplayName(model);
        const display = label === model ? model : `${label} - ${model}`;
        return `<option value="${escapeHtml(model)}">${escapeHtml(display)}</option>`;
      }).join("")
    : "<option value=\"\">No models available</option>";

  elements.settingsRequirementModel.innerHTML = options;
  elements.settingsRatingModel.innerHTML = options;
  if (ready) {
    elements.settingsRequirementModel.value = requirementLlmState.requirementsModel;
    elements.settingsRatingModel.value = requirementLlmState.ratingModel;
  }
  elements.settingsRequirementModel.disabled = !ready || busy;
  elements.settingsRatingModel.disabled = !ready || busy;
  elements.refreshRequirementModels.disabled = busy;
  elements.settingsConnectionStatus.className = `settings-connection-status ${requirementLlmState.status}`;
  elements.settingsConnectionStatus.textContent = ({
    checking: "Checking connection",
    ready: "Connected",
    generating: "Request in progress",
    configuration_required: "Configuration required",
    unavailable: "Unavailable",
    error: "Connection error"
  })[requirementLlmState.status] || "Unavailable";
  elements.settingsConnectionMessage.textContent = requirementLlmState.message;
}

function openModelSettings() {
  renderModelSettings();
  elements.modelSettingsModal.hidden = false;
}

function closeModelSettings() {
  elements.modelSettingsModal.hidden = true;
}

function formatEuro(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not set";
  return `EUR ${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(amount)}`;
}

function formatFundingRange(minimum, maximum) {
  if (!Number.isFinite(Number(minimum)) || !Number.isFinite(Number(maximum))) return "Not provided";
  return `${formatEuro(minimum)} - ${formatEuro(maximum)}`;
}

function isFundingMapping(mapping) {
  return mapping?.id === "SR01" || mapping?.requirement?.selection_tags?.includes("budget");
}

function projectById(projectId) {
  return projects.find((project) => project.id === projectId);
}

function switchView(viewId) {
  elements.views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  elements.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));

  if (viewId === "requirements") {
    renderRequirementLlmPanel();
    renderSelectionSummary();
  }
  if (viewId === "review") renderReview();
  if (viewId === "assessment") renderAssessment();
  if (viewId === "results") renderResults();
  if (viewId === "library") renderLibraryEntry();
  if (viewId === "catalog") renderCatalog();

  const stageIndex = ["intake", "cards", "requirements", "review", "assessment", "results", "library"].indexOf(viewId);
  const activeNavigationItem = Array.from(elements.navItems).find((item) => item.dataset.view === viewId);
  if (activeNavigationItem) elements.workspaceStage.textContent = activeNavigationItem.textContent.trim().replace(/^\d+\.\s*/, "");
  if (stageIndex >= 0) {
    const stageProgress = projects.length ? Math.max(15, Math.round(((stageIndex + 1) / 7) * 100)) : 0;
    elements.progress.style.width = `${stageProgress}%`;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateSidebar() {
  const count = projects.length;
  elements.count.textContent = `${count} ${count === 1 ? "project" : "projects"}`;
  elements.workspaceProjectSummary.textContent = `${count} ${count === 1 ? "project" : "projects"}`;
  if (!count) {
    elements.workflowStatus.textContent = "Load the demonstration projects.";
    return;
  }

  const answered = Object.values(answers).filter((answer) => answer.status === "answered").length;
  if (answered) {
    elements.workflowStatus.textContent = `${answered} assessment answers recorded.`;
  } else if (confirmedProjects.size) {
    elements.workflowStatus.textContent = `${confirmedProjects.size} of ${count} profiles confirmed.`;
  } else {
    elements.workflowStatus.textContent = "Ready to review imported project cards.";
  }
}

function initializeRequirementProfiles() {
  projects.forEach((project) => {
    if (requirementProfiles[project.id]) return;
    const reference = referenceProfileByProject.get(project.id);
    if (!reference) return;

    const mappings = [];
    ["critical", "important", "supporting"].forEach((importance) => {
      (reference.catalog_requirements[importance] || []).forEach((item) => {
        const requirement = catalogById.get(item.id);
        if (!requirement) return;
        mappings.push({
          id: item.id,
          requirement,
          importance,
          requiredLevel: item.required_level ?? 3,
          requiredValue: item.required_value || "",
          requiredMinimumEur: item.required_minimum_eur ?? null,
          requiredPreferredEur: item.required_preferred_eur ?? null,
          included: true,
          source: "catalog",
          approved: true,
          submittedToLibrary: false
        });
      });
    });

    (reference.provisional_requirements || []).forEach((item) => {
      mappings.push({
        id: item.provisional_id,
        requirement: {
          id: item.provisional_id,
          title: item.title,
          category: "Proposed additions",
          statement: item.statement,
          question_template: item.question_template,
          scope: ["project"],
          scale_id: item.proposed_scale_id,
          applicability: item.gap_rationale,
          critical_when: "Consultant confirmation required before assessment.",
          evidence_examples: item.closest_catalog_ids.map((id) => `Closest catalog requirement: ${id}`),
          lifecycle_status: "provisional"
        },
        importance: item.proposed_importance,
        requiredLevel: item.proposed_required_level,
        requiredValue: "",
        requiredMinimumEur: null,
        requiredPreferredEur: null,
        included: false,
        source: "provisional",
        approved: false,
        submittedToLibrary: false
      });
    });

    requirementProfiles[project.id] = mappings;
    requirementSelectionMeta[project.id] = {
      source: "reference",
      label: "Curated profile",
      model: null,
      generatedAt: null,
      summary: "Manually curated demonstration profile."
    };
  });

  activeReviewProjectId ||= projects[0]?.id || null;
  activeAssessmentProjectId ||= projects[0]?.id || null;
}

function selectionProjectPayload(project) {
  return {
    id: project.id,
    title: project.title,
    businessFunction: project.businessFunction,
    problem: project.problem,
    proposedSolution: project.proposedSolution,
    intendedOutcome: project.intendedOutcome,
    users: project.users,
    process: project.process,
    capabilities: project.capabilities,
    dataSources: project.dataSources,
    systems: project.systems,
    scale: project.scale,
    humanOversight: project.humanOversight,
    constraints: project.constraints,
    assumptions: project.assumptions,
    unknowns: project.unknowns,
    evidence: project.evidence
  };
}

function selectionCatalogPayload() {
  return catalog.map((requirement) => ({
    id: requirement.id,
    title: requirement.title,
    category: requirement.category,
    parentRequirementId: requirement.parent_requirement_id || null,
    statement: requirement.statement,
    questionTemplate: requirement.question_template,
    scaleId: requirement.scale_id,
    scope: requirement.scope || [],
    selectionTags: requirement.selection_tags || [],
    selectionFamily: selectionFamilyForRequirement(requirement),
    selectionFamilyLimit: selectionFamilyForRequirement(requirement) ? 2 : null,
    applicability: requirement.applicability,
    criticalWhen: requirement.critical_when
  }));
}

function selectionFamilyForRequirement(requirement) {
  const familyRoot = requirement.parent_requirement_id
    || (variantParentRequirementIds.has(requirement.id) ? requirement.id : null);
  return familyRoot ? `variant-group:${familyRoot}` : null;
}

function selectionScalePayload() {
  return scales.map((scale) => ({
    id: scale.id,
    name: scale.name,
    levels: (scale.levels || []).map((level) => ({
      level: level.level,
      label: level.label,
      anchor: level.anchor
    }))
  }));
}

function generationHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(generationHistoryStorageKey) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function generationEstimate(model) {
  const samples = generationHistory()[model] || [];
  if (!samples.length) return { lower: 60, upper: 120 };
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const lower = Math.max(20, Math.round((median * 0.75) / 5) * 5);
  const upper = Math.max(lower + 15, Math.round((median * 1.35) / 5) * 5);
  return { lower, upper };
}

function recordGenerationDuration(model, seconds) {
  const history = generationHistory();
  history[model] = [...(history[model] || []), Math.max(1, Math.round(seconds))].slice(-8);
  localStorage.setItem(generationHistoryStorageKey, JSON.stringify(history));
}

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function renderGenerationProgress() {
  const generating = requirementLlmState.status === "generating" && requirementLlmState.generationStartedAt;
  elements.requirementGenerationProgress.hidden = !generating;
  if (!generating) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - requirementLlmState.generationStartedAt) / 1000));
  const estimate = generationEstimate(requirementLlmState.requirementsModel);
  const stage = requirementLlmState.generationStage === "validating"
    ? "Validating and consolidating the proposal"
    : elapsed < 4
      ? "Preparing project context and requirement catalog"
      : "Model analyzing project prerequisites";
  elements.requirementGenerationStage.textContent = stage;
  elements.requirementGenerationTimer.textContent = `Elapsed ${formatElapsed(elapsed)}`;
  elements.requirementGenerationEstimate.textContent = elapsed > estimate.upper
    ? `Taking longer than usual. Typical duration for this model: ${estimate.lower}–${estimate.upper} seconds.`
    : `Typical duration for this model: ${estimate.lower}–${estimate.upper} seconds.`;
}

function startGenerationTimer() {
  if (generationTimerId) window.clearInterval(generationTimerId);
  requirementLlmState.generationStartedAt = Date.now();
  requirementLlmState.generationStage = "preparing";
  renderGenerationProgress();
  generationTimerId = window.setInterval(renderGenerationProgress, 1000);
}

function stopGenerationTimer() {
  if (generationTimerId) window.clearInterval(generationTimerId);
  generationTimerId = null;
  requirementLlmState.generationStartedAt = null;
  requirementLlmState.generationStage = "";
  renderGenerationProgress();
}

function renderRequirementLlmPanel() {
  const ready = requirementLlmState.status === "ready" && requirementLlmState.models.length > 0;
  const generating = requirementLlmState.status === "generating";
  const currentProject = elements.requirementGenerationProject.value || projects[0]?.id || "";

  elements.requirementGenerationProject.innerHTML = projects.length
    ? projects.map((project) => `<option value="${escapeHtml(project.id)}" ${project.id === currentProject ? "selected" : ""}>${escapeHtml(project.title)}</option>`).join("")
    : "<option value=\"\">Load demo projects first</option>";
  elements.requirementGenerationProject.disabled = !projects.length || generating;

  elements.requirementLlmStatus.className = `llm-connection-status ${requirementLlmState.status}`;
  elements.requirementLlmStatus.textContent = ({
    checking: "Checking connection",
    ready: "LiteLLM connected",
    generating: "Generating proposal",
    configuration_required: "Configuration required",
    unavailable: "Connector unavailable",
    error: "Connection error"
  })[requirementLlmState.status] || "Connector unavailable";
  elements.requirementGenerationMessage.textContent = requirementLlmState.message;
  elements.generateRequirements.disabled = !ready || !requirementLlmState.requirementsModel || !projects.length || generating;
  elements.generateRequirements.textContent = generating ? "Generating..." : "Generate requirements";
  elements.cancelRequirementGeneration.hidden = !generating;
  elements.cancelRequirementGeneration.disabled = !generating;
  elements.restoreReferenceProfile.disabled = !projects.length;
  elements.restoreReferenceProfile.textContent = generating ? "Use curated profile instead" : "Restore curated profile";
  renderGenerationProgress();
  renderModelSettings();
}

async function connectRequirementLlm() {
  if (window.location.protocol === "file:") {
    requirementLlmState.status = "unavailable";
    requirementLlmState.models = [];
    requirementLlmState.message = "Open the prototype with the Start Prototype script. Direct file mode cannot securely call LiteLLM.";
    renderRequirementLlmPanel();
    return;
  }

  requirementLlmState.status = "checking";
  requirementLlmState.message = "Checking the local connector and available LiteLLM models.";
  renderRequirementLlmPanel();

  try {
    const healthResponse = await fetch("/api/health", { cache: "no-store" });
    const health = await healthResponse.json();
    if (!health.configured) {
      requirementLlmState.status = "configuration_required";
      requirementLlmState.models = [];
      requirementLlmState.message = "Add LITELLM_API_KEY and LITELLM_BASE_URL to llm.env, then refresh the connection.";
      renderRequirementLlmPanel();
      return;
    }

    const modelResponse = await fetch("/api/models", { cache: "no-store" });
    const modelPayload = await modelResponse.json();
    if (!modelResponse.ok) throw new Error(modelPayload.error || `Model lookup returned ${modelResponse.status}.`);
    requirementLlmState.models = Array.isArray(modelPayload.models) ? modelPayload.models : [];
    if (!requirementLlmState.models.length) throw new Error("The LiteLLM proxy returned no accessible models.");
    requirementLlmState.requirementsModel = requirementLlmState.models.includes(requirementLlmState.requirementsModel)
      ? requirementLlmState.requirementsModel
      : requirementLlmState.models[0];
    requirementLlmState.ratingModel = requirementLlmState.models.includes(requirementLlmState.ratingModel)
      ? requirementLlmState.ratingModel
      : requirementLlmState.models[0];
    localStorage.setItem("project-readiness-requirements-model", requirementLlmState.requirementsModel);
    localStorage.setItem("project-readiness-rating-model", requirementLlmState.ratingModel);
    requirementLlmState.status = "ready";
    requirementLlmState.message = `${requirementLlmState.models.length} available ${requirementLlmState.models.length === 1 ? "model" : "models"} found. Select a project and generate its requirement proposal.`;
  } catch (error) {
    requirementLlmState.status = "error";
    requirementLlmState.models = [];
    requirementLlmState.message = error.message || "The LiteLLM connector could not be reached.";
  }
  renderRequirementLlmPanel();
}

function clearProjectAssessmentState(projectId) {
  confirmedProjects.delete(projectId);
  delete libraryDrafts[projectId];
  delete libraryDedupReviews[projectId];
  Object.keys(answers).forEach((key) => {
    if (key.startsWith(`${projectId}::`)) delete answers[key];
  });
}

function clearProjectWorkflowState(projectId) {
  delete requirementProfiles[projectId];
  delete requirementSelectionMeta[projectId];
  delete libraryDrafts[projectId];
  delete libraryDedupReviews[projectId];
  confirmedProjects.delete(projectId);
  Object.keys(answers).forEach((key) => {
    if (key.startsWith(`${projectId}::`)) delete answers[key];
  });
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function renderImportStatus(successes, errors, message = "") {
  const rows = [];
  if (message) rows.push(`<div class="import-status-row"><span>${escapeHtml(message)}</span></div>`);
  successes.forEach((project) => rows.push(`
    <div class="import-status-row success"><span><strong>${escapeHtml(project._import?.fileName || project.id)}</strong><br>${escapeHtml(project.title)}</span><span>Imported</span></div>
  `));
  errors.forEach((error) => rows.push(`
    <div class="import-status-row error"><span><strong>${escapeHtml(error.fileName || "Project file")}</strong><br>${escapeHtml(error.error || "Import failed.")}</span><span>Rejected</span></div>
  `));
  elements.projectImportStatus.innerHTML = rows.join("");
}

function mergeImportedProjects(importedProjects) {
  importedProjects.forEach((project) => {
    const existingIndex = projects.findIndex((item) => item.id === project.id);
    clearProjectWorkflowState(project.id);
    if (existingIndex >= 0) projects.splice(existingIndex, 1, project);
    else projects.push(project);
  });
  activeReviewProjectId = projects[0]?.id || null;
  activeAssessmentProjectId = projects[0]?.id || null;
  activeLibraryProjectId = projects[0]?.id || null;
  initializeRequirementProfiles();
  updateProjectList();
}

async function importProjectFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  if (window.location.protocol === "file:") {
    renderImportStatus([], [{ fileName: "Project import", error: "Start the prototype with the Start Prototype script before uploading Excel files." }]);
    return;
  }
  const unsupported = files.filter((file) => !file.name.toLowerCase().endsWith(".xlsx"));
  const supported = files.filter((file) => file.name.toLowerCase().endsWith(".xlsx"));
  if (!supported.length) {
    renderImportStatus([], unsupported.map((file) => ({ fileName: file.name, error: "Only .xlsx project workbooks are supported." })));
    return;
  }

  elements.chooseProjectFiles.disabled = true;
  renderImportStatus([], [], `Validating ${supported.length} project ${supported.length === 1 ? "workbook" : "workbooks"}...`);
  try {
    const encodedFiles = await Promise.all(supported.map(async (file) => ({
      name: file.name,
      contentBase64: await fileAsBase64(file)
    })));
    const response = await fetch("/api/import-projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: encodedFiles })
    });
    const payload = await response.json();
    const imported = Array.isArray(payload.projects) ? payload.projects : [];
    const errors = [
      ...unsupported.map((file) => ({ fileName: file.name, error: "Only .xlsx project workbooks are supported." })),
      ...(Array.isArray(payload.errors) ? payload.errors : [])
    ];
    if (!response.ok && !imported.length) {
      if (!errors.length) errors.push({ fileName: "Project import", error: payload.error || `Import returned ${response.status}.` });
      renderImportStatus([], errors);
      return;
    }
    mergeImportedProjects(imported);
    renderImportStatus(imported, errors);
    elements.intakeHint.textContent = `${imported.length} project ${imported.length === 1 ? "workbook" : "workbooks"} imported and normalized.`;
  } catch (error) {
    renderImportStatus([], [{ fileName: "Project import", error: error.message || "The project files could not be imported." }]);
  } finally {
    elements.chooseProjectFiles.disabled = false;
    elements.projectFileInput.value = "";
  }
}

async function openDemoProjectFolder() {
  if (window.location.protocol === "file:") {
    renderImportStatus([], [{ fileName: "Demo folder", error: "Start the prototype with the Start Prototype script to open the local folder." }]);
    return;
  }
  elements.openDemoFolder.disabled = true;
  try {
    const response = await fetch("/api/open-demo-folder", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The folder could not be opened.");
    renderImportStatus([], [], "The demo workbook folder is open in your file browser. Select the files there when using the upload picker.");
  } catch (error) {
    renderImportStatus([], [{ fileName: "Demo folder", error: error.message || "The folder could not be opened." }]);
  } finally {
    elements.openDemoFolder.disabled = false;
  }
}

function fallbackFundingMapping(projectId) {
  return (requirementProfiles[projectId] || []).find((mapping) => isFundingMapping(mapping))
    || (() => {
      const reference = referenceProfileByProject.get(projectId);
      const item = ["critical", "important", "supporting"]
        .flatMap((importance) => reference?.catalog_requirements?.[importance] || [])
        .find((entry) => entry.id === "SR01");
      return item ? {
        requiredMinimumEur: item.required_minimum_eur,
        requiredPreferredEur: item.required_preferred_eur
      } : null;
    })();
}

function normalizeImportance(value) {
  return ["supporting", "important", "critical"].includes(value) ? value : "important";
}

function normalizeRequiredLevel(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(4, Math.round(numeric))) : 3;
}

function cleanTextArray(value, limit = 6) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeSelectionSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return {
      projectPattern: "",
      mainTechnicalPrerequisites: [],
      mainOrganizationalPrerequisites: [],
      criticalGates: [],
      criticalUncertainties: [],
      clientClarifications: [],
      legacyText: typeof summary === "string" ? summary : ""
    };
  }
  return {
    projectPattern: String(summary.projectPattern || "").trim(),
    mainTechnicalPrerequisites: cleanTextArray(summary.mainTechnicalPrerequisites),
    mainOrganizationalPrerequisites: cleanTextArray(summary.mainOrganizationalPrerequisites),
    criticalGates: cleanTextArray(summary.criticalGates),
    criticalUncertainties: cleanTextArray(summary.criticalUncertainties),
    clientClarifications: cleanTextArray(summary.clientClarifications),
    legacyText: ""
  };
}

function proposalQualityWarnings(selectedMappings, proposedMappings, summary) {
  const warnings = [];
  if (selectedMappings.length < 8) warnings.push("Fewer than 8 catalog requirements were selected; check for missing prerequisites.");
  if (selectedMappings.length > 20) warnings.push("More than 20 catalog requirements were selected; consultant review should confirm that each item tests a distinct prerequisite.");

  const criticalCount = selectedMappings.filter((mapping) => mapping.importance === "critical").length;
  if (criticalCount > 6) warnings.push("More than six requirements are critical; reserve critical for true MVP stop conditions.");

  const selectedIds = new Set(selectedMappings.map((mapping) => mapping.id));
  const duplicatePairs = selectedMappings
    .filter((mapping) => mapping.requirement.parent_requirement_id && selectedIds.has(mapping.requirement.parent_requirement_id))
    .map((mapping) => `${mapping.requirement.parent_requirement_id} + ${mapping.id}`);
  if (duplicatePairs.length) warnings.push(`Broad parent and granular variant both selected: ${duplicatePairs.join(", ")}.`);

  const withoutEvidence = selectedMappings.filter((mapping) => mapping.id !== "SR01" && !mapping.selectionEvidence?.length);
  if (withoutEvidence.length) warnings.push(`${withoutEvidence.length} selected requirement${withoutEvidence.length === 1 ? "" : "s"} lack project evidence.`);

  const weakNewRequirements = proposedMappings.filter((mapping) =>
    !mapping.requirement.closest_catalog_ids?.length || !mapping.requirement.gap_rationale
  );
  if (weakNewRequirements.length) warnings.push(`${weakNewRequirements.length} proposed addition${weakNewRequirements.length === 1 ? "" : "s"} lack a complete catalog-gap comparison.`);

  const summaryCoverage = [
    summary.mainTechnicalPrerequisites,
    summary.mainOrganizationalPrerequisites,
    summary.criticalGates,
    summary.criticalUncertainties,
    summary.clientClarifications
  ].filter((items) => Array.isArray(items) && items.length).length;
  if (!summary.legacyText && summaryCoverage < 3) warnings.push("The project-level selection summary is incomplete.");
  return warnings;
}

function applyGeneratedRequirementProposal(project, payload, model) {
  const proposal = payload?.proposal;
  if (!proposal || !Array.isArray(proposal.selectedRequirements)) {
    throw new Error("The model response did not contain selectedRequirements.");
  }

  const fundingFallback = fallbackFundingMapping(project.id);
  const seenIds = new Set();
  const candidateRequirements = [];
  proposal.selectedRequirements.forEach((item, index) => {
    const requirementId = String(item.catalogRequirementId || item.id || "").trim();
    const requirement = catalogById.get(requirementId);
    if (!requirement || seenIds.has(requirementId)) return;
    seenIds.add(requirementId);
    const suppliedPriority = Number(item.selectionPriority);
    candidateRequirements.push({
      item,
      requirementId,
      requirement,
      priority: Number.isFinite(suppliedPriority) && suppliedPriority > 0 ? suppliedPriority : index + 1,
      index
    });
  });

  candidateRequirements.sort((left, right) => {
    if (left.requirementId === "SR01") return -1;
    if (right.requirementId === "SR01") return 1;
    return left.priority - right.priority || left.index - right.index;
  });

  const selectedMappings = [];
  candidateRequirements.forEach(({ item, requirementId, requirement }) => {
    const isFunding = requirementId === "SR01";
    const minimum = Number(item.requiredMinimumEur);
    const preferred = Number(item.requiredPreferredEur);
    selectedMappings.push({
      id: requirementId,
      requirement,
      importance: isFunding ? "critical" : normalizeImportance(item.importance),
      requiredLevel: normalizeRequiredLevel(item.requiredLevel),
      requiredValue: "",
      requiredMinimumEur: isFunding
        ? (Number.isFinite(minimum) && minimum > 0 ? minimum : fundingFallback?.requiredMinimumEur ?? null)
        : null,
      requiredPreferredEur: isFunding
        ? (Number.isFinite(preferred) && preferred >= minimum ? preferred : fundingFallback?.requiredPreferredEur ?? null)
        : null,
      included: true,
      source: "catalog",
      approved: true,
      submittedToLibrary: false,
      selectionRationale: String(item.rationale || "Selected by the requirement-generation model."),
      selectionEvidence: cleanTextArray(item.projectEvidence, 5),
      selectionAssumption: item.assumption == null ? "" : String(item.assumption).trim()
    });
  });

  if (!seenIds.has("SR01") && catalogById.has("SR01")) {
    selectedMappings.unshift({
      id: "SR01",
      requirement: catalogById.get("SR01"),
      importance: "critical",
      requiredLevel: 3,
      requiredValue: "",
      requiredMinimumEur: fundingFallback?.requiredMinimumEur ?? null,
      requiredPreferredEur: fundingFallback?.requiredPreferredEur ?? null,
      included: true,
      source: "catalog",
      approved: true,
      submittedToLibrary: false,
      selectionRationale: "Funding is a mandatory requirement for every project profile.",
      selectionEvidence: [],
      selectionAssumption: "The model omitted the mandatory funding requirement; the curated demonstration estimate was retained."
    });
  }

  if (selectedMappings.length < 5) {
    throw new Error("The generated profile contained fewer than five valid catalog requirements.");
  }
  const proposedMappings = (Array.isArray(proposal.proposedRequirements) ? proposal.proposedRequirements : [])
    .filter((item) => item?.title && item?.statement && item?.assessmentQuestion)
    .map((item, index) => {
      const scaleId = scalesById.has(item.scaleId) ? item.scaleId : "process_5";
      const provisionalId = `LLM-${project.id}-${String(index + 1).padStart(2, "0")}`;
      const closestCatalogIds = cleanTextArray(item.closestCatalogRequirementIds, 5)
        .filter((id) => catalogById.has(id));
      return {
        id: provisionalId,
        requirement: {
          id: provisionalId,
          title: String(item.title),
          category: "Proposed additions",
          statement: String(item.statement),
          question_template: String(item.assessmentQuestion),
          scope: ["project"],
          scale_id: scaleId,
          applicability: String(item.gapRationale || item.rationale || "The model identified a project-specific catalog gap."),
          critical_when: "Consultant confirmation required before assessment.",
          evidence_examples: closestCatalogIds.map((id) => `Closest catalog requirement: ${id}`),
          lifecycle_status: "provisional",
          proposed_category: String(item.category || "Project-specific"),
          closest_catalog_ids: closestCatalogIds,
          gap_rationale: String(item.gapRationale || "")
        },
        importance: normalizeImportance(item.importance),
        requiredLevel: normalizeRequiredLevel(item.requiredLevel),
        requiredValue: "",
        requiredMinimumEur: null,
        requiredPreferredEur: null,
        included: false,
        source: "provisional",
        approved: false,
        submittedToLibrary: false,
        selectionRationale: String(item.rationale || "Proposed by the requirement-generation model."),
        selectionEvidence: cleanTextArray(item.projectEvidence, 5),
        selectionAssumption: item.assumption == null ? "" : String(item.assumption).trim()
      };
    });

  requirementProfiles[project.id] = [...selectedMappings, ...proposedMappings];
  const normalizedSummary = normalizeSelectionSummary(proposal.selectionSummary);
  requirementSelectionMeta[project.id] = {
    source: "llm",
    label: "Live LLM proposal",
    model,
    generatedAt: new Date().toISOString(),
    summary: normalizedSummary,
    qualityWarnings: proposalQualityWarnings(selectedMappings, proposedMappings, normalizedSummary)
  };
  clearProjectAssessmentState(project.id);
}

async function generateRequirementsForSelectedProject() {
  const project = projectById(elements.requirementGenerationProject.value);
  const model = requirementLlmState.requirementsModel;
  if (!project || !model || requirementLlmState.status !== "ready") return;

  requirementLlmState.status = "generating";
  requirementLlmState.message = `Generating a requirement proposal for ${project.title}. The existing profile remains available until the new proposal has been validated.`;
  generationFallbackRequested = false;
  generationAbortController = new AbortController();
  startGenerationTimer();
  renderRequirementLlmPanel();

  try {
    const response = await fetch("/api/select-requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: generationAbortController.signal,
      body: JSON.stringify({
        model,
        project: selectionProjectPayload(project),
        catalog: selectionCatalogPayload(),
        scales: selectionScalePayload()
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Requirement generation returned ${response.status}.`);
    requirementLlmState.generationStage = "validating";
    renderGenerationProgress();
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    applyGeneratedRequirementProposal(project, payload, payload.model || model);
    recordGenerationDuration(model, (Date.now() - requirementLlmState.generationStartedAt) / 1000);
    requirementLlmState.status = "ready";
    requirementLlmState.message = `Live proposal generated for ${project.title}. Review the selected requirements and any proposed additions before continuing.`;
    renderSelectionSummary();
  } catch (error) {
    requirementLlmState.status = "ready";
    if (error.name === "AbortError") {
      if (!generationFallbackRequested) requirementLlmState.message = `Generation cancelled. The existing profile for ${project.title} was preserved.`;
    } else {
      requirementLlmState.message = `Generation failed: ${error.message}. The existing profile was preserved.`;
    }
  } finally {
    stopGenerationTimer();
    generationAbortController = null;
    generationFallbackRequested = false;
  }
  renderRequirementLlmPanel();
}

function cancelRequirementGeneration() {
  generationFallbackRequested = false;
  generationAbortController?.abort();
}

function restoreCuratedRequirementProfile() {
  const projectId = elements.requirementGenerationProject.value;
  if (!projectId || !referenceProfileByProject.has(projectId)) return;
  if (generationAbortController) {
    generationFallbackRequested = true;
    generationAbortController.abort();
  }
  delete requirementProfiles[projectId];
  delete requirementSelectionMeta[projectId];
  clearProjectAssessmentState(projectId);
  initializeRequirementProfiles();
  requirementLlmState.message = `Curated demonstration profile restored for ${projectById(projectId)?.title || projectId}.`;
  renderRequirementLlmPanel();
  renderSelectionSummary();
}

function updateProjectList() {
  const count = projects.length;
  elements.count.textContent = `${count} ${count === 1 ? "project" : "projects"}`;
  elements.listStatus.textContent = count ? `${count} selected ${count === 1 ? "project" : "projects"}` : "No projects loaded yet";
  elements.progress.style.width = count ? "18%" : "0%";

  if (!count) {
    elements.demo.disabled = false;
    elements.demo.textContent = "Load 3 demo projects";
    elements.list.className = "project-list empty-state";
    elements.list.innerHTML = "<p>Load the demonstration projects to populate the assessment pipeline.</p>";
    renderRequirementLlmPanel();
    updateNormalizedCards();
    updateSidebar();
    return;
  }

  elements.demo.disabled = true;
  elements.demo.textContent = "Projects loaded";
  elements.list.className = "project-list";
  elements.list.innerHTML = projects.map((project, index) => `
    <article class="project-row">
      <span class="project-number">${index + 1}</span>
      <div>
        <h4>${escapeHtml(project.title)}</h4>
        <p>${escapeHtml(project.problem)}</p>
      </div>
      <button class="remove-project" type="button" data-remove-project="${index}">Remove</button>
    </article>
  `).join("");

  initializeRequirementProfiles();
  renderRequirementLlmPanel();
  updateNormalizedCards();
  renderSelectionSummary();
  updateSidebar();
}

function renderPills(values) {
  return values.map((value) => `<span class="data-pill">${escapeHtml(value)}</span>`).join("");
}

function renderDataSources(sources) {
  return sources.map((source) => `
    <li>
      <div><strong>${escapeHtml(source.name)}</strong><span>${escapeHtml(source.detail)}</span></div>
      <span class="status-tag ${source.status.toLowerCase()}">${escapeHtml(source.status)}</span>
    </li>
  `).join("");
}

function catalogEntryType(requirement) {
  return requirement.parent_requirement_id ? "variant" : "family";
}

function renderUseCaseCatalog() {
  const patterns = window.DEMO_PROJECTS || [];
  elements.useCaseCatalogList.innerHTML = patterns.map((project) => `
    <details class="usecase-catalog-card">
      <summary>
        <span class="catalog-entry-id">${escapeHtml(project.id)}</span>
        <span class="usecase-catalog-summary"><strong>${escapeHtml(project.title)}</strong><small>${escapeHtml(project.businessFunction)} · ${escapeHtml(project.intendedOutcome)}</small></span>
      </summary>
      <div class="usecase-catalog-body">
        <div class="catalog-detail-grid two"><div><span>Business problem</span><p>${escapeHtml(project.problem)}</p></div><div><span>Proposed project</span><p>${escapeHtml(project.proposedSolution)}</p></div></div>
        <div class="catalog-detail-grid three"><div><span>Users</span><p>${escapeHtml(project.users)}</p></div><div><span>Scale</span><p>${escapeHtml(project.scale)}</p></div><div><span>Core systems</span><p>${escapeHtml(project.systems.join(", "))}</p></div></div>
        <div class="catalog-tags">${project.capabilities.map((capability) => `<span>${escapeHtml(capability)}</span>`).join("")}</div>
      </div>
    </details>
  `).join("") || "<p class=\"empty-state\">No use case patterns have been added yet.</p>";
}

function renderCatalogRequirement(requirement) {
  const type = catalogEntryType(requirement);
  const parent = requirement.parent_requirement_id ? catalogById.get(requirement.parent_requirement_id) : null;
  const tags = requirement.selection_tags?.length ? requirement.selection_tags.map((tag) => `<span>${escapeHtml(tag.replaceAll("_", " "))}</span>`).join("") : "<span>No tags assigned</span>";
  return `
    <details class="catalog-requirement-card">
      <summary>
        <span class="catalog-entry-id">${escapeHtml(requirement.id)}</span>
        <span class="catalog-requirement-summary"><strong>${escapeHtml(requirement.title)}</strong><small>${escapeHtml(requirement.category)}${parent ? ` · Variant of ${escapeHtml(parent.title)}` : ""}</small></span>
        <span class="catalog-entry-type ${type}">${type === "family" ? "Family" : "Variant"}</span>
      </summary>
      <div class="catalog-requirement-body">
        <div class="catalog-detail-grid two"><div><span>Requirement condition</span><p>${escapeHtml(requirement.statement)}</p></div><div><span>Assessment question</span><p>${escapeHtml(requirement.question_template || requirement.assessment_question || "Not defined")}</p></div></div>
        <div class="catalog-detail-grid two"><div><span>When to select</span><p>${escapeHtml(requirement.applicability || "Not defined")}</p></div><div><span>Critical when</span><p>${escapeHtml(requirement.critical_when || "Consultant determines criticality for the project.")}</p></div></div>
        <div class="catalog-detail-grid three"><div><span>Response scale</span><p>${escapeHtml(requirement.scale_id || "Not assigned")}</p></div><div><span>Scope</span><p>${escapeHtml((requirement.scope || []).join(", ") || "Not assigned")}</p></div><div><span>Origins</span><p>${escapeHtml((requirement.origins || []).join(", ") || "Not recorded")}</p></div></div>
        <div class="catalog-tags">${tags}</div>
      </div>
    </details>
  `;
}

function renderCatalog() {
  const patternCount = (window.DEMO_PROJECTS || []).length;
  const familyCount = catalog.filter((requirement) => catalogEntryType(requirement) === "family").length;
  const variantCount = catalog.length - familyCount;
  const categories = [...new Set(catalog.map((requirement) => requirement.category).filter(Boolean))].sort();

  elements.catalogOverview.innerHTML = `
    <div><span>Use case patterns</span><strong>${patternCount}</strong><small>Current seed patterns</small></div>
    <div><span>Requirement families</span><strong>${familyCount}</strong><small>Reusable prerequisites</small></div>
    <div><span>Granular variants</span><strong>${variantCount}</strong><small>More specific assessment conditions</small></div>
    <div><span>Total entries</span><strong>${catalog.length}</strong><small>Controlled catalog</small></div>
  `;
  if (elements.catalogCategory.options.length <= 1) {
    elements.catalogCategory.insertAdjacentHTML("beforeend", categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join(""));
  }
  renderUseCaseCatalog();
  renderCatalogRequirements();
}

function renderCatalogRequirements() {
  const query = (elements.catalogSearch.value || "").trim().toLowerCase();
  const category = elements.catalogCategory.value;
  const type = elements.catalogType.value;
  const filtered = catalog.filter((requirement) => {
    const haystack = [requirement.id, requirement.title, requirement.category, requirement.statement, requirement.question_template, ...(requirement.selection_tags || [])].join(" ").toLowerCase();
    return (!query || haystack.includes(query))
      && (!category || requirement.category === category)
      && (!type || catalogEntryType(requirement) === type);
  });

  elements.catalogResultSummary.textContent = `${filtered.length} of ${catalog.length} requirement entries shown`;
  elements.requirementCatalogList.innerHTML = filtered.length
    ? filtered.map(renderCatalogRequirement).join("")
    : "<div class=\"empty-state\"><p>No requirement entries match the selected filters.</p></div>";
}

function updateNormalizedCards() {
  if (!projects.length) {
    elements.cards.className = "normalized-project-grid empty-state";
    elements.cards.innerHTML = "<p>Load the demonstration projects first.</p>";
    return;
  }

  elements.cards.className = "normalized-project-grid";
  elements.cards.innerHTML = projects.map((project, index) => `
    <article class="normalized-project-card">
      <header>
        <div><p class="eyebrow">Project ${index + 1} · ${escapeHtml(project.id)}</p><h3>${escapeHtml(project.title)}</h3></div>
        <span class="step-badge">Imported</span>
      </header>
      <div class="project-card-section project-card-lead"><span>Business problem</span><p>${escapeHtml(project.problem)}</p></div>
      <div class="project-card-section"><span>Proposed project</span><p>${escapeHtml(project.proposedSolution)}</p></div>
      <div class="project-card-section"><span>Intended outcome</span><p>${escapeHtml(project.intendedOutcome)}</p></div>
      <div class="project-facts">
        <div><span>Function</span><strong>${escapeHtml(project.businessFunction)}</strong></div>
        <div><span>Users</span><strong>${escapeHtml(project.users)}</strong></div>
        <div class="wide"><span>Scale</span><strong>${escapeHtml(project.scale)}</strong></div>
      </div>
      <div class="project-card-section"><span>AI capabilities</span><div class="data-pills">${renderPills(project.capabilities)}</div></div>
      <details>
        <summary>View project evidence and constraints</summary>
        <div class="details-grid">
          <section><h4>Current process</h4><p>${escapeHtml(project.process)}</p></section>
          <section><h4>Data and knowledge inputs</h4><ul class="source-list">${renderDataSources(project.dataSources)}</ul></section>
          <section><h4>Systems</h4><div class="data-pills">${renderPills(project.systems)}</div></section>
          <section><h4>Human oversight</h4><p>${escapeHtml(project.humanOversight)}</p></section>
          <section><h4>Known constraints</h4><ul>${project.constraints.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
          <section><h4>Assumptions</h4><ul>${project.assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
          <section><h4>Unknowns to preserve</h4><ul>${project.unknowns.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
          <section><h4>Source evidence</h4><ul>${project.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        </div>
      </details>
      <footer>
        <div><span>Expected requirement signals</span><p>${escapeHtml(project.requirementSignals.join(" · "))}</p></div>
        ${project.provisionalRequirementCandidate ? `<span class="provisional-tag">Potential new requirement: ${escapeHtml(project.provisionalRequirementCandidate)}</span>` : ""}
      </footer>
    </article>
  `).join("");
}

function groupedMappings(projectId, includedOnly = false) {
  const mappings = (requirementProfiles[projectId] || []).filter((mapping) => !includedOnly || (mapping.included && mapping.approved));
  return mappings.reduce((groups, mapping) => {
    const category = mapping.requirement.category;
    groups[category] ||= [];
    groups[category].push(mapping);
    return groups;
  }, {});
}

function renderProfileSummary(summary, collapsible = false) {
  if (!summary) return "";
  if (typeof summary === "string") {
    return `<p class="selection-profile-summary">${escapeHtml(summary)}</p>`;
  }

  const dimensions = [
    ["Technical prerequisites", summary.mainTechnicalPrerequisites],
    ["Organizational prerequisites", summary.mainOrganizationalPrerequisites],
    ["Critical gates", summary.criticalGates],
    ["Uncertainties", summary.criticalUncertainties],
    ["Clarify with client", summary.clientClarifications]
  ].filter(([, items]) => Array.isArray(items) && items.length);

  const detailedContent = `
    <div class="selection-profile-summary structured">
      ${summary.legacyText ? `<p>${escapeHtml(summary.legacyText)}</p>` : ""}
      ${dimensions.map(([label, items]) => `
        <div>
          <strong>${escapeHtml(label)}</strong>
          <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      `).join("")}
    </div>
  `;
  if (collapsible) {
    return `
      <p class="selection-profile-summary compact">${escapeHtml(summary.projectPattern || "Live proposal generated from the selected project context and the controlled requirement catalog.")}</p>
      <details class="llm-profile-details">
        <summary>View AI rationale and clarification points</summary>
        ${detailedContent}
      </details>
    `;
  }
  return `
    <div class="selection-profile-summary structured">
      ${summary.projectPattern ? `<p><strong>Project pattern</strong><span>${escapeHtml(summary.projectPattern)}</span></p>` : ""}
      ${summary.legacyText ? `<p>${escapeHtml(summary.legacyText)}</p>` : ""}
      ${dimensions.map(([label, items]) => `
        <div>
          <strong>${escapeHtml(label)}</strong>
          <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSelectionSummary() {
  if (!projects.length) {
    elements.selectionSummary.className = "selection-summary-grid empty-state";
    elements.selectionSummary.innerHTML = "<p>Load the demonstration projects first.</p>";
    return;
  }

  initializeRequirementProfiles();
  elements.selectionSummary.className = "selection-summary-grid";
  elements.selectionSummary.innerHTML = projects.map((project) => {
    const mappings = requirementProfiles[project.id] || [];
    const selectionMeta = requirementSelectionMeta[project.id] || { label: "Curated profile", summary: "" };
    const catalogMappings = mappings.filter((mapping) => mapping.source === "catalog");
    const provisional = mappings.filter((mapping) => mapping.source === "provisional");
    const criticalCount = catalogMappings.filter((mapping) => mapping.importance === "critical").length;
    const categoryCounts = Object.entries(groupedMappings(project.id))
      .filter(([category]) => category !== "Proposed additions")
      .map(([category, items]) => `<li><span>${escapeHtml(category)}</span><strong>${items.length}</strong></li>`)
      .join("");

    return `
      <article class="selection-summary-card">
        <header><div><p class="eyebrow">${escapeHtml(project.id)}</p><h3>${escapeHtml(project.title)}</h3></div><span class="outline-badge ${selectionMeta.source === "llm" ? "live" : ""}">${escapeHtml(selectionMeta.label)}</span></header>
        <div class="selection-metrics">
          <div><strong>${catalogMappings.length}</strong><span>Catalog requirements</span></div>
          <div><strong>${criticalCount}</strong><span>Proposed critical</span></div>
          <div><strong>${provisional.length}</strong><span>Proposed additions</span></div>
        </div>
        ${renderProfileSummary(selectionMeta.summary, selectionMeta.source === "llm")}
        ${selectionMeta.qualityWarnings?.length ? `
          <div class="proposal-quality-warning">
            <strong>Review checks</strong>
            <ul>${selectionMeta.qualityWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
          </div>
        ` : ""}
        <ul class="category-counts">${categoryCounts}</ul>
        ${provisional.map((mapping) => `
          <div class="new-requirement-callout">
            <span>New requirement proposed</span>
            <strong>${escapeHtml(mapping.requirement.title)}</strong>
            <p>${escapeHtml(mapping.requirement.statement)}</p>
          </div>
        `).join("")}
        <button class="secondary review-project-button" type="button" data-review-project="${escapeHtml(project.id)}">Review profile</button>
      </article>
    `;
  }).join("");
}

function renderProjectTabs(container, activeProjectId, attributeName) {
  container.innerHTML = projects.map((project, index) => `
    <button type="button" class="project-tab ${project.id === activeProjectId ? "active" : ""}" ${attributeName}="${escapeHtml(project.id)}">
      <span>${index + 1}</span>${escapeHtml(project.title)}
      ${confirmedProjects.has(project.id) ? `<i>Confirmed</i>` : ""}
    </button>
  `).join("");
}

function targetLabel(mapping) {
  if (isFundingMapping(mapping)) {
    return formatFundingRange(mapping.requiredMinimumEur, mapping.requiredPreferredEur);
  }
  if (mapping.requiredValue) return mapping.requiredValue;
  const scale = scalesById.get(mapping.requirement.scale_id);
  return scale?.levels?.find((level) => level.level === Number(mapping.requiredLevel))?.label || `Level ${mapping.requiredLevel}`;
}

function targetControl(mapping) {
  if (isFundingMapping(mapping)) {
    return `<fieldset class="funding-target-control">
      <legend>Required funding range</legend>
      <label>Minimum credible MVP budget<input class="compact-input" type="number" min="0" step="10000" data-review-action="target-minimum" data-mapping-id="${escapeHtml(mapping.id)}" value="${mapping.requiredMinimumEur ?? ""}" aria-label="Minimum required funding in EUR"></label>
      <label>Preferred budget incl. contingency<input class="compact-input" type="number" min="0" step="10000" data-review-action="target-preferred" data-mapping-id="${escapeHtml(mapping.id)}" value="${mapping.requiredPreferredEur ?? ""}" aria-label="Preferred funding in EUR"></label>
    </fieldset>`;
  }

  const scale = scalesById.get(mapping.requirement.scale_id);
  return `<label>Required level<select data-review-action="target-level" data-mapping-id="${escapeHtml(mapping.id)}" aria-label="Required level">
    ${(scale?.levels || []).map((level) => `<option value="${level.level}" ${Number(mapping.requiredLevel) === level.level ? "selected" : ""}>${level.level} · ${escapeHtml(level.label)}</option>`).join("")}
  </select></label>`;
}

function renderReview() {
  if (!projects.length) {
    elements.reviewTabs.innerHTML = "";
    elements.reviewStatus.innerHTML = "";
    elements.reviewList.className = "requirement-review-list empty-state";
    elements.reviewList.innerHTML = "<p>Load the demonstration projects first.</p>";
    return;
  }

  initializeRequirementProfiles();
  activeReviewProjectId ||= projects[0].id;
  renderProjectTabs(elements.reviewTabs, activeReviewProjectId, "data-review-tab");
  const project = projectById(activeReviewProjectId);
  const mappings = requirementProfiles[activeReviewProjectId] || [];
  const included = mappings.filter((mapping) => mapping.included && mapping.approved).length;
  const critical = mappings.filter((mapping) => mapping.included && mapping.approved && mapping.importance === "critical").length;
  const pending = mappings.filter((mapping) => mapping.source === "provisional" && !mapping.approved).length;

  elements.reviewStatus.innerHTML = `
    <div><span>Current project</span><strong>${escapeHtml(project.title)}</strong></div>
    <div><span>Included</span><strong>${included}</strong></div>
    <div><span>Critical</span><strong>${critical}</strong></div>
    <div><span>Unreviewed additions</span><strong>${pending}</strong></div>
    <div class="profile-state ${confirmedProjects.has(project.id) ? "confirmed" : "pending"}">${confirmedProjects.has(project.id) ? "Profile confirmed" : "Confirmation pending"}</div>
  `;

  const grouped = groupedMappings(activeReviewProjectId);
  const catalogGroups = Object.entries(grouped)
    .map(([category, items]) => [category, items.filter((item) => item.source === "catalog")])
    .filter(([, items]) => items.length);
  const provisionalMappings = mappings.filter((mapping) => ["provisional", "consultant"].includes(mapping.source));

  elements.reviewList.className = "requirement-review-list";
  elements.reviewList.innerHTML = `
    ${catalogGroups.map(([category, items]) => `
      <section class="requirement-category-section">
        <header><h3>${escapeHtml(category)}</h3><span>${items.filter((item) => item.included).length} of ${items.length} included</span></header>
        <div class="review-card-grid">${items.map(renderReviewCard).join("")}</div>
      </section>
    `).join("")}
    ${provisionalMappings.length ? `
      <section class="requirement-category-section provisional-section">
        <header><div><p class="eyebrow">Outside the current catalog</p><h3>Project-specific additions</h3></div><span>Consultant approval required</span></header>
        <div class="review-card-grid">${provisionalMappings.map(renderReviewCard).join("")}</div>
      </section>
    ` : ""}
  `;
}

function renderReviewCard(mapping) {
  const requirement = mapping.requirement;
  const project = projectById(activeReviewProjectId);
  const isProvisional = mapping.source === "provisional";
  const isConsultantAdded = mapping.source === "consultant";
  const enabled = mapping.included && mapping.approved;
  if (isConsultantAdded) {
    return `
      <article class="requirement-review-card included provisional consultant-added">
        <div class="requirement-card-top compact">
          <div>
            <div class="requirement-identifiers"><span class="requirement-id">${escapeHtml(mapping.id)}</span><span class="source-badge new">Consultant added</span></div>
            <h4>New project-specific requirement</h4>
            <p>Define an observable prerequisite that should be assessed with the client for this project.</p>
          </div>
          <button type="button" class="remove-custom-requirement" data-remove-consultant-requirement="${escapeHtml(mapping.id)}">Remove</button>
        </div>
        <div class="custom-requirement-fields">
          <label>Title<input type="text" value="${escapeHtml(requirement.title)}" placeholder="e.g. Contract approval workflow" data-review-action="custom-title" data-mapping-id="${escapeHtml(mapping.id)}"></label>
          <label>Category<input type="text" value="${escapeHtml(requirement.category)}" placeholder="e.g. Governance and risk" data-review-action="custom-category" data-mapping-id="${escapeHtml(mapping.id)}"></label>
          <label class="wide">Requirement condition<textarea rows="2" placeholder="What must be in place for this project?" data-review-action="custom-statement" data-mapping-id="${escapeHtml(mapping.id)}">${escapeHtml(requirement.statement)}</textarea></label>
          <label class="wide">Assessment question<textarea rows="2" placeholder="How should the consultant assess this with the client?" data-review-action="custom-question" data-mapping-id="${escapeHtml(mapping.id)}">${escapeHtml(requirement.question_template)}</textarea></label>
          <label>Response scale<select data-review-action="custom-scale" data-mapping-id="${escapeHtml(mapping.id)}">${scales.map((scale) => `<option value="${escapeHtml(scale.id)}" ${requirement.scale_id === scale.id ? "selected" : ""}>${escapeHtml(scale.name || scale.id)}</option>`).join("")}</select></label>
        </div>
        ${placeholderResolutionControl(mapping, project)}
        <div class="requirement-controls">
          <label>Importance<select data-review-action="importance" data-mapping-id="${escapeHtml(mapping.id)}">${Object.entries(importanceLabels).map(([value, label]) => `<option value="${value}" ${mapping.importance === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          ${targetControl(mapping)}
        </div>
        <label class="library-submit"><input type="checkbox" data-review-action="submit-library" data-mapping-id="${escapeHtml(mapping.id)}" ${mapping.submittedToLibrary ? "checked" : ""}> Submit to requirement-library review after this assessment</label>
      </article>
    `;
  }
  return `
    <article class="requirement-review-card ${enabled ? "included" : "excluded"} ${isProvisional ? "provisional" : ""}">
      <div class="requirement-card-top">
        <div>
          <div class="requirement-identifiers">
            <span class="requirement-id">${escapeHtml(mapping.id)}</span>
            <span class="source-badge ${isProvisional ? "new" : "catalog"}">${isProvisional ? "New proposal" : "Catalog"}</span>
          </div>
          <h4>${escapeHtml(requirement.title)}</h4>
          <p>${escapeHtml(requirement.statement)}</p>
        </div>
        ${isProvisional ? `
          <label class="approval-switch"><input type="checkbox" data-review-action="approve-provisional" data-mapping-id="${escapeHtml(mapping.id)}" ${mapping.approved ? "checked" : ""}><span>${mapping.approved ? "Approved" : "Approve"}</span></label>
        ` : `
          <label class="approval-switch"><input type="checkbox" data-review-action="include" data-mapping-id="${escapeHtml(mapping.id)}" ${mapping.included ? "checked" : ""}><span>${mapping.included ? "Included" : "Excluded"}</span></label>
        `}
      </div>
      ${placeholderResolutionControl(mapping, project)}
      <div class="requirement-controls ${enabled ? "" : "disabled-controls"}">
        <label>Importance<select data-review-action="importance" data-mapping-id="${escapeHtml(mapping.id)}" ${enabled ? "" : "disabled"}>
          ${Object.entries(importanceLabels).map(([value, label]) => `<option value="${value}" ${mapping.importance === value ? "selected" : ""}>${label}</option>`).join("")}
        </select></label>
        ${targetControl(mapping)}
      </div>
      <details>
        <summary>Why this requirement was selected</summary>
        <div class="requirement-detail-copy">
          ${mapping.selectionRationale ? `<p><strong>Selection rationale:</strong> ${escapeHtml(mapping.selectionRationale)}</p>` : ""}
          ${mapping.selectionEvidence?.length ? `<div><strong>Project evidence:</strong><ul>${mapping.selectionEvidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
          ${mapping.selectionAssumption ? `<p class="selection-assumption"><strong>Assumption:</strong> ${escapeHtml(mapping.selectionAssumption)}</p>` : ""}
          <p><strong>Question:</strong> ${escapeHtml(project ? questionText(mapping, project) : requirement.question_template)}</p>
          <p><strong>Applicability:</strong> ${escapeHtml(requirement.applicability)}</p>
          <p><strong>Critical when:</strong> ${escapeHtml(requirement.critical_when)}</p>
          ${requirement.evidence_examples?.length ? `<p><strong>Useful evidence:</strong> ${escapeHtml(requirement.evidence_examples.join(" · "))}</p>` : ""}
        </div>
      </details>
      ${isProvisional && mapping.approved ? `
        <label class="library-submit"><input type="checkbox" data-review-action="submit-library" data-mapping-id="${escapeHtml(mapping.id)}" ${mapping.submittedToLibrary ? "checked" : ""}> Submit to requirement-library review after this assessment</label>
      ` : ""}
    </article>
  `;
}

function addConsultantRequirement() {
  if (!activeReviewProjectId) return;
  customRequirementCounter += 1;
  const id = `CONSULTANT-${activeReviewProjectId}-${String(customRequirementCounter).padStart(2, "0")}`;
  requirementProfiles[activeReviewProjectId] ||= [];
  requirementProfiles[activeReviewProjectId].push({
    id,
    requirement: {
      id,
      title: "",
      category: "Project-specific",
      statement: "",
      question_template: "",
      scope: ["project"],
      scale_id: "process_5",
      applicability: "Defined by the consultant for this project.",
      critical_when: "Consultant determines the project impact.",
      evidence_examples: [],
      lifecycle_status: "consultant_added"
    },
    importance: "important",
    requiredLevel: 3,
    requiredValue: "",
    requiredMinimumEur: null,
    requiredPreferredEur: null,
    included: true,
    source: "consultant",
    approved: true,
    submittedToLibrary: true,
    selectionRationale: "Added by the consultant during project-specific requirement review.",
    selectionEvidence: [],
    selectionAssumption: ""
  });
  confirmedProjects.delete(activeReviewProjectId);
  renderReview();
  renderSelectionSummary();
  updateSidebar();
}

function questionText(mapping, project) {
  let text = mapping.requirement.question_template;
  Object.entries(project.assessmentContext || {}).forEach(([key, value]) => {
    text = text.replaceAll(`{${key}}`, value);
  });
  return text
    .replaceAll("{project}", project.title)
    .replaceAll("{relevant_process}", project.process)
    .replaceAll("{relevant_data}", "the relevant project data")
    .replaceAll("{relevant_asset}", "the relevant data or content")
    .replaceAll("{event_or_transaction_data}", "event or transaction data")
    .replaceAll("{interaction_type}", "interaction records")
    .replaceAll("{source_system_or_data}", "the required source systems and data")
    .replaceAll("{entity_type}", "business entity")
    .replaceAll("{media_type}", "media");
}

function unresolvedPlaceholderKeys(text) {
  return [...new Set([...String(text || "").matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]))];
}

function placeholderLabel(key) {
  return String(key || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function unresolvedQuestionPlaceholders(mapping, project) {
  return unresolvedPlaceholderKeys(questionText(mapping, project));
}

function placeholderResolutionControl(mapping, project) {
  if (!mapping.included || !mapping.approved) return "";
  const keys = unresolvedQuestionPlaceholders(mapping, project);
  if (!keys.length) return "";
  project.assessmentContext ||= {};
  return `
    <div class="placeholder-resolution">
      <div><strong>Project context required</strong><span>Complete the missing terms before this question can be used with the client.</span></div>
      <p>${escapeHtml(questionText(mapping, project))}</p>
      <div class="placeholder-fields">
        ${keys.map((key) => `<label>${escapeHtml(placeholderLabel(key))}<input type="text" value="${escapeHtml(project.assessmentContext[key] || "")}" placeholder="Define ${escapeHtml(key.replaceAll("_", " "))}" data-review-action="context-placeholder" data-placeholder-key="${escapeHtml(key)}" data-mapping-id="${escapeHtml(mapping.id)}"></label>`).join("")}
      </div>
    </div>
  `;
}

function answerKey(projectId, mapping) {
  const isCompanyShared = mapping.requirement.scope?.includes("company");
  return isCompanyShared ? `company:${mapping.id}` : `${projectId}:${mapping.id}`;
}

function optionsForMapping(mapping) {
  if (isFundingMapping(mapping)) {
    return [
      { level: 0, label: "No funding available", anchor: "No credible funding can be committed." },
      { level: 1, label: "Materially below minimum", anchor: "Even the upper end of the available range is below half of the minimum project budget." },
      { level: 2, label: "Minimum not secured", anchor: "The lower end of the available range does not cover the minimum credible project budget." },
      { level: 3, label: "Minimum covered", anchor: "The lower end covers the minimum project budget, but not the preferred budget including contingency." },
      { level: 4, label: "Preferred range secured", anchor: "The lower end covers the preferred project budget including contingency." }
    ];
  }
  return scalesById.get(mapping.requirement.scale_id)?.levels || [];
}

function calculateFundingState(mapping, availableMinimum, availableMaximum) {
  if (availableMinimum === null || availableMinimum === "" || availableMaximum === null || availableMaximum === "") {
    return { status: "unanswered", level: null, invalid: false };
  }
  const minimum = Number(availableMinimum);
  const maximum = Number(availableMaximum);
  const requiredMinimum = Number(mapping.requiredMinimumEur);
  const requiredPreferred = Number(mapping.requiredPreferredEur || mapping.requiredMinimumEur);

  if (![minimum, maximum, requiredMinimum, requiredPreferred].every(Number.isFinite) || minimum < 0 || maximum < minimum || requiredMinimum <= 0) {
    return { status: "unanswered", level: null, invalid: maximum < minimum };
  }
  if (maximum === 0) return { status: "answered", level: 0, invalid: false };
  if (maximum < requiredMinimum * 0.5) return { status: "answered", level: 1, invalid: false };
  if (minimum < requiredMinimum) return { status: "answered", level: 2, invalid: false };
  if (minimum < requiredPreferred) return { status: "answered", level: 3, invalid: false };
  return { status: "answered", level: 4, invalid: false };
}

function updateFundingRangeAnswer(control) {
  const key = control.dataset.answerKey;
  const projectId = control.dataset.projectId;
  const mapping = (requirementProfiles[projectId] || []).find((item) => item.id === control.dataset.mappingId);
  if (!key || !mapping) return;
  answers[key] ||= { status: "unanswered", level: null, evidence: "" };
  if (control.dataset.answerAction === "funding-minimum") answers[key].availableMinimumEur = control.value === "" ? null : Number(control.value);
  if (control.dataset.answerAction === "funding-maximum") answers[key].availableMaximumEur = control.value === "" ? null : Number(control.value);
  const state = calculateFundingState(mapping, answers[key].availableMinimumEur, answers[key].availableMaximumEur);
  answers[key].status = state.status;
  answers[key].level = state.level;
  answers[key].rangeInvalid = state.invalid;
}

function renderFundingAnswerControl(project, mapping, key, answer) {
  return `
    <div class="answer-control funding-answer-control">
      <span class="control-label">Available funding range</span>
      <div class="funding-range-inputs">
        <label>From (EUR)<input type="number" min="0" step="10000" data-answer-action="funding-minimum" data-answer-key="${escapeHtml(key)}" data-project-id="${escapeHtml(project.id)}" data-mapping-id="${escapeHtml(mapping.id)}" value="${answer.availableMinimumEur ?? ""}" ${answer.status === "unknown" ? "disabled" : ""}></label>
        <label>To (EUR)<input type="number" min="0" step="10000" data-answer-action="funding-maximum" data-answer-key="${escapeHtml(key)}" data-project-id="${escapeHtml(project.id)}" data-mapping-id="${escapeHtml(mapping.id)}" value="${answer.availableMaximumEur ?? ""}" ${answer.status === "unknown" ? "disabled" : ""}></label>
      </div>
      <label class="unknown-toggle"><input type="checkbox" data-answer-action="funding-unknown" data-answer-key="${escapeHtml(key)}" data-project-id="${escapeHtml(project.id)}" data-mapping-id="${escapeHtml(mapping.id)}" ${answer.status === "unknown" ? "checked" : ""}> Cannot determine</label>
      <div class="calculated-funding-state ${answer.status}">
        ${fundingStateMessage(mapping, answer)}
      </div>
    </div>
  `;
}

function fundingStateMessage(mapping, answer) {
  const selectedState = answer.status === "answered"
    ? optionsForMapping(mapping).find((option) => option.level === Number(answer.level))
    : null;
  if (answer.rangeInvalid) return "The upper value must be equal to or higher than the lower value.";
  if (selectedState) return `Calculated state: <strong>${selectedState.level} · ${escapeHtml(selectedState.label)}</strong>`;
  if (answer.status === "unknown") return "Funding evidence remains unresolved.";
  return "Enter both ends of the available range.";
}

function assessmentMappings(projectId) {
  return (requirementProfiles[projectId] || []).filter((mapping) => mapping.included && mapping.approved);
}

function renderAssessmentProgress(project, mappings) {
  const answeredCount = mappings.filter((mapping) => answers[answerKey(project.id, mapping)]?.status === "answered").length;
  const unknownCount = mappings.filter((mapping) => answers[answerKey(project.id, mapping)]?.status === "unknown").length;
  const percent = mappings.length ? Math.round((answeredCount / mappings.length) * 100) : 0;
  elements.assessmentProgress.innerHTML = `
    <div><span>${escapeHtml(project.title)}</span><strong>${answeredCount} / ${mappings.length} answered</strong></div>
    <div class="assessment-progress-track"><span style="width:${percent}%"></span></div>
    <p>${unknownCount ? `${unknownCount} requirement${unknownCount === 1 ? "" : "s"} marked as unknown.` : "Unknowns remain separate from the maturity scale."}</p>
  `;
}

function refreshFundingDisplay(control) {
  const key = control.dataset.answerKey;
  const project = projectById(control.dataset.projectId);
  const mapping = (requirementProfiles[control.dataset.projectId] || []).find((item) => item.id === control.dataset.mappingId);
  const answer = answers[key];
  const article = control.closest(".assessment-question");
  if (!project || !mapping || !answer || !article) return;
  article.classList.remove("answered", "unanswered", "unknown");
  article.classList.add(answer.status);
  const state = article.querySelector(".calculated-funding-state");
  if (state) {
    state.className = `calculated-funding-state ${answer.status}`;
    state.innerHTML = fundingStateMessage(mapping, answer);
  }
  renderAssessmentProgress(project, assessmentMappings(project.id));
  updateSidebar();
}

function renderAssessment() {
  if (!projects.length || !confirmedProjects.size) {
    elements.assessmentTabs.innerHTML = "";
    elements.assessmentProgress.innerHTML = "";
    elements.assessmentList.className = "assessment-list empty-state";
    elements.assessmentList.innerHTML = "<p>Confirm the requirement profiles before starting the assessment.</p>";
    return;
  }

  activeAssessmentProjectId ||= projects[0].id;
  renderProjectTabs(elements.assessmentTabs, activeAssessmentProjectId, "data-assessment-tab");
  const project = projectById(activeAssessmentProjectId);
  const mappings = assessmentMappings(activeAssessmentProjectId);
  renderAssessmentProgress(project, mappings);

  const grouped = mappings.reduce((groups, mapping) => {
    groups[mapping.requirement.category] ||= [];
    groups[mapping.requirement.category].push(mapping);
    return groups;
  }, {});

  elements.assessmentList.className = "assessment-list";
  elements.assessmentList.innerHTML = Object.entries(grouped).map(([category, items]) => `
    <section class="assessment-category">
      <header><h3>${escapeHtml(category)}</h3><span>${items.length} ${items.length === 1 ? "question" : "questions"}</span></header>
      ${items.map((mapping) => renderAssessmentQuestion(project, mapping)).join("")}
    </section>
  `).join("");
}

function renderAssessmentQuestion(project, mapping) {
  const key = answerKey(project.id, mapping);
  const answer = answers[key] || { status: "unanswered", level: null, evidence: "" };
  const options = optionsForMapping(mapping);
  const shared = key.startsWith("company:");
  const answerControl = isFundingMapping(mapping)
    ? renderFundingAnswerControl(project, mapping, key, answer)
    : `<div class="answer-control">
        <label for="answer-${escapeHtml(project.id)}-${escapeHtml(mapping.id)}">Observed state</label>
        <select id="answer-${escapeHtml(project.id)}-${escapeHtml(mapping.id)}" data-answer-action="level" data-answer-key="${escapeHtml(key)}">
          <option value="" ${answer.status === "unanswered" ? "selected" : ""}>Select an observable state</option>
          ${options.map((option) => `<option value="${option.level}" ${answer.status === "answered" && Number(answer.level) === option.level ? "selected" : ""}>${option.level} · ${escapeHtml(option.label)}</option>`).join("")}
          <option value="unknown" ${answer.status === "unknown" ? "selected" : ""}>Cannot determine</option>
        </select>
      </div>`;
  return `
    <article class="assessment-question ${answer.status}">
      <div class="question-main">
        <div class="question-meta">
          <span class="requirement-id">${escapeHtml(mapping.id)}</span>
          <span>${escapeHtml(mapping.requirement.title)}</span>
          <span class="importance-tag ${mapping.importance}">${escapeHtml(importanceLabels[mapping.importance])}</span>
          ${shared ? `<span class="shared-answer-tag">Shared company answer</span>` : ""}
        </div>
        <h4>${escapeHtml(questionText(mapping, project))}</h4>
        <p class="required-state">Required for this project: <strong>${escapeHtml(targetLabel(mapping))}</strong></p>
        <div class="question-inline-actions"><button class="ask-ai-card" type="button" data-ask-assessment-ai data-project-id="${escapeHtml(project.id)}" data-mapping-id="${escapeHtml(mapping.id)}">Ask AI</button></div>
      </div>
      ${answerControl}
      <details>
        <summary>View answer guidance and add evidence</summary>
        <div class="answer-guidance">
          <ol>${options.map((option) => `<li><strong>${option.level} · ${escapeHtml(option.label)}</strong><span>${escapeHtml(option.anchor)}</span></li>`).join("")}</ol>
          <label>Evidence or comment<textarea rows="2" data-answer-action="evidence" data-answer-key="${escapeHtml(key)}" placeholder="Optional evidence, source or uncertainty note">${escapeHtml(answer.evidence)}</textarea></label>
        </div>
      </details>
    </article>
  `;
}

function assistantSelection() {
  const project = projectById(assessmentAssistantState.projectId);
  const mapping = (requirementProfiles[assessmentAssistantState.projectId] || []).find((item) => item.id === assessmentAssistantState.mappingId);
  return { project, mapping };
}

function renderAssessmentAssistant() {
  const { project, mapping } = assistantSelection();
  if (!project || !mapping) return;
  const options = optionsForMapping(mapping);
  const connected = requirementLlmState.status === "ready" && requirementLlmState.ratingModel;
  elements.assistantRequirement.innerHTML = `
    <strong>${escapeHtml(mapping.id)} · ${escapeHtml(mapping.requirement.title)}</strong>
    <span>${escapeHtml(questionText(mapping, project))}</span>
    <span>Required for this project: <strong>${escapeHtml(targetLabel(mapping))}</strong></span>
  `;
  elements.assistantRequest.disabled = assessmentAssistantState.loading || !connected;
  elements.assistantRequest.textContent = assessmentAssistantState.loading ? "Assessing..." : "Suggest assessment";
  elements.assistantApply.disabled = !assessmentAssistantState.suggestion || assessmentAssistantState.loading;
  if (assessmentAssistantState.loading) {
    elements.assistantStatus.className = "assistant-status";
    elements.assistantStatus.textContent = "Preparing a suggested assessment from the selected requirement, project context and your notes.";
  } else if (!connected) {
    elements.assistantStatus.className = "assistant-status error";
    elements.assistantStatus.textContent = "AI is currently unavailable. Start the prototype through the Start Prototype script and configure LiteLLM before requesting a suggestion.";
  } else if (!assessmentAssistantState.suggestion) {
    elements.assistantStatus.className = "assistant-status";
    elements.assistantStatus.textContent = "Only the context entered here is sent to the configured LiteLLM endpoint. The consultant remains responsible for the final assessment.";
  }
  if (!assessmentAssistantState.suggestion) {
    elements.assistantResult.hidden = true;
    elements.assistantResult.innerHTML = "";
    elements.assistantFollowUp.hidden = true;
    return;
  }
  const suggestion = assessmentAssistantState.suggestion;
  const score = isFundingMapping(mapping)
    ? formatFundingRange(suggestion.availableMinimumEur, suggestion.availableMaximumEur)
    : `${suggestion.level} · ${escapeHtml(options.find((option) => option.level === suggestion.level)?.label || "Suggested state")}`;
  elements.assistantResult.hidden = false;
  elements.assistantResult.innerHTML = `
    <div><span>Suggested assessment</span><strong>${score}</strong></div>
    <div><span>Confidence</span><strong>${escapeHtml(suggestion.confidence)}</strong></div>
    <div class="assistant-wide assistant-clarification"><span>Clarification question</span><p>${escapeHtml(suggestion.followUpQuestion)}</p></div>
    <details class="assistant-wide assistant-rationale"><summary>View rationale</summary><p>${escapeHtml(suggestion.rationale)}</p></details>
  `;
  elements.assistantFollowUp.hidden = false;
  elements.assistantRefine.disabled = assessmentAssistantState.loading;
  elements.assistantStatus.className = "assistant-status ready";
  elements.assistantStatus.textContent = "Suggestion ready. Add the client’s answer to the follow-up question to refine it, or apply it only if it reflects the evidence.";
}

async function openAssessmentAssistant(projectId, mappingId) {
  assessmentAssistantState.projectId = projectId;
  assessmentAssistantState.mappingId = mappingId;
  assessmentAssistantState.loading = false;
  assessmentAssistantState.suggestion = null;
  elements.assistantContext.value = "";
  elements.assistantFollowUpContext.value = "";
  elements.assistantModal.hidden = false;
  if (requirementLlmState.status !== "ready") await connectRequirementLlm();
  renderAssessmentAssistant();
  elements.assistantContext.focus();
}

function closeAssessmentAssistant() {
  assessmentAssistantState.loading = false;
  elements.assistantModal.hidden = true;
}

async function requestAssessmentSuggestion() {
  const { project, mapping } = assistantSelection();
  const model = requirementLlmState.ratingModel;
  if (!project || !mapping || !model) return;
  const clientContext = elements.assistantContext.value.trim();
  if (!clientContext) {
    elements.assistantStatus.className = "assistant-status error";
    elements.assistantStatus.textContent = "Add the client information discussed for this requirement before requesting a suggestion.";
    return;
  }
  assessmentAssistantState.loading = true;
  assessmentAssistantState.suggestion = null;
  renderAssessmentAssistant();
  try {
    const response = await fetch("/api/assess-requirement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        project: selectionProjectPayload(project),
        requirement: {
          id: mapping.id,
          title: mapping.requirement.title,
          category: mapping.requirement.category,
          assessmentQuestion: questionText(mapping, project),
          requiredLevel: mapping.requiredLevel,
          requiredLabel: targetLabel(mapping),
          importance: mapping.importance,
          scale: optionsForMapping(mapping),
          isFunding: isFundingMapping(mapping),
          requiredMinimumEur: mapping.requiredMinimumEur,
          requiredPreferredEur: mapping.requiredPreferredEur
        },
        clientContext
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Assessment suggestion returned ${response.status}.`);
    const suggestion = payload.suggestion || {};
    if (isFundingMapping(mapping)) {
      const minimum = Number(suggestion.availableMinimumEur);
      const maximum = Number(suggestion.availableMaximumEur);
      if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum < minimum) throw new Error("The model did not return a valid available funding range.");
      assessmentAssistantState.suggestion = { ...suggestion, availableMinimumEur: minimum, availableMaximumEur: maximum };
    } else {
      const level = Number(suggestion.level);
      if (!Number.isInteger(level) || !optionsForMapping(mapping).some((option) => option.level === level)) throw new Error("The model did not return a valid assessment level.");
      assessmentAssistantState.suggestion = { ...suggestion, level };
    }
  } catch (error) {
    elements.assistantStatus.className = "assistant-status error";
    elements.assistantStatus.textContent = `Suggestion failed: ${error.message || "The AI service could not be reached."}`;
  }
  assessmentAssistantState.loading = false;
  renderAssessmentAssistant();
}

async function refineAssessmentSuggestion() {
  const followUpAnswer = elements.assistantFollowUpContext.value.trim();
  if (!followUpAnswer) {
    elements.assistantStatus.className = "assistant-status error";
    elements.assistantStatus.textContent = "Add the client’s answer to the follow-up question before refining the suggestion.";
    return;
  }
  const existingContext = elements.assistantContext.value.trim();
  elements.assistantContext.value = `${existingContext}\n\nFollow-up answer from the client:\n${followUpAnswer}`.trim();
  elements.assistantFollowUpContext.value = "";
  await requestAssessmentSuggestion();
}

function applyAssessmentSuggestion() {
  const { project, mapping } = assistantSelection();
  const suggestion = assessmentAssistantState.suggestion;
  if (!project || !mapping || !suggestion) return;
  const key = answerKey(project.id, mapping);
  answers[key] ||= { status: "unanswered", level: null, evidence: "" };
  if (isFundingMapping(mapping)) {
    const funding = calculateFundingState(mapping, suggestion.availableMinimumEur, suggestion.availableMaximumEur);
    Object.assign(answers[key], {
      status: funding.status,
      level: funding.level,
      availableMinimumEur: suggestion.availableMinimumEur,
      availableMaximumEur: suggestion.availableMaximumEur,
      rangeInvalid: funding.invalid
    });
  } else {
    answers[key].status = "answered";
    answers[key].level = suggestion.level;
  }
  answers[key].evidence = [answers[key].evidence, `AI-assisted note: ${suggestion.rationale}`].filter(Boolean).join("\n");
  closeAssessmentAssistant();
  renderAssessment();
  updateSidebar();
}

function loadDemoResponses() {
  const overrides = {
    "DEMO-01:SR04": 2, "DEMO-01:SA02": 2, "DEMO-01:SA03": 2,
    "DEMO-01:SA05": 2, "DEMO-01:SA12": 2,
    "DEMO-02:SR04": 2, "DEMO-02:KB02": 2, "DEMO-02:KB03": 2,
    "DEMO-02:KB04": 2, "DEMO-02:KB06": 2, "DEMO-02:KB09": 2,
    "DEMO-03:OE04": 1, "DEMO-03:OE07": 2, "DEMO-03:OE09": 2,
    "DEMO-03:OE11": 1, "DEMO-03:OE12": 2, "DEMO-03:P-DEMO03-01": "unknown"
  };
  const fundingRanges = {
    "DEMO-01:SR01": { minimum: 150000, maximum: 220000 },
    "DEMO-02:SR01": { minimum: 100000, maximum: 180000 },
    "DEMO-03:SR01": { minimum: 100000, maximum: 180000 }
  };

  projects.forEach((project) => {
    assessmentMappings(project.id).forEach((mapping) => {
      const key = answerKey(project.id, mapping);
      const overrideKey = `${project.id}:${mapping.id}`;
      if (isFundingMapping(mapping)) {
        const range = fundingRanges[overrideKey];
        if (!range) {
          answers[key] = { status: "unknown", level: null, evidence: "No funding range was available in the demonstration context." };
          return;
        }
        const state = calculateFundingState(mapping, range.minimum, range.maximum);
        answers[key] = {
          status: state.status,
          level: state.level,
          availableMinimumEur: range.minimum,
          availableMaximumEur: range.maximum,
          rangeInvalid: false,
          evidence: "Indicative client funding range from the mock assessment workshop."
        };
        return;
      }
      const target = Number(mapping.requiredLevel ?? 3);
      const value = Object.prototype.hasOwnProperty.call(overrides, overrideKey) ? overrides[overrideKey] : target;
      answers[key] = value === "unknown"
        ? { status: "unknown", level: null, evidence: "Evidence not available during the initial client workshop." }
        : { status: "answered", level: Number(value), evidence: "Demonstration response based on the mock client context." };
    });
  });

  renderAssessment();
  updateSidebar();
}

function fitValue(actualLevel, requiredLevel) {
  const gap = Math.max(0, Number(requiredLevel) - Number(actualLevel));
  if (gap === 0) return 100;
  if (gap === 1) return 70;
  if (gap === 2) return 30;
  return 0;
}

function calculateProjectResult(project) {
  const mappings = assessmentMappings(project.id);
  let weightedFit = 0;
  let answeredWeight = 0;
  let totalWeight = 0;
  const calculations = [];

  mappings.forEach((mapping) => {
    const key = answerKey(project.id, mapping);
    const answer = answers[key] || { status: "unanswered", level: null };
    const weight = importanceWeights[mapping.importance];
    const requiredLevel = Number(mapping.requiredLevel ?? 3);
    totalWeight += weight;

    if (answer.status !== "answered") {
      calculations.push({ mapping, answer, status: answer.status, weight, requiredLevel, fit: null, gap: null });
      return;
    }

    const gap = Math.max(0, requiredLevel - Number(answer.level));
    const fit = fitValue(answer.level, requiredLevel);
    weightedFit += fit * weight;
    answeredWeight += weight;
    calculations.push({ mapping, answer, status: "answered", level: Number(answer.level), weight, requiredLevel, fit, gap });
  });

  const baselineScore = answeredWeight ? Math.round(weightedFit / answeredWeight) : 0;
  const coverage = totalWeight ? Math.round((answeredWeight / totalWeight) * 100) : 0;
  const criticalUnknown = calculations.filter((item) => item.mapping.importance === "critical" && item.status !== "answered");
  const criticalGaps = calculations.filter((item) => item.mapping.importance === "critical" && item.status === "answered" && item.gap > 0);
  const criticalPenalty = criticalGaps.reduce((total, item) => total + (8 * item.gap * item.gap), 0);
  const adjustedScore = Math.max(0, Math.round(baselineScore - criticalPenalty));
  const scoreConfirmed = !criticalUnknown.length && coverage >= 60;
  const score = scoreConfirmed ? adjustedScore : null;

  let status = "Insufficient evidence";
  let statusClass = "unknown";
  if (!scoreConfirmed) {
    status = "Insufficient evidence";
    statusClass = "unknown";
  } else if (score < 40) {
    status = "Do not pursue now";
    statusClass = "stop";
  } else if (score < 60) {
    status = "Foundations required";
    statusClass = "foundations";
  } else if (score < 80) {
    status = "Conditionally ready";
    statusClass = "conditional";
  } else {
    status = "Ready for discovery / MVP planning";
    statusClass = "ready";
  }

  const blockers = calculations
    .filter((item) => item.mapping.importance === "critical" && (item.status !== "answered" || item.gap > 0))
    .sort((a, b) => (b.gap ?? 99) - (a.gap ?? 99));

  return { project, score, baselineScore, criticalPenalty, coverage, status, statusClass, calculations, blockers };
}

function renderResults() {
  if (!projects.length) {
    elements.results.className = "result-summary empty-state";
    elements.results.innerHTML = "<p>Load and assess the demonstration projects first.</p>";
    return;
  }

  const results = projects.map(calculateProjectResult).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const confirmedScores = results.filter((result) => result.score !== null).map((result) => result.score);
  elements.results.className = "result-summary";
  elements.results.innerHTML = `
    <section class="portfolio-overview">
      <div><span>Projects assessed</span><strong>${results.length}</strong></div>
      <div><span>Average readiness</span><strong>${confirmedScores.length ? Math.round(confirmedScores.reduce((sum, score) => sum + score, 0) / confirmedScores.length) : "Not confirmed"}</strong></div>
      <div><span>Ready or conditional</span><strong>${results.filter((result) => ["ready", "conditional"].includes(result.statusClass)).length}</strong></div>
    </section>
    <div class="result-project-list">
      ${results.map((result, index) => renderProjectResult(result, index)).join("")}
    </div>
  `;
}

function renderProjectResult(result, index) {
  const topBlockers = result.blockers.slice(0, 3);
  return `
    <article class="result-project-card ${result.statusClass}">
      <div class="result-rank">${index + 1}</div>
      <div class="result-project-main">
        <p class="eyebrow">${escapeHtml(result.project.id)}</p>
        <h3>${escapeHtml(result.project.title)}</h3>
        <span class="result-status ${result.statusClass}">${escapeHtml(result.status)}</span>
        <div class="result-metrics">
          <div class="headline-result"><span>Readiness</span><strong>${result.score ?? "Not confirmed"}</strong></div>
          <div><span>Baseline maturity</span><strong>${result.baselineScore}</strong></div>
          <div><span>Critical adjustment</span><strong>${result.criticalPenalty ? `-${result.criticalPenalty}` : "0"}</strong></div>
          <div><span>Evidence coverage</span><strong>${result.coverage}%</strong></div>
          <div><span>Critical gaps</span><strong>${result.blockers.length}</strong></div>
        </div>
        <div class="blocker-preview">
          <span>Priority findings</span>
          ${topBlockers.length ? `<ul>${topBlockers.map((item) => `<li><strong>${escapeHtml(item.mapping.requirement.title)}</strong><span>${item.status === "answered" ? `${item.gap} level${item.gap === 1 ? "" : "s"} below target` : "Evidence unresolved"}</span></li>`).join("")}</ul>` : `<p>No critical gaps identified in the answered profile.</p>`}
        </div>
        <div class="result-library-action">
          <button class="secondary" type="button" data-library-project="${escapeHtml(result.project.id)}">Prepare library entry</button>
        </div>
        <details>
          <summary>View full calculation</summary>
          <div class="score-derivation"><span>Baseline maturity <strong>${result.baselineScore}</strong></span><span>Critical-gap adjustment <strong>${result.criticalPenalty ? `-${result.criticalPenalty}` : "0"}</strong></span><span>Final readiness <strong>${result.score ?? "Not confirmed"}</strong></span></div>
          <div class="calculation-table">
            <div class="calculation-row header"><span>Requirement</span><span>Importance</span><span>Observed</span><span>Required</span><span>Fit</span></div>
            ${result.calculations.map((item) => {
              const isFunding = isFundingMapping(item.mapping);
              const observed = item.status !== "answered"
                ? "Unknown"
                : isFunding
                  ? `${formatFundingRange(item.answer.availableMinimumEur, item.answer.availableMaximumEur)} (level ${item.level})`
                  : `Level ${item.level}`;
              const required = isFunding ? targetLabel(item.mapping) : `Level ${item.requiredLevel}`;
              return `<div class="calculation-row"><span>${escapeHtml(item.mapping.requirement.title)}</span><span>${escapeHtml(importanceLabels[item.mapping.importance])}</span><span>${escapeHtml(observed)}</span><span>${escapeHtml(required)}</span><span>${item.fit ?? "-"}</span></div>`;
            }).join("")}
          </div>
        </details>
      </div>
    </article>
  `;
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setNestedValue(target, path, value) {
  const parts = path.split(".");
  const finalKey = parts.pop();
  const parent = parts.reduce((current, key) => current[key], target);
  parent[finalKey] = value;
}

function observedLabel(mapping, answer) {
  if (!answer || answer.status !== "answered") return answer?.status === "unknown" ? "Cannot determine" : "Not answered";
  if (isFundingMapping(mapping)) return `${formatFundingRange(answer.availableMinimumEur, answer.availableMaximumEur)} (level ${answer.level})`;
  return optionsForMapping(mapping).find((option) => option.level === Number(answer.level))?.label || `Level ${answer.level}`;
}

function buildLibraryRequirement(project, mapping) {
  const answer = answers[answerKey(project.id, mapping)] || { status: "unanswered", level: null, evidence: "" };
  const scaleOptions = optionsForMapping(mapping).map((option) => ({ level: option.level, label: option.label }));
  return {
    id: mapping.id,
    catalogRequirementId: mapping.source === "catalog" ? mapping.id : null,
    source: mapping.source,
    includeInLibrary: true,
    title: mapping.requirement.title,
    category: mapping.requirement.category,
    statement: mapping.requirement.statement,
    assessmentQuestion: questionText(mapping, project),
    criticality: mapping.importance,
    requiredLevel: Number(mapping.requiredLevel ?? 3),
    requiredLabel: targetLabel(mapping),
    requiredMinimumEur: mapping.requiredMinimumEur ?? null,
    requiredPreferredEur: mapping.requiredPreferredEur ?? null,
    observedStatus: answer.status,
    observedLevel: answer.level,
    observedLabel: observedLabel(mapping, answer),
    evidence: answer.evidence || "",
    notes: "",
    scaleId: mapping.requirement.scale_id,
    scaleOptions,
    sourceSnapshot: {
      criticality: mapping.importance,
      requiredLevel: Number(mapping.requiredLevel ?? 3),
      observedStatus: answer.status,
      observedLevel: answer.level,
      observedLabel: observedLabel(mapping, answer)
    }
  };
}

function createLibraryDraft(project) {
  const result = calculateProjectResult(project);
  const includedMappings = (requirementProfiles[project.id] || []).filter((mapping) => mapping.included && mapping.approved);
  return {
    schemaVersion: "0.1.0",
    recordStatus: "draft",
    project: {
      sourceProjectId: project.id,
      title: project.title,
      businessFunction: project.businessFunction,
      problem: project.problem,
      proposedSolution: project.proposedSolution,
      intendedOutcome: project.intendedOutcome,
      users: project.users,
      process: project.process,
      scale: project.scale,
      humanOversight: project.humanOversight,
      dataSources: (project.dataSources || []).map((source) => `${source.name} | ${source.status} | ${source.detail}`).join("\n"),
      capabilities: (project.capabilities || []).join("\n"),
      systems: (project.systems || []).join("\n")
    },
    classification: {
      libraryTitle: project.title,
      useCasePattern: project.capabilities?.slice(0, 2).join(" + ") || project.businessFunction,
      industryApplicability: "Cross-industry",
      reusableTags: [project.businessFunction, ...(project.capabilities || [])].join("\n"),
      includeNamedClient: false
    },
    outcomes: {
      lifecycleStatus: "Readiness assessed",
      implementationStatus: "Not started",
      roadblocks: (project.constraints || []).join("\n"),
      estimatedImplementationCostEur: "",
      actualImplementationCostEur: "",
      estimatedAnnualBenefitEur: "",
      actualAnnualBenefitEur: "",
      roiStatus: "Not yet measured",
      timeToValueMonths: "",
      otherBenefits: project.intendedOutcome,
      lessonsLearned: "",
      comments: ""
    },
    assessmentSnapshot: {
      readinessScore: result.score,
      evidenceCoverage: result.coverage,
      status: result.status,
      criticalGapCount: result.blockers.length
    },
    requirements: includedMappings.map((mapping) => buildLibraryRequirement(project, mapping)),
    lastExportedAt: null
  };
}

function ensureLibraryDraft(projectId, reset = false) {
  const project = projectById(projectId);
  if (!project) return null;
  if (reset || !libraryDrafts[projectId]) libraryDrafts[projectId] = createLibraryDraft(project);
  return libraryDrafts[projectId];
}

function libraryCompleteness(draft) {
  const checks = [
    draft.project.title,
    draft.project.problem,
    draft.project.proposedSolution,
    draft.project.intendedOutcome,
    draft.outcomes.lifecycleStatus,
    draft.outcomes.roadblocks,
    draft.outcomes.otherBenefits,
    draft.outcomes.lessonsLearned,
    draft.outcomes.comments,
    draft.requirements.some((requirement) => requirement.includeInLibrary)
  ];
  return { complete: checks.filter(Boolean).length, total: checks.length };
}

function requirementsForCatalogReview(draft) {
  return draft.requirements.filter((requirement) => requirement.includeInLibrary
    && !requirement.catalogRequirementId
    && ["consultant_added", "provisional", "project_specific"].includes(requirement.source));
}

function catalogReviewPayload(project, draft) {
  const candidates = requirementsForCatalogReview(draft).map((requirement) => ({
    requirementId: requirement.id,
    title: requirement.title,
    category: requirement.category,
    statement: requirement.statement,
    assessmentQuestion: requirement.assessmentQuestion,
    criticality: requirement.criticality,
    requiredLevel: requirement.requiredLevel,
    evidence: requirement.evidence,
    notes: requirement.notes
  }));

  return {
    task: "requirement_catalog_deduplication",
    taskDescription: "Review project-specific requirements before they are admitted to the controlled requirement catalog. This is a recommendation only; the consultant makes the final decision.",
    decisionRules: [
      "Recommend reuse only when the proposed requirement has the same assessable condition and response logic as an existing catalog entry.",
      "Recommend variant when the core condition is shared but the proposed requirement needs a narrower project or domain-specific formulation.",
      "Recommend new when the condition is materially distinct. Do not merge items merely because they belong to the same broad topic.",
      "Recommend uncertain when the project information is insufficient. Explain which clarification would resolve the decision."
    ],
    responseContract: {
      reviews: [{
        requirementId: "String, copied from candidateRequirements",
        recommendation: "reuse | variant | new | uncertain",
        matchedCatalogRequirementId: "Existing requirement ID, or null",
        suggestedTitle: "Short reusable title",
        confidence: "high | medium | low",
        rationale: "Concise explanation grounded in the assessment condition",
        consultantAction: "reuse_existing | create_variant | add_new | clarify_first"
      }]
    },
    projectContext: {
      projectId: project.id,
      title: draft.project.title,
      businessFunction: draft.project.businessFunction,
      problem: draft.project.problem,
      proposedSolution: draft.project.proposedSolution,
      intendedOutcome: draft.project.intendedOutcome,
      systems: splitLines(draft.project.systems),
      dataSources: splitLines(draft.project.dataSources)
    },
    candidateRequirements: candidates,
    catalog: catalog.map((requirement) => ({
      id: requirement.id,
      title: requirement.title,
      category: requirement.category,
      statement: requirement.statement,
      assessmentQuestion: requirement.question_template || requirement.assessment_question || "",
      selectionTags: requirement.selection_tags || [],
      scaleId: requirement.scale_id || ""
    }))
  };
}

function catalogReviewConfigReady() {
  return Boolean(libraryDedupLlmConfig.enabled && libraryDedupLlmConfig.endpoint && libraryDedupLlmConfig.model);
}

function recommendationLabel(value) {
  return ({ reuse: "Reuse existing", variant: "Create variant", new: "Add as new", uncertain: "Clarify first" })[value] || "Pending review";
}

function renderCatalogReview(project, draft) {
  const candidates = requirementsForCatalogReview(draft);
  const reviewState = libraryDedupReviews[project.id];
  const ready = catalogReviewConfigReady();

  if (!candidates.length) {
    return `
      <section class="library-editor-section library-dedup-section">
        <header class="library-section-head"><span>04</span><div><p class="eyebrow">Catalog governance</p><h3>Optional LLM deduplication review</h3><p>Only consultant-added or provisional requirements are reviewed before they are considered for the shared catalog.</p></div></header>
        <div class="catalog-review-empty"><strong>No new requirements need review</strong><p>All retained requirements in this record already have catalog lineage.</p></div>
      </section>
    `;
  }

  const reviewCards = reviewState?.status === "complete"
    ? reviewState.reviews.map((review) => {
        const candidate = candidates.find((requirement) => requirement.id === review.requirementId);
        const match = catalogById.get(review.matchedCatalogRequirementId);
        return `
          <article class="catalog-review-card ${escapeHtml(review.recommendation || "uncertain")}">
            <div><span class="catalog-review-status">${escapeHtml(recommendationLabel(review.recommendation))}</span><strong>${escapeHtml(candidate?.title || review.requirementId)}</strong></div>
            <dl>
              <div><dt>Suggested title</dt><dd>${escapeHtml(review.suggestedTitle || candidate?.title || "Not provided")}</dd></div>
              <div><dt>Closest catalog entry</dt><dd>${match ? `${escapeHtml(match.id)} - ${escapeHtml(match.title)}` : "No match proposed"}</dd></div>
              <div><dt>Confidence</dt><dd>${escapeHtml(review.confidence || "Not provided")}</dd></div>
              <div><dt>Consultant action</dt><dd>${escapeHtml((review.consultantAction || "").replaceAll("_", " ") || "Confirm manually")}</dd></div>
            </dl>
            <p>${escapeHtml(review.rationale || "No rationale returned.")}</p>
          </article>
        `;
      }).join("")
    : "";
  const stateMessage = reviewState?.status === "running"
    ? "The LLM is reviewing the proposed additions."
    : reviewState?.status === "error"
      ? `The review could not run: ${escapeHtml(reviewState.message)}`
      : ready
        ? "The connector is configured. Run a review when the reusable requirements are ready."
        : "The connector is prepared but not configured. You can still download the exact review brief for inspection.";

  return `
    <section class="library-editor-section library-dedup-section">
      <header class="library-section-head"><span>04</span><div><p class="eyebrow">Catalog governance</p><h3>Optional LLM deduplication review</h3><p>Review ${candidates.length} proposed ${candidates.length === 1 ? "addition" : "additions"} against the controlled catalog only when maintaining the shared library.</p></div></header>
      <div class="catalog-review-callout ${ready ? "ready" : "setup"}">
        <div><strong>${ready ? "LLM connector ready" : "LLM connector not configured"}</strong><p>${stateMessage}</p></div>
        <div class="catalog-review-actions">
          <button class="secondary" type="button" data-download-catalog-review>Download review brief</button>
          <button class="primary-action" type="button" data-run-catalog-review ${ready || reviewState?.status === "running" ? "" : "disabled"}>${reviewState?.status === "running" ? "Reviewing..." : "Run LLM review"}</button>
        </div>
      </div>
      <p class="catalog-review-note">The LLM may recommend reuse, a variant, a genuinely new entry or a clarification. It cannot change the catalog or export record without consultant approval.</p>
      ${reviewCards ? `<div class="catalog-review-grid">${reviewCards}</div>` : ""}
    </section>
  `;
}

function downloadCatalogReviewBrief() {
  const project = projectById(activeLibraryProjectId);
  const draft = ensureLibraryDraft(activeLibraryProjectId);
  if (!project || !draft) return;
  const payload = catalogReviewPayload(project, draft);
  const safeName = (draft.classification.libraryTitle || project.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `catalog-review-brief-${safeName || project.id.toLowerCase()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function extractCatalogReviews(payload) {
  const reviews = payload?.reviews || payload?.result?.reviews || payload?.output?.reviews;
  if (!Array.isArray(reviews)) throw new Error("The connector did not return a reviews array.");
  return reviews.map((review) => ({
    requirementId: String(review.requirementId || ""),
    recommendation: ["reuse", "variant", "new", "uncertain"].includes(review.recommendation) ? review.recommendation : "uncertain",
    matchedCatalogRequirementId: review.matchedCatalogRequirementId || null,
    suggestedTitle: review.suggestedTitle || "",
    confidence: ["high", "medium", "low"].includes(review.confidence) ? review.confidence : "low",
    rationale: review.rationale || "",
    consultantAction: review.consultantAction || "clarify_first"
  }));
}

async function runCatalogReview() {
  const project = projectById(activeLibraryProjectId);
  const draft = ensureLibraryDraft(activeLibraryProjectId);
  if (!project || !draft || !catalogReviewConfigReady()) return;
  const payload = catalogReviewPayload(project, draft);
  libraryDedupReviews[project.id] = { status: "running", reviews: [] };
  renderLibraryEntry();

  try {
    const response = await fetch(libraryDedupLlmConfig.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: libraryDedupLlmConfig.model, task: payload.task, input: payload })
    });
    if (!response.ok) throw new Error(`Connector returned ${response.status}.`);
    const returnedReviews = extractCatalogReviews(await response.json());
    const reviewsByRequirementId = new Map(returnedReviews.map((review) => [review.requirementId, review]));
    const reviews = requirementsForCatalogReview(draft).map((requirement) => reviewsByRequirementId.get(requirement.id) || ({
      requirementId: requirement.id,
      recommendation: "uncertain",
      matchedCatalogRequirementId: null,
      suggestedTitle: requirement.title,
      confidence: "low",
      rationale: "The connector did not return a recommendation for this requirement.",
      consultantAction: "clarify_first"
    }));
    libraryDedupReviews[project.id] = { status: "complete", reviews, reviewedAt: new Date().toISOString() };
  } catch (error) {
    libraryDedupReviews[project.id] = { status: "error", reviews: [], message: error.message || "Unknown connector error." };
  }
  renderLibraryEntry();
}

function renderLibraryTabs() {
  elements.libraryTabs.innerHTML = projects.map((project, index) => `
    <button type="button" class="project-tab ${project.id === activeLibraryProjectId ? "active" : ""}" data-library-tab="${escapeHtml(project.id)}">
      <span>${index + 1}</span>${escapeHtml(project.title)}${libraryDrafts[project.id]?.lastExportedAt ? "<i>Exported</i>" : ""}
    </button>
  `).join("");
}

function renderLibraryRequirement(requirement, index) {
  const observedOptions = requirement.scaleOptions.length
    ? requirement.scaleOptions.map((option) => `<option value="${option.level}" ${Number(requirement.observedLevel) === option.level && requirement.observedStatus === "answered" ? "selected" : ""}>${option.level} · ${escapeHtml(option.label)}</option>`).join("")
    : [0, 1, 2, 3, 4].map((level) => `<option value="${level}" ${Number(requirement.observedLevel) === level && requirement.observedStatus === "answered" ? "selected" : ""}>Level ${level}</option>`).join("");
  const custom = requirement.source === "consultant_added";
  return `
    <details class="library-requirement-card">
      <summary>
        <span class="library-requirement-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="library-requirement-summary"><strong>${escapeHtml(requirement.title)}</strong><small>${escapeHtml(requirement.category)} · ${escapeHtml(importanceLabels[requirement.criticality] || requirement.criticality)}</small></span>
        <span class="source-badge ${requirement.source === "catalog" ? "catalog" : "new"}">${custom ? "Consultant added" : requirement.source === "catalog" ? "Catalog" : "Project-specific"}</span>
      </summary>
      <div class="library-requirement-body">
        <div class="library-requirement-toolbar">
          <label class="inline-check"><input type="checkbox" data-library-requirement-index="${index}" data-library-requirement-field="includeInLibrary" data-value-type="boolean" ${requirement.includeInLibrary ? "checked" : ""}> Include in exported record</label>
          ${custom ? `<button class="text-button danger" type="button" data-remove-library-requirement="${index}">Remove</button>` : ""}
        </div>
        <div class="library-form-grid two">
          <label>Requirement title<input type="text" value="${escapeHtml(requirement.title)}" data-library-requirement-index="${index}" data-library-requirement-field="title"></label>
          <label>Category<input type="text" value="${escapeHtml(requirement.category)}" data-library-requirement-index="${index}" data-library-requirement-field="category"></label>
        </div>
        <label>Requirement statement<textarea rows="2" data-library-requirement-index="${index}" data-library-requirement-field="statement">${escapeHtml(requirement.statement)}</textarea></label>
        <label>Assessment question<textarea rows="2" data-library-requirement-index="${index}" data-library-requirement-field="assessmentQuestion">${escapeHtml(requirement.assessmentQuestion)}</textarea></label>
        <div class="library-form-grid three">
          <label>Criticality<select data-library-requirement-index="${index}" data-library-requirement-field="criticality">
            ${Object.entries(importanceLabels).map(([value, label]) => `<option value="${value}" ${requirement.criticality === value ? "selected" : ""}>${label}</option>`).join("")}
          </select></label>
          <label>Required level<select data-library-requirement-index="${index}" data-library-requirement-field="requiredLevel" data-value-type="number">
            ${[0, 1, 2, 3, 4].map((level) => `<option value="${level}" ${Number(requirement.requiredLevel) === level ? "selected" : ""}>Level ${level}</option>`).join("")}
          </select></label>
          <label>Observed result<select data-library-requirement-index="${index}" data-library-requirement-field="observedLevel" data-value-type="observed">
            <option value="" ${requirement.observedStatus === "unanswered" ? "selected" : ""}>Not answered</option>
            ${observedOptions}
            <option value="unknown" ${requirement.observedStatus === "unknown" ? "selected" : ""}>Cannot determine</option>
          </select></label>
        </div>
        ${requirement.requiredMinimumEur !== null ? `<div class="library-form-grid two"><label>Minimum project budget (EUR)<input type="number" min="0" value="${escapeHtml(requirement.requiredMinimumEur)}" data-library-requirement-index="${index}" data-library-requirement-field="requiredMinimumEur" data-value-type="number"></label><label>Preferred project budget (EUR)<input type="number" min="0" value="${escapeHtml(requirement.requiredPreferredEur)}" data-library-requirement-index="${index}" data-library-requirement-field="requiredPreferredEur" data-value-type="number"></label></div>` : ""}
        <div class="library-form-grid two">
          <label>Evidence<textarea rows="3" placeholder="Evidence captured during the assessment" data-library-requirement-index="${index}" data-library-requirement-field="evidence">${escapeHtml(requirement.evidence)}</textarea></label>
          <label>Requirement notes<textarea rows="3" placeholder="What should a future team know about this prerequisite?" data-library-requirement-index="${index}" data-library-requirement-field="notes">${escapeHtml(requirement.notes)}</textarea></label>
        </div>
      </div>
    </details>
  `;
}

function renderLibraryEntry() {
  if (!projects.length) {
    elements.libraryTabs.innerHTML = "";
    elements.libraryStatus.innerHTML = "";
    elements.libraryEditor.className = "library-editor empty-state";
    elements.libraryEditor.innerHTML = "<p>Load the demonstration projects to prepare a library entry.</p>";
    return;
  }

  activeLibraryProjectId ||= projects[0].id;
  const project = projectById(activeLibraryProjectId) || projects[0];
  activeLibraryProjectId = project.id;
  const draft = ensureLibraryDraft(project.id);
  const completeness = libraryCompleteness(draft);
  const includedRequirements = draft.requirements.filter((requirement) => requirement.includeInLibrary).length;
  renderLibraryTabs();

  elements.libraryStatus.innerHTML = `
    <div><span>Current record</span><strong>${escapeHtml(draft.classification.libraryTitle)}</strong></div>
    <div><span>Readiness snapshot</span><strong>${draft.assessmentSnapshot.readinessScore} · ${escapeHtml(draft.assessmentSnapshot.status)}</strong></div>
    <div><span>Requirements retained</span><strong>${includedRequirements} of ${draft.requirements.length}</strong></div>
    <div><span>Reusable fields</span><strong>${completeness.complete} of ${completeness.total} populated</strong></div>
  `;

  elements.libraryEditor.className = "library-editor";
  elements.libraryEditor.innerHTML = `
    <section class="library-editor-section">
      <header class="library-section-head"><span>01</span><div><p class="eyebrow">Reusable definition</p><h3>Project and use case profile</h3><p>Clean up the project description and classify the reusable pattern.</p></div></header>
      <div class="library-form-grid two">
        <label>Library entry title<input type="text" value="${escapeHtml(draft.classification.libraryTitle)}" data-library-field="classification.libraryTitle"></label>
        <label>Project title<input type="text" value="${escapeHtml(draft.project.title)}" data-library-field="project.title"></label>
        <label>Business function<input type="text" value="${escapeHtml(draft.project.businessFunction)}" data-library-field="project.businessFunction"></label>
        <label>Use case pattern<input type="text" value="${escapeHtml(draft.classification.useCasePattern)}" data-library-field="classification.useCasePattern"></label>
        <label>Industry applicability<input type="text" value="${escapeHtml(draft.classification.industryApplicability)}" data-library-field="classification.industryApplicability"></label>
      </div>
      <label>Business problem<textarea rows="3" data-library-field="project.problem">${escapeHtml(draft.project.problem)}</textarea></label>
      <label>Implemented or proposed solution<textarea rows="3" data-library-field="project.proposedSolution">${escapeHtml(draft.project.proposedSolution)}</textarea></label>
      <label>Intended outcome<textarea rows="2" data-library-field="project.intendedOutcome">${escapeHtml(draft.project.intendedOutcome)}</textarea></label>
      <div class="library-form-grid two">
        <label>Users and scale<textarea rows="3" data-library-field="project.users">${escapeHtml(draft.project.users)}</textarea></label>
        <label>Process context<textarea rows="3" data-library-field="project.process">${escapeHtml(draft.project.process)}</textarea></label>
        <label>Operational scale<textarea rows="3" data-library-field="project.scale">${escapeHtml(draft.project.scale)}</textarea></label>
        <label>Human oversight<textarea rows="3" data-library-field="project.humanOversight">${escapeHtml(draft.project.humanOversight)}</textarea></label>
        <label>Data sources <small>Name | status | description</small><textarea rows="4" data-library-field="project.dataSources">${escapeHtml(draft.project.dataSources)}</textarea></label>
        <label>Capabilities <small>One per line</small><textarea rows="4" data-library-field="project.capabilities">${escapeHtml(draft.project.capabilities)}</textarea></label>
        <label>Systems <small>One per line</small><textarea rows="4" data-library-field="project.systems">${escapeHtml(draft.project.systems)}</textarea></label>
      </div>
      <label>Reusable tags <small>One per line</small><textarea rows="3" data-library-field="classification.reusableTags">${escapeHtml(draft.classification.reusableTags)}</textarea></label>
    </section>

    <section class="library-editor-section">
      <header class="library-section-head"><span>02</span><div><p class="eyebrow">Delivery evidence</p><h3>Outcomes, economics and learning</h3><p>Add the information that turns a project description into a useful organizational reference.</p></div></header>
      <div class="library-form-grid three">
        <label>Lifecycle status<select data-library-field="outcomes.lifecycleStatus">
          ${["Readiness assessed", "Discovery", "MVP in progress", "MVP completed", "Operational", "Stopped"].map((value) => `<option ${draft.outcomes.lifecycleStatus === value ? "selected" : ""}>${value}</option>`).join("")}
        </select></label>
        <label>Implementation outcome<select data-library-field="outcomes.implementationStatus">
          ${["Not started", "On track", "Partially successful", "Successful", "Did not meet objectives", "Stopped before MVP"].map((value) => `<option ${draft.outcomes.implementationStatus === value ? "selected" : ""}>${value}</option>`).join("")}
        </select></label>
        <label>ROI status<select data-library-field="outcomes.roiStatus">
          ${["Not yet measured", "Estimated", "Validated after MVP", "Validated in operation", "No positive return demonstrated"].map((value) => `<option ${draft.outcomes.roiStatus === value ? "selected" : ""}>${value}</option>`).join("")}
        </select></label>
      </div>
      <label>Roadblocks and failure points <small>One per line</small><textarea rows="4" data-library-field="outcomes.roadblocks">${escapeHtml(draft.outcomes.roadblocks)}</textarea></label>
      <div class="library-form-grid three">
        <label>Estimated cost (EUR)<input type="number" min="0" value="${escapeHtml(draft.outcomes.estimatedImplementationCostEur)}" data-library-field="outcomes.estimatedImplementationCostEur" data-value-type="number-or-blank"></label>
        <label>Actual cost (EUR)<input type="number" min="0" value="${escapeHtml(draft.outcomes.actualImplementationCostEur)}" data-library-field="outcomes.actualImplementationCostEur" data-value-type="number-or-blank"></label>
        <label>Time to value (months)<input type="number" min="0" step="0.5" value="${escapeHtml(draft.outcomes.timeToValueMonths)}" data-library-field="outcomes.timeToValueMonths" data-value-type="number-or-blank"></label>
        <label>Estimated annual benefit (EUR)<input type="number" min="0" value="${escapeHtml(draft.outcomes.estimatedAnnualBenefitEur)}" data-library-field="outcomes.estimatedAnnualBenefitEur" data-value-type="number-or-blank"></label>
        <label>Actual annual benefit (EUR)<input type="number" min="0" value="${escapeHtml(draft.outcomes.actualAnnualBenefitEur)}" data-library-field="outcomes.actualAnnualBenefitEur" data-value-type="number-or-blank"></label>
      </div>
      <label>Other benefits<textarea rows="3" placeholder="Quality, customer, risk, employee or capability benefits" data-library-field="outcomes.otherBenefits">${escapeHtml(draft.outcomes.otherBenefits)}</textarea></label>
      <label>Lessons learned<textarea rows="4" placeholder="What should future teams repeat or avoid?" data-library-field="outcomes.lessonsLearned">${escapeHtml(draft.outcomes.lessonsLearned)}</textarea></label>
      <label>Consultant comments<textarea rows="4" placeholder="Context, caveats and interpretation" data-library-field="outcomes.comments">${escapeHtml(draft.outcomes.comments)}</textarea></label>
    </section>

    <section class="library-editor-section">
      <header class="library-section-head"><span>03</span><div><p class="eyebrow">Readiness knowledge</p><h3>Requirements and observed evidence</h3><p>Retain, edit or supplement the prerequisites that future projects can learn from.</p></div><button class="secondary" type="button" data-add-library-requirement>Add requirement</button></header>
      <div class="library-requirement-list">${draft.requirements.map(renderLibraryRequirement).join("")}</div>
    </section>

    ${renderCatalogReview(project, draft)}

    <section class="library-editor-section library-export-section">
      <header class="library-section-head"><span>05</span><div><p class="eyebrow">Record control</p><h3>Review export scope</h3><p>The downloaded file contains the reusable profile, delivery outcomes, the readiness snapshot and ${includedRequirements} retained requirements.</p></div></header>
      <label class="inline-check privacy-check"><input type="checkbox" data-library-field="classification.includeNamedClient" data-value-type="boolean" ${draft.classification.includeNamedClient ? "checked" : ""}> Include the named demonstration company in the exported record</label>
      <div class="library-export-note"><strong>MVP behavior</strong><p>Export creates a local JSON file. No data is transmitted. A future library service can accept the same structured record after authentication and approval controls are implemented.</p></div>
    </section>
  `;
}

function addCustomLibraryRequirement() {
  const draft = ensureLibraryDraft(activeLibraryProjectId);
  if (!draft) return;
  customRequirementCounter += 1;
  draft.requirements.push({
    id: `CUSTOM-${String(customRequirementCounter).padStart(3, "0")}`,
    catalogRequirementId: null,
    source: "consultant_added",
    includeInLibrary: true,
    title: "New project requirement",
    category: "Project-specific",
    statement: "",
    assessmentQuestion: "",
    criticality: "important",
    requiredLevel: 3,
    requiredLabel: "Level 3",
    requiredMinimumEur: null,
    requiredPreferredEur: null,
    observedStatus: "unanswered",
    observedLevel: null,
    observedLabel: "Not answered",
    evidence: "",
    notes: "",
    scaleId: null,
    scaleOptions: [],
    sourceSnapshot: null
  });
  renderLibraryEntry();
}

function buildLibraryExportRecord(project, draft) {
  const currentResult = calculateProjectResult(project);
  return {
    schemaVersion: draft.schemaVersion,
    recordType: "ai-project-library-entry",
    exportMetadata: {
      exportedAt: new Date().toISOString(),
      generatedBy: "AI Project Readiness Assessment V2",
      integrationMode: "local-file-mvp",
      futureDestination: "central-use-case-library"
    },
    companyContext: draft.classification.includeNamedClient
      ? deepCopy(window.DEMO_PROJECT_CONTEXT)
      : {
          company: "Anonymized client",
          profile: window.DEMO_PROJECT_CONTEXT?.profile || "",
          footprint: window.DEMO_PROJECT_CONTEXT?.footprint || "",
          employees: window.DEMO_PROJECT_CONTEXT?.employees || ""
        },
    classification: {
      libraryTitle: draft.classification.libraryTitle,
      useCasePattern: draft.classification.useCasePattern,
      industryApplicability: draft.classification.industryApplicability,
      reusableTags: splitLines(draft.classification.reusableTags)
    },
    project: {
      ...draft.project,
      dataSources: splitLines(draft.project.dataSources),
      capabilities: splitLines(draft.project.capabilities),
      systems: splitLines(draft.project.systems)
    },
    outcomes: {
      ...draft.outcomes,
      roadblocks: splitLines(draft.outcomes.roadblocks)
    },
    readinessAssessment: {
      readinessScore: currentResult.score,
      evidenceCoverage: currentResult.coverage,
      status: currentResult.status,
      criticalGapCount: currentResult.blockers.length
    },
    catalogDeduplicationReview: libraryDedupReviews[project.id]?.status === "complete"
      ? {
          reviewedAt: libraryDedupReviews[project.id].reviewedAt,
          consultantApprovalRequired: true,
          reviews: libraryDedupReviews[project.id].reviews
        }
      : null,
    requirements: draft.requirements
      .filter((requirement) => requirement.includeInLibrary)
      .map((requirement) => ({
        id: requirement.id,
        catalogRequirementId: requirement.catalogRequirementId,
        source: requirement.source,
        title: requirement.title,
        category: requirement.category,
        statement: requirement.statement,
        assessmentQuestion: requirement.assessmentQuestion,
        criticality: requirement.criticality,
        requiredLevel: requirement.requiredLevel,
        requiredLabel: requirement.requiredLabel,
        requiredMinimumEur: requirement.requiredMinimumEur,
        requiredPreferredEur: requirement.requiredPreferredEur,
        observedStatus: requirement.observedStatus,
        observedLevel: requirement.observedLevel,
        observedLabel: requirement.observedLabel,
        evidence: requirement.evidence,
        notes: requirement.notes,
        scaleId: requirement.scaleId,
        sourceAssessmentSnapshot: requirement.sourceSnapshot
      }))
  };
}

function exportLibraryEntry() {
  const project = projectById(activeLibraryProjectId);
  const draft = ensureLibraryDraft(activeLibraryProjectId);
  if (!project || !draft) return;
  const record = buildLibraryExportRecord(project, draft);
  const safeName = draft.classification.libraryTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || project.id.toLowerCase();
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `usecase-library-${safeName}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  draft.lastExportedAt = record.exportMetadata.exportedAt;
  draft.recordStatus = "exported";
  renderLibraryEntry();
}

elements.navItems.forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));

elements.chooseProjectFiles.addEventListener("click", () => elements.projectFileInput.click());
elements.openDemoFolder.addEventListener("click", openDemoProjectFolder);
elements.projectFileInput.addEventListener("change", () => importProjectFiles(elements.projectFileInput.files));
["dragenter", "dragover"].forEach((eventName) => {
  elements.projectUploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.projectUploadZone.classList.add("dragging");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  elements.projectUploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.projectUploadZone.classList.remove("dragging");
  });
});
elements.projectUploadZone.addEventListener("drop", (event) => importProjectFiles(event.dataTransfer?.files));

elements.continue.addEventListener("click", () => {
  if (!projects.length) {
    elements.intakeHint.textContent = "Upload at least one project workbook or load the demonstration projects before continuing.";
    return;
  }
  switchView("cards");
});

elements.themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
elements.openModelSettings.addEventListener("click", openModelSettings);
elements.closeModelSettings.addEventListener("click", closeModelSettings);
elements.doneModelSettings.addEventListener("click", closeModelSettings);
elements.modelSettingsModal.addEventListener("click", (event) => {
  if (event.target === elements.modelSettingsModal) closeModelSettings();
});
elements.settingsRequirementModel.addEventListener("change", () => {
  requirementLlmState.requirementsModel = elements.settingsRequirementModel.value;
  localStorage.setItem("project-readiness-requirements-model", requirementLlmState.requirementsModel);
  renderRequirementLlmPanel();
});
elements.settingsRatingModel.addEventListener("change", () => {
  requirementLlmState.ratingModel = elements.settingsRatingModel.value;
  localStorage.setItem("project-readiness-rating-model", requirementLlmState.ratingModel);
  renderModelSettings();
});

elements.continueToRequirements.addEventListener("click", () => {
  if (!projects.length) return;
  switchView("requirements");
});

elements.openReview.addEventListener("click", () => {
  if (!projects.length) return;
  switchView("review");
});

elements.addConsultantRequirement.addEventListener("click", addConsultantRequirement);

elements.confirmCurrentProfile.addEventListener("click", () => {
  if (!activeReviewProjectId) return;
  const invalidFunding = (requirementProfiles[activeReviewProjectId] || []).find((mapping) => {
    if (!mapping.included || !mapping.approved || !isFundingMapping(mapping)) return false;
    const minimum = Number(mapping.requiredMinimumEur);
    const preferred = Number(mapping.requiredPreferredEur);
    return !Number.isFinite(minimum) || minimum <= 0 || !Number.isFinite(preferred) || preferred < minimum;
  });
  if (invalidFunding) {
    elements.reviewStatus.insertAdjacentHTML("beforeend", `<p class="inline-warning">Enter a valid required funding range before confirming this profile.</p>`);
    return;
  }
  const incompleteCustomRequirement = (requirementProfiles[activeReviewProjectId] || []).find((mapping) =>
    mapping.source === "consultant" && (!mapping.requirement.title.trim() || !mapping.requirement.statement.trim() || !mapping.requirement.question_template.trim())
  );
  if (incompleteCustomRequirement) {
    elements.reviewStatus.insertAdjacentHTML("beforeend", `<p class="inline-warning">Complete the title, requirement condition and assessment question for every consultant-added requirement before confirming this profile.</p>`);
    return;
  }
  const project = projectById(activeReviewProjectId);
  const unresolvedQuestions = (requirementProfiles[activeReviewProjectId] || [])
    .filter((mapping) => mapping.included && mapping.approved)
    .map((mapping) => ({ mapping, keys: unresolvedQuestionPlaceholders(mapping, project) }))
    .filter((item) => item.keys.length);
  if (unresolvedQuestions.length) {
    const examples = unresolvedQuestions.slice(0, 3)
      .map((item) => `${item.mapping.requirement.title}: ${item.keys.map(placeholderLabel).join(", ")}`)
      .join("; ");
    elements.reviewStatus.insertAdjacentHTML("beforeend", `<p class="inline-warning">Complete the missing project context before confirming this profile. ${escapeHtml(examples)}${unresolvedQuestions.length > 3 ? `; and ${unresolvedQuestions.length - 3} more` : ""}.</p>`);
    return;
  }
  confirmedProjects.add(activeReviewProjectId);
  renderReview();
  updateSidebar();
});

elements.continueToAssessment.addEventListener("click", () => {
  if (confirmedProjects.size !== projects.length) {
    elements.reviewStatus.insertAdjacentHTML("beforeend", `<p class="inline-warning">Confirm all ${projects.length} project profiles before continuing.</p>`);
    return;
  }
  switchView("assessment");
});

elements.loadDemoAnswers.addEventListener("click", loadDemoResponses);
elements.calculateResults.addEventListener("click", () => switchView("results"));
elements.backToAssessment.addEventListener("click", () => switchView("assessment"));
elements.openLibraryEntry.addEventListener("click", () => {
  if (!projects.length) return;
  activeLibraryProjectId ||= projects[0].id;
  switchView("library");
});
elements.resetLibraryDraft.addEventListener("click", () => {
  if (!activeLibraryProjectId) return;
  ensureLibraryDraft(activeLibraryProjectId, true);
  delete libraryDedupReviews[activeLibraryProjectId];
  renderLibraryEntry();
});
elements.exportLibraryEntry.addEventListener("click", exportLibraryEntry);

elements.refreshRequirementModels.addEventListener("click", connectRequirementLlm);
elements.generateRequirements.addEventListener("click", generateRequirementsForSelectedProject);
elements.cancelRequirementGeneration.addEventListener("click", cancelRequirementGeneration);
elements.restoreReferenceProfile.addEventListener("click", restoreCuratedRequirementProfile);

elements.catalogSearch.addEventListener("input", renderCatalogRequirements);
elements.catalogCategory.addEventListener("change", renderCatalogRequirements);
elements.catalogType.addEventListener("change", renderCatalogRequirements);
elements.clearCatalogFilters.addEventListener("click", () => {
  elements.catalogSearch.value = "";
  elements.catalogCategory.value = "";
  elements.catalogType.value = "";
  renderCatalogRequirements();
});

elements.demo.addEventListener("click", () => {
  if (projects.length) return;
  projects.push(...window.DEMO_PROJECTS.map(deepCopy));
  initializeRequirementProfiles();
  activeLibraryProjectId = projects[0]?.id || null;
  elements.intakeHint.textContent = "Three demonstration projects loaded from the built-in reference dataset.";
  elements.demo.disabled = true;
  elements.demo.textContent = "Demonstration loaded";
  updateProjectList();
});

elements.list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-project]");
  if (!button) return;
  const removed = projects.splice(Number(button.dataset.removeProject), 1)[0];
  if (removed) {
    delete requirementProfiles[removed.id];
    delete requirementSelectionMeta[removed.id];
    delete libraryDrafts[removed.id];
    delete libraryDedupReviews[removed.id];
    confirmedProjects.delete(removed.id);
    activeReviewProjectId = projects[0]?.id || null;
    activeAssessmentProjectId = projects[0]?.id || null;
    activeLibraryProjectId = projects[0]?.id || null;
  }
  updateProjectList();
});

elements.selectionSummary.addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-project]");
  if (!button) return;
  activeReviewProjectId = button.dataset.reviewProject;
  switchView("review");
});

elements.reviewTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-tab]");
  if (!button) return;
  activeReviewProjectId = button.dataset.reviewTab;
  renderReview();
});

elements.reviewList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-consultant-requirement]");
  if (!button) return;
  const mappings = requirementProfiles[activeReviewProjectId] || [];
  requirementProfiles[activeReviewProjectId] = mappings.filter((mapping) => mapping.id !== button.dataset.removeConsultantRequirement);
  confirmedProjects.delete(activeReviewProjectId);
  renderReview();
  renderSelectionSummary();
  updateSidebar();
});

elements.reviewList.addEventListener("change", (event) => {
  const control = event.target.closest("[data-review-action]");
  if (!control) return;
  const mapping = (requirementProfiles[activeReviewProjectId] || []).find((item) => item.id === control.dataset.mappingId);
  if (!mapping) return;

  const action = control.dataset.reviewAction;
  if (action === "include") mapping.included = control.checked;
  if (action === "approve-provisional") {
    mapping.approved = control.checked;
    mapping.included = control.checked;
  }
  if (action === "importance") mapping.importance = control.value;
  if (action === "target-level") mapping.requiredLevel = Number(control.value);
  if (action === "target-minimum") mapping.requiredMinimumEur = control.value === "" ? null : Number(control.value);
  if (action === "target-preferred") mapping.requiredPreferredEur = control.value === "" ? null : Number(control.value);
  if (action === "submit-library") mapping.submittedToLibrary = control.checked;
  if (action === "custom-title") mapping.requirement.title = control.value;
  if (action === "custom-category") mapping.requirement.category = control.value || "Project-specific";
  if (action === "custom-statement") mapping.requirement.statement = control.value;
  if (action === "custom-question") mapping.requirement.question_template = control.value;
  if (action === "context-placeholder") {
    const project = projectById(activeReviewProjectId);
    project.assessmentContext ||= {};
    project.assessmentContext[control.dataset.placeholderKey] = control.value.trim();
  }
  if (action === "custom-scale") {
    mapping.requirement.scale_id = scalesById.has(control.value) ? control.value : "process_5";
    mapping.requiredLevel = 3;
  }

  confirmedProjects.delete(activeReviewProjectId);
  renderReview();
  renderSelectionSummary();
  updateSidebar();
});

elements.assessmentTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-assessment-tab]");
  if (!button) return;
  activeAssessmentProjectId = button.dataset.assessmentTab;
  renderAssessment();
});

elements.assessmentList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ask-assessment-ai]");
  if (!button) return;
  openAssessmentAssistant(button.dataset.projectId, button.dataset.mappingId);
});

elements.assistantClose.addEventListener("click", closeAssessmentAssistant);
elements.assistantModal.addEventListener("click", (event) => {
  if (event.target === elements.assistantModal) closeAssessmentAssistant();
});
elements.assistantRequest.addEventListener("click", requestAssessmentSuggestion);
elements.assistantRefine.addEventListener("click", refineAssessmentSuggestion);
elements.assistantApply.addEventListener("click", applyAssessmentSuggestion);

elements.assessmentList.addEventListener("change", (event) => {
  const control = event.target.closest("[data-answer-action]");
  if (!control) return;
  const key = control.dataset.answerKey;
  answers[key] ||= { status: "unanswered", level: null, evidence: "" };

  if (control.dataset.answerAction === "level") {
    if (control.value === "") {
      answers[key].status = "unanswered";
      answers[key].level = null;
    } else if (control.value === "unknown") {
      answers[key].status = "unknown";
      answers[key].level = null;
    } else {
      answers[key].status = "answered";
      answers[key].level = Number(control.value);
    }
  }
  if (["funding-minimum", "funding-maximum"].includes(control.dataset.answerAction)) {
    updateFundingRangeAnswer(control);
    refreshFundingDisplay(control);
    return;
  }
  if (control.dataset.answerAction === "funding-unknown") {
    if (control.checked) {
      answers[key].status = "unknown";
      answers[key].level = null;
      answers[key].rangeInvalid = false;
    } else {
      const projectId = control.dataset.projectId;
      const mapping = (requirementProfiles[projectId] || []).find((item) => item.id === control.dataset.mappingId);
      const state = calculateFundingState(mapping, answers[key].availableMinimumEur, answers[key].availableMaximumEur);
      answers[key].status = state.status;
      answers[key].level = state.level;
      answers[key].rangeInvalid = state.invalid;
    }
  }
  if (control.dataset.answerAction === "evidence") answers[key].evidence = control.value;

  renderAssessment();
  updateSidebar();
});

elements.assessmentList.addEventListener("input", (event) => {
  const control = event.target.closest("[data-answer-action]");
  if (!control || !["funding-minimum", "funding-maximum"].includes(control.dataset.answerAction)) return;
  updateFundingRangeAnswer(control);
  refreshFundingDisplay(control);
});

elements.results.addEventListener("click", (event) => {
  const button = event.target.closest("[data-library-project]");
  if (!button) return;
  activeLibraryProjectId = button.dataset.libraryProject;
  switchView("library");
});

elements.libraryTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-library-tab]");
  if (!button) return;
  activeLibraryProjectId = button.dataset.libraryTab;
  renderLibraryEntry();
});

function updateLibraryDraftFromControl(control) {
  const draft = ensureLibraryDraft(activeLibraryProjectId);
  if (!draft) return;

  if (control.dataset.libraryField) {
    let value = control.dataset.valueType === "boolean" ? control.checked : control.value;
    if (control.dataset.valueType === "number-or-blank") value = control.value === "" ? "" : Number(control.value);
    setNestedValue(draft, control.dataset.libraryField, value);
    return;
  }

  if (control.dataset.libraryRequirementField === undefined) return;
  const requirement = draft.requirements[Number(control.dataset.libraryRequirementIndex)];
  if (!requirement) return;
  if (requirement.source !== "catalog") delete libraryDedupReviews[activeLibraryProjectId];
  const field = control.dataset.libraryRequirementField;
  if (control.dataset.valueType === "boolean") {
    requirement[field] = control.checked;
  } else if (control.dataset.valueType === "number") {
    requirement[field] = Number(control.value);
    if (field === "requiredLevel") requirement.requiredLabel = requirement.scaleOptions.find((option) => option.level === Number(control.value))?.label || `Level ${control.value}`;
    if (["requiredMinimumEur", "requiredPreferredEur"].includes(field)) requirement.requiredLabel = formatFundingRange(requirement.requiredMinimumEur, requirement.requiredPreferredEur);
  } else if (control.dataset.valueType === "observed") {
    if (control.value === "") {
      requirement.observedStatus = "unanswered";
      requirement.observedLevel = null;
      requirement.observedLabel = "Not answered";
    } else if (control.value === "unknown") {
      requirement.observedStatus = "unknown";
      requirement.observedLevel = null;
      requirement.observedLabel = "Cannot determine";
    } else {
      requirement.observedStatus = "answered";
      requirement.observedLevel = Number(control.value);
      requirement.observedLabel = requirement.scaleOptions.find((option) => option.level === Number(control.value))?.label || `Level ${control.value}`;
    }
  } else {
    requirement[field] = control.value;
  }
}

elements.libraryEditor.addEventListener("input", (event) => {
  const control = event.target.closest("[data-library-field], [data-library-requirement-field]");
  if (control) updateLibraryDraftFromControl(control);
});

elements.libraryEditor.addEventListener("change", (event) => {
  const control = event.target.closest("[data-library-field], [data-library-requirement-field]");
  if (control) updateLibraryDraftFromControl(control);
});

elements.libraryEditor.addEventListener("click", (event) => {
  if (event.target.closest("[data-download-catalog-review]")) {
    downloadCatalogReviewBrief();
    return;
  }
  if (event.target.closest("[data-run-catalog-review]")) {
    runCatalogReview();
    return;
  }
  if (event.target.closest("[data-add-library-requirement]")) {
    addCustomLibraryRequirement();
    delete libraryDedupReviews[activeLibraryProjectId];
    return;
  }
  const removeButton = event.target.closest("[data-remove-library-requirement]");
  if (!removeButton) return;
  const draft = ensureLibraryDraft(activeLibraryProjectId);
  if (!draft) return;
  draft.requirements.splice(Number(removeButton.dataset.removeLibraryRequirement), 1);
  delete libraryDedupReviews[activeLibraryProjectId];
  renderLibraryEntry();
});

applyTheme(localStorage.getItem("project-readiness-theme") || "light");
updateProjectList();
connectRequirementLlm();
