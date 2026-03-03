/* --- App State --- */
const REPORTS_BASE = "reports";
let reportIndex = [];
let currentIndex = 0;

/* --- PIN Gate --- */
const PIN_HASH = "5d1bc01295d811587878e2862b8d9b26be9df1914782493a51ce6a6276c7f42f";
const SESSION_KEY = "tie_auth";

async function sha256(message) {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function checkPin(pin) {
  return (await sha256(pin)) === PIN_HASH;
}

function showApp() {
  document.getElementById("gate").style.display = "none";
  document.getElementById("app").classList.remove("app-hidden");
  loadIndex();
}

if (sessionStorage.getItem(SESSION_KEY) === "1") {
  showApp();
} else {
  const input = document.getElementById("pin-input");
  const submit = document.getElementById("pin-submit");
  const error = document.getElementById("pin-error");

  async function tryPin() {
    const pin = input.value.trim();
    if (!pin) return;
    if (await checkPin(pin)) {
      sessionStorage.setItem(SESSION_KEY, "1");
      showApp();
    } else {
      error.textContent = "Incorrect code";
      input.value = "";
      input.focus();
    }
  }

  submit.addEventListener("click", tryPin);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryPin();
  });
}

/* --- App --- */
async function loadIndex() {
  try {
    const resp = await fetch(`${REPORTS_BASE}/index.json`);
    if (!resp.ok) throw new Error("No index");
    const data = await resp.json();
    reportIndex = data.reports || [];
  } catch {
    reportIndex = [];
  }

  if (reportIndex.length > 0) {
    currentIndex = 0;
    loadReport(reportIndex[0]);
  } else {
    document.getElementById("current-date").textContent = "No reports";
    updateNavButtons();
  }
}

async function loadReport(date) {
  document.getElementById("current-date").textContent = date;
  updateNavButtons();

  const grid = document.getElementById("ideas-grid");
  const stats = document.getElementById("stats");

  try {
    const resp = await fetch(`${REPORTS_BASE}/${date}.json`);
    if (!resp.ok) throw new Error("Report not found");
    const report = await resp.json();

    const ideas = report.ideas || [];

    stats.innerHTML = `
      <div class="stat">Ideas: <strong>${ideas.length}</strong></div>
      <div class="stat">Date: <strong>${report.date}</strong></div>
      ${report.trend_data ? `
        <div class="stat">HN stories: <strong>${report.trend_data.hackernews_stories || 0}</strong></div>
        <div class="stat">Reddit posts: <strong>${report.trend_data.reddit_posts || 0}</strong></div>
      ` : ""}
    `;

    if (ideas.length === 0) {
      grid.innerHTML = `<div class="empty-state"><p>No ideas in this report.</p></div>`;
      return;
    }

    grid.innerHTML = ideas.map(renderCard).join("");
  } catch {
    stats.innerHTML = "";
    grid.innerHTML = `<div class="empty-state"><p>Could not load report for ${date}.</p></div>`;
  }
}

function renderCard(idea) {
  const complexityClass = `badge-complexity-${(idea.complexity || "medium").toLowerCase()}`;

  const validationHtml = idea.validation && idea.validation.length > 0
    ? `<div class="field">
        <span class="field-label">Validation Steps</span>
        <ol class="validation-list">${idea.validation.map(v => `<li>${escapeHtml(v)}</li>`).join("")}</ol>
      </div>` : "";

  const evidenceHtml = idea.evidence && idea.evidence.length > 0
    ? `<div class="field">
        <span class="field-label">Evidence</span>
        <ul class="evidence-list">${idea.evidence.map(e =>
          `<li><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.title)}</a></li>`
        ).join("")}</ul>
      </div>` : "";

  return `
    <div class="idea-card">
      <h3>${escapeHtml(idea.title)}</h3>
      <div class="field">
        <span class="field-label">Problem</span>
        ${escapeHtml(idea.problem)}
      </div>
      <div class="field">
        <span class="field-label">Solution</span>
        ${escapeHtml(idea.solution)}
      </div>
      <div class="field">
        <span class="field-label">Monetization</span>
        ${escapeHtml(idea.monetization)}
      </div>
      ${validationHtml}
      ${evidenceHtml}
      <div class="badges">
        <span class="badge ${complexityClass}">${escapeHtml(idea.complexity || "medium")}</span>
        <span class="badge badge-category">${escapeHtml(idea.category || "Other")}</span>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function updateNavButtons() {
  document.getElementById("prev-day").disabled = currentIndex >= reportIndex.length - 1;
  document.getElementById("next-day").disabled = currentIndex <= 0;
}

document.getElementById("prev-day").addEventListener("click", () => {
  if (currentIndex < reportIndex.length - 1) {
    currentIndex++;
    loadReport(reportIndex[currentIndex]);
  }
});

document.getElementById("next-day").addEventListener("click", () => {
  if (currentIndex > 0) {
    currentIndex--;
    loadReport(reportIndex[currentIndex]);
  }
});

document.getElementById("help-toggle").addEventListener("click", () => {
  document.getElementById("help-overlay").classList.remove("help-overlay-hidden");
});

document.getElementById("help-close").addEventListener("click", () => {
  document.getElementById("help-overlay").classList.add("help-overlay-hidden");
});

document.getElementById("help-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById("help-overlay").classList.add("help-overlay-hidden");
  }
});
