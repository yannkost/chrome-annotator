// Main-frame content script. Detects text selection -> floating "Annotate"
// button -> note panel (in AnnotatorPanel). On load it re-applies previously
// saved highlights for this URL (best-effort, with a few retries).
(() => {
  if (window.top !== window) return; // main frame only
  if (!window.chrome || !chrome.storage) return;

  AnnotatorPanel.init();

  let pendingRange = null;
  let lastShownRect = null;

  function canonicalUrl() {
    try {
      return location.href.split("#")[0];
    } catch {
      return location.href;
    }
  }

  function isInsideUi(target) {
    return !!(target && target.closest && target.closest("[data-hly-shadow-host]"));
  }

  function rectOfRange(range) {
    if (range.collapsed) return null;
    try {
      const r = range.getBoundingClientRect();
      if (r && (r.width > 0 || r.height > 0)) {
        return { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
      }
    } catch {
      /* ignore */
    }
    try {
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const cr = rects[i];
        if (cr.width > 0 || cr.height > 0) {
          return { left: cr.left, top: cr.top, width: cr.width, height: cr.height, bottom: cr.bottom, right: cr.right };
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  document.addEventListener("mouseup", (e) => {
    if (isInsideUi(e.target)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      AnnotatorPanel.hideAnnotateButton();
      pendingRange = null;
      return;
    }
    const range = sel.getRangeAt(0).cloneRange();
    if (!range.toString().trim()) {
      AnnotatorPanel.hideAnnotateButton();
      pendingRange = null;
      return;
    }
    const rect = rectOfRange(range);
    if (!rect) {
      AnnotatorPanel.hideAnnotateButton();
      pendingRange = null;
      return;
    }
    pendingRange = range;
    lastShownRect = rect;
    AnnotatorPanel.showAnnotateButton(rect);
  });

  // Hide the button (and close the panel) when interacting outside our UI.
  document.addEventListener(
    "mousedown",
    (e) => {
      AnnotatorPanel.onDocumentPointerDown(e.target);
      if (!isInsideUi(e.target)) {
        AnnotatorPanel.hideAnnotateButton();
      }
    },
    true
  );

  let scrollTimer = null;
  function onScrollOrResize() {
    if (AnnotatorPanel.isOpen()) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!AnnotatorPanel.isOpen()) {
        AnnotatorPanel.hideAnnotateButton();
        pendingRange = null;
      }
    }, 120);
  }
  document.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);

  AnnotatorPanel.setAnnotateCallback(() => {
    if (!pendingRange) return;
    AnnotatorPanel.openForRange(pendingRange, lastShownRect);
    pendingRange = null;
  });

  // Clicking an existing highlight reopens its note.
  document.addEventListener("click", (e) => {
    if (isInsideUi(e.target)) return;
    const el = e.target.closest(".hly-marker");
    if (!el || !el.dataset.hlyId) return;
    e.preventDefault();
    e.stopPropagation();
    AnnotatorPanel.openForId(el.dataset.hlyId, el.getBoundingClientRect());
  });

  // ---- Re-apply saved highlights for this URL (best-effort + retries) ----
  async function reapplyOnce() {
    let anns = [];
    try {
      anns = await AnnotatorStore.all();
    } catch {
      return [];
    }
    const mine = anns.filter((a) => a.url === canonicalUrl());
    const misses = [];
    for (const a of mine) {
      if (document.querySelector('.hly-marker[data-hly-id="' + a.id + '"]')) continue;
      let r = AnnotatorRanges.resolveRange(a.range);
      if (!r) r = AnnotatorRanges.findByText(a.range.content);
      if (!r) {
        misses.push(a);
        continue;
      }
      if (!AnnotatorRanges.applyHighlight(r, a.color, a.id)) misses.push(a);
    }
    return misses;
  }

  (function reapplyLoop() {
    let tries = 0;
    const run = async () => {
      tries++;
      const misses = await reapplyOnce();
      if (misses.length && tries < 3) {
        setTimeout(run, 1200 * tries); // 1.2s, 2.4s after initial attempt
      }
    };
    run();
  })();
})();