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
        ${report.trend_data.github_repos ? `<div class="stat">GitHub repos: <strong>${report.trend_data.github_repos}</strong></div>` : ""}
        ${report.trend_data.google_trends ? `<div class="stat">Google trends: <strong>${report.trend_data.google_trends}</strong></div>` : ""}
        ${report.trend_data.producthunt_products ? `<div class="stat">PH launches: <strong>${report.trend_data.producthunt_products}</strong></div>` : ""}
      ` : ""}
    `;

    if (ideas.length === 0) {
      grid.innerHTML = `<div class="empty-state"><p>No ideas in this report.</p></div>`;
      return;
    }

    ideas.forEach(idea => { idea._score = computeScore(idea); });
    ideas.sort((a, b) => b._score - a._score);

    grid.innerHTML = ideas.map((idea, i) => renderCard(idea, i + 1)).join("");
  } catch {
    stats.innerHTML = "";
    grid.innerHTML = `<div class="empty-state"><p>Could not load report for ${date}.</p></div>`;
  }
}

/* --- Scoring & Source Helpers --- */
const SOURCE_TYPE_MAP = {
  hackernews: "HN",
  reddit: "Reddit",
  github: "GitHub",
  google_trends: "Trends",
  producthunt: "PH",
};

function getSourceTypes(trendSources) {
  const types = {};
  for (const src of trendSources || []) {
    const prefix = src.split(":")[0];
    const label = SOURCE_TYPE_MAP[prefix] || prefix;
    types[label] = (types[label] || 0) + 1;
  }
  return types;
}

function computeScore(idea) {
  const types = getSourceTypes(idea.trend_sources);
  const uniqueTypes = Object.keys(types).length;
  const totalSources = (idea.trend_sources || []).length;
  return uniqueTypes * 10 + totalSources;
}

function renderCard(idea, rank) {
  const complexityClass = `badge-complexity-${(idea.complexity || "medium").toLowerCase()}`;
  const sourceTypes = getSourceTypes(idea.trend_sources);
  const score = idea._score || computeScore(idea);
  const maxScore = 55; // 5 types × 10 + 5 sources
  const barPct = Math.min(Math.round((score / maxScore) * 100), 100);

  const sourceBadgesHtml = Object.entries(sourceTypes)
    .map(([label, count]) => {
      const cls = `badge-source-${label.toLowerCase()}`;
      return `<span class="badge ${cls}">${escapeHtml(label)}${count > 1 ? ` ×${count}` : ""}</span>`;
    }).join("");

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

  const aiBadge = idea.ai_build
    ? `<span class="badge badge-ai-${(idea.ai_build.viability || "medium").toLowerCase()}">${escapeHtml(idea.ai_build.viability || "medium")}</span>` : "";

  return `
    <div class="idea-card">
      <div class="card-header">
        <span class="idea-rank">#${rank}</span>
        <h3>${escapeHtml(idea.title)}</h3>
        <div class="confidence-score">
          <span class="score-number">${score}</span>
          <div class="score-bar"><div class="score-bar-fill" style="width:${barPct}%"></div></div>
        </div>
      </div>
      <div class="source-badges">${sourceBadgesHtml}</div>
      <div class="field">
        <span class="field-label">Problem</span>
        ${escapeHtml(idea.problem)}
      </div>
      <div class="field">
        <span class="field-label">Solution</span>
        ${escapeHtml(idea.solution)}
      </div>
      <div class="badges">
        <span class="badge ${complexityClass}">${escapeHtml(idea.complexity || "medium")}</span>
        <span class="badge badge-category">${escapeHtml(idea.category || "Other")}</span>
        ${aiBadge}
      </div>
      <details class="card-details">
        <summary>Details</summary>
        <div class="card-details-body">
          <div class="field">
            <span class="field-label">Monetization</span>
            ${escapeHtml(idea.monetization)}
          </div>
          ${validationHtml}
          ${evidenceHtml}
          ${idea.ai_build ? `<div class="ai-build">
            <span class="field-label">AI Buildability</span>
            ${idea.ai_build.time || idea.ai_build.cost ? `<span class="ai-build-meta">${idea.ai_build.time ? escapeHtml(idea.ai_build.time) : ""}${idea.ai_build.time && idea.ai_build.cost ? " · " : ""}${idea.ai_build.cost ? escapeHtml(idea.ai_build.cost) : ""}</span>` : ""}
            ${idea.ai_build.stack && idea.ai_build.stack.length > 0 ? `<span class="ai-build-stack">${idea.ai_build.stack.map(s => `<span class="badge badge-stack">${escapeHtml(s)}</span>`).join("")}</span>` : ""}
            <span class="ai-build-details">${escapeHtml(idea.ai_build.details)}</span>
          </div>` : ""}
        </div>
      </details>
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
