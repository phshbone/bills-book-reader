(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    activePanel: null,
    theme: localStorage.getItem("bbr.theme") || "eink"
  };

  const toast = (message) => {
    const el = $("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 2200);
  };

  function closePanels() {
    $$(".side-panel").forEach(panel => { panel.hidden = true; });
    state.activePanel = null;
  }

  function openPanel(id) {
    const panel = $(id);
    if (!panel) return;
    closePanels();
    panel.hidden = false;
    state.activePanel = id;
    requestAnimationFrame(() => panel.querySelector("button, input, select")?.focus());
  }

  function setTheme(theme) {
    const allowed = new Set(["eink", "paper", "sepia", "night"]);
    state.theme = allowed.has(theme) ? theme : "eink";
    document.body.dataset.appTheme = state.theme;
    localStorage.setItem("bbr.theme", state.theme);
    $$(".theme-chip").forEach(button => {
      const active = button.dataset.theme === state.theme;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
  }

  $("tocButton").addEventListener("click", () => openPanel("tocPanel"));
  $("searchButton").addEventListener("click", () => openPanel("searchPanel"));
  $("appearanceButton").addEventListener("click", () => openPanel("appearancePanel"));
  $("marksButton").addEventListener("click", () => openPanel("bookmarkPanel"));
  $$("[data-close-panel]").forEach(button => {
    button.addEventListener("click", () => {
      const target = $(button.dataset.closePanel);
      if (target) target.hidden = true;
      state.activePanel = null;
    });
  });

  $$(".theme-chip").forEach(button => {
    button.setAttribute("role", "radio");
    button.addEventListener("click", () => setTheme(button.dataset.theme));
  });

  $("fontSize").addEventListener("input", (event) => {
    $("fontSizeValue").value = event.target.value + "%";
  });
  $("lineHeight").addEventListener("input", (event) => {
    $("lineHeightValue").value = Number(event.target.value).toFixed(2);
  });
  $("readerMargin").addEventListener("input", (event) => {
    $("readerMarginValue").value = event.target.value;
  });

  $("backToLibrary").addEventListener("click", () => {
    closePanels();
    $("readerView").hidden = true;
    $("libraryView").hidden = false;
    $("libraryHeader").hidden = false;
  });

  $("bookSearchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    $("searchStatus").textContent = "Search becomes active when the EPUB engine is connected.";
  });

  $("bookmarkButton").addEventListener("click", () => toast("Bookmarks connect in the reader-engine checkpoint."));
  $("prevPage").addEventListener("click", () => {});
  $("nextPage").addEventListener("click", () => {});
  $("progressSlider").addEventListener("input", () => {});

  $("epubInput").addEventListener("change", () => {
    const count = $("epubInput").files?.length || 0;
    if (count) toast("EPUB selected. Import engine is the next checkpoint.");
    $("epubInput").value = "";
  });

  setTheme(state.theme);

  window.__BOOK_READER__ = Object.freeze({
    version: "0.1.0-shell",
    ready: true,
    checkpoint: 1,
    openPanel,
    closePanels,
    setTheme
  });

  document.documentElement.dataset.appReady = "true";
  document.dispatchEvent(new CustomEvent("book-reader:ready", { detail: { checkpoint: 1 } }));
})();