(() => {
  "use strict";

  const data = window.IMON_DIAGNOSTIC;
  if (!data) return;

  const STORAGE_KEY = `imon-scale-diagnostic:${data.version}:ui-v2`;
  let overlay = null;
  let searchInput = null;
  let isOpen = false;

  function makeInitialState() {
    return {
      version: data.version,
      submissionId: crypto.randomUUID ? crypto.randomUUID() : `imon-${Date.now()}`,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      screen: "intro",
      currentQuestionId: null,
      answers: {},
      result: null
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.version === data.version) return { ...makeInitialState(), ...saved };
    } catch (error) {
      console.warn("Не удалось прочитать состояние диагностики", error);
    }
    return makeInitialState();
  }

  function saveState(state) {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function hasAnswer(question, answers) {
    const answer = answers[question.id];
    if (question.type === "multi") return Array.isArray(answer) && answer.length > 0;
    if (question.type === "scale") return Number.isFinite(Number(answer));
    if (question.type === "number") return answer !== undefined && answer !== null && answer !== "";
    return typeof answer === "string" ? answer.trim().length > 0 : answer !== undefined && answer !== null;
  }

  function evaluateCondition(condition, answers) {
    if (!condition) return true;
    const answer = answers[condition.questionId];
    if (condition.exists) return answer !== undefined && answer !== null && answer !== "";
    if (condition.equals !== undefined) return answer === condition.equals;
    if (condition.includes !== undefined) return Array.isArray(answer) && answer.includes(condition.includes);
    if (condition.min !== undefined) return Number(answer) >= condition.min;
    return true;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function questionNumber(questionId) {
    return data.questions.findIndex((question) => question.id === questionId) + 1;
  }

  function ensureTopbarTrigger() {
    const topbar = document.querySelector(".topbar");
    const reset = document.getElementById("resetButton");
    if (!topbar || !reset) return;

    let actions = topbar.querySelector(".qb-topbar-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "qb-topbar-actions";
      topbar.appendChild(actions);
      actions.appendChild(reset);
    }

    if (!document.getElementById("questionBrowserButton")) {
      const button = document.createElement("button");
      button.id = "questionBrowserButton";
      button.className = "qb-trigger";
      button.type = "button";
      button.innerHTML = `<span>Все вопросы</span><b>${data.questions.length}</b>`;
      button.addEventListener("click", openBrowser);
      actions.insertBefore(button, reset);
    }

    updateTriggerState();
  }

  function ensureIntroTrigger() {
    const introActions = document.querySelector(".intro-actions");
    if (!introActions || introActions.querySelector(".qb-intro-trigger")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button qb-intro-trigger";
    button.textContent = "Посмотреть все вопросы";
    button.addEventListener("click", openBrowser);
    introActions.appendChild(button);
  }

  function updateTriggerState() {
    const button = document.getElementById("questionBrowserButton");
    if (!button) return;
    const state = loadState();
    const answered = data.questions.filter((question) => hasAnswer(question, state.answers || {})).length;
    const badge = button.querySelector("b");
    const next = answered ? `${answered}/${data.questions.length}` : String(data.questions.length);
    if (badge && badge.textContent !== next) badge.textContent = next;
  }

  function createOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "qb-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="qb-backdrop" data-qb-close></div>
      <section class="qb-panel" role="dialog" aria-modal="true" aria-labelledby="qbTitle">
        <header class="qb-head">
          <div>
            <span class="qb-kicker">Навигатор диагностики</span>
            <h2 id="qbTitle">Все вопросы</h2>
            <p id="qbSummary"></p>
          </div>
          <button class="qb-close" type="button" data-qb-close aria-label="Закрыть">×</button>
        </header>
        <div class="qb-search-wrap">
          <input id="qbSearch" class="qb-search" type="search" placeholder="Найти вопрос…" autocomplete="off">
        </div>
        <div class="qb-list" id="qbList"></div>
      </section>
    `;

    document.body.appendChild(overlay);
    searchInput = overlay.querySelector("#qbSearch");
    overlay.querySelectorAll("[data-qb-close]").forEach((node) => node.addEventListener("click", closeBrowser));
    searchInput.addEventListener("input", renderBrowser);
    overlay.addEventListener("click", (event) => {
      const target = event.target.closest("[data-qb-question]");
      if (!target || target.disabled) return;
      jumpToQuestion(target.dataset.qbQuestion);
    });

    return overlay;
  }

  function openBrowser() {
    createOverlay();
    isOpen = true;
    overlay.hidden = false;
    document.documentElement.classList.add("qb-open");
    renderBrowser();
    requestAnimationFrame(() => searchInput?.focus({ preventScroll: true }));
  }

  function closeBrowser() {
    if (!overlay) return;
    isOpen = false;
    overlay.hidden = true;
    document.documentElement.classList.remove("qb-open");
  }

  function renderBrowser() {
    if (!overlay) return;
    const state = loadState();
    const answers = state.answers || {};
    const query = (searchInput?.value || "").trim().toLowerCase();
    const answeredCount = data.questions.filter((question) => hasAnswer(question, answers)).length;
    overlay.querySelector("#qbSummary").textContent = `${answeredCount} из ${data.questions.length} заполнено · можно начать с любого вопроса`;

    const html = data.sections.map((section, sIndex) => {
      const questions = data.questions.filter((question) => question.section === section.id);
      const filtered = questions.filter((question) => {
        if (!query) return true;
        return `${question.title} ${question.help || ""} ${section.title}`.toLowerCase().includes(query);
      });
      if (!filtered.length) return "";

      const sectionAnswered = questions.filter((question) => hasAnswer(question, answers)).length;
      return `
        <section class="qb-section">
          <div class="qb-section-head">
            <div><span>${String(sIndex + 1).padStart(2, "0")}</span><h3>${escapeHtml(section.title)}</h3></div>
            <b>${sectionAnswered}/${questions.length}</b>
          </div>
          <div class="qb-questions">
            ${filtered.map((question) => {
              const answered = hasAnswer(question, answers);
              const current = state.currentQuestionId === question.id && state.screen === "test";
              const available = evaluateCondition(question.showIf, answers);
              const number = questionNumber(question.id);
              return `
                <button class="qb-question ${answered ? "answered" : ""} ${current ? "current" : ""}" type="button" data-qb-question="${escapeHtml(question.id)}" ${available ? "" : "disabled"}>
                  <span class="qb-number">${String(number).padStart(2, "0")}</span>
                  <span class="qb-question-copy">
                    <strong>${escapeHtml(question.title)}</strong>
                    <small>${available ? (answered ? "Отвечено" : question.required ? "Обязательный" : "Необязательный") : "Станет доступен по ходу теста"}</small>
                  </span>
                  <span class="qb-status">${answered ? "✓" : current ? "•" : "→"}</span>
                </button>
              `;
            }).join("")}
          </div>
        </section>
      `;
    }).join("");

    overlay.querySelector("#qbList").innerHTML = html || `<div class="qb-empty">Ничего не найдено.</div>`;
  }

  function jumpToQuestion(questionId) {
    const state = loadState();
    const question = data.questions.find((item) => item.id === questionId);
    if (!question || !evaluateCondition(question.showIf, state.answers || {})) return;

    state.screen = "test";
    state.currentQuestionId = questionId;
    state.result = null;
    saveState(state);
    window.location.reload();
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen) closeBrowser();
  }, true);

  const appRoot = document.getElementById("app");
  if (appRoot) {
    const observer = new MutationObserver(() => {
      ensureIntroTrigger();
      updateTriggerState();
    });
    observer.observe(appRoot, { childList: true });
  }

  ensureTopbarTrigger();
  ensureIntroTrigger();
})();
