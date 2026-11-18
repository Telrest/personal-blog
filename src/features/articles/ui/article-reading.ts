function initCategoryFilters() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-article-filter]"),
  );
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-article-card]"),
  );
  if (buttons.length === 0 || cards.length === 0) return;

  const result = document.querySelector<HTMLElement>("[data-article-result]");
  const empty = document.querySelector<HTMLElement>(
    "[data-article-filter-empty]",
  );
  const emptyTitle = empty?.querySelector<HTMLElement>(
    "[data-filter-empty-title]",
  );
  const emptyDescription = empty?.querySelector<HTMLElement>(
    "[data-filter-empty-description]",
  );
  const clearButton = document.querySelector<HTMLButtonElement>(
    "[data-clear-filter]",
  );
  const grid = document.getElementById("articles-grid");

  const validCategories = new Set(
    buttons.map((button) => button.dataset.articleFilter ?? ""),
  );
  const requested = (
    new URLSearchParams(window.location.search).get("category") ?? ""
  ).trim();
  let active = requested && validCategories.has(requested) ? requested : "";

  const updateUrl = (category: string) => {
    try {
      const url = new URL(window.location.href);
      if (category) url.searchParams.set("category", category);
      else url.searchParams.delete("category");
      window.history.replaceState(null, "", url);
    } catch {}
  };

  const applyFilter = (
    category: string,
    options: { syncUrl?: boolean } = {},
  ) => {
    active = validCategories.has(category) ? category : "";
    let visible = 0;

    for (const button of buttons) {
      const selected = (button.dataset.articleFilter ?? "") === active;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }

    for (const card of cards) {
      const show = !active || card.dataset.category === active;
      card.hidden = !show;
      if (show) visible += 1;
    }

    if (result) {
      result.textContent = active
        ? `${active} · ${visible} 篇`
        : `共 ${visible} 篇`;
    }

    if (empty) {
      empty.hidden = visible !== 0;
      if (visible === 0) {
        if (emptyTitle)
          emptyTitle.textContent = active
            ? `「${active}」下还没有文章。`
            : "还没有文章。";
        if (emptyDescription) {
          emptyDescription.textContent = active
            ? "换一个分类看看，或者回到全部文章。"
            : "等一段想法慢慢长成文字，这里就会出现第一篇文章。";
        }
      }
    }

    grid?.classList.toggle("is-filtered", Boolean(active));
    if (options.syncUrl !== false) updateUrl(active);
  };

  for (const button of buttons) {
    button.addEventListener("click", () =>
      applyFilter(button.dataset.articleFilter ?? ""),
    );
  }

  clearButton?.addEventListener("click", () => {
    applyFilter("");
    buttons[0]?.focus();
  });

  applyFilter(active, { syncUrl: false });
}

function initReadingProgress() {
  const bar = document.querySelector<HTMLElement>("[data-reading-progress]");
  if (!bar) return;

  let frame = 0;

  const update = () => {
    frame = 0;
    const scrollable =
      document.documentElement.scrollHeight - window.innerHeight;
    const progress =
      scrollable > 0
        ? Math.min(1, Math.max(0, window.scrollY / scrollable))
        : 0;
    bar.style.transform = `scaleX(${progress.toFixed(4)})`;
  };

  const requestUpdate = () => {
    if (frame === 0) frame = window.requestAnimationFrame(update);
  };

  update();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
  window.addEventListener("load", update, { once: true });
  document.fonts?.ready.then(update).catch(() => {});
}

function initArticlePages() {
  initCategoryFilters();
  initReadingProgress();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initArticlePages, {
    once: true,
  });
} else {
  initArticlePages();
}
