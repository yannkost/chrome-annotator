// Floating "Annotate" button + note panel, all inside a Shadow DOM for CSS
// isolation from the host page. Owns annotation create/edit/delete and writes
// through AnnotatorStore. Anchoring is clamped to the viewport so the panel
// never renders off-screen.
self.AnnotatorPanel = (() => {
  const DEFAULT_COLOR = "#C9A000"; // dark yellow
  const SWATCHES = [
    "#C9A000", "#FFD700", "#FFF176", "#AED581",
    "#81D4FA", "#FFB74D", "#F48FB1", "#E1BEE7",
  ];
  const TAG = "hly-marker";

  let container = null;   // outermost shadow host <div>
  let host = null;        // shadow root
  let els = {};
  let panelOpen = false;
  let currentId = null;     // editing an existing annotation id (null = new)
  let pendingRange = null;  // live selection being annotated (new mode)
  let anchorRect = null;    // rect used to position the panel
  let color = DEFAULT_COLOR;
  let images = [];
  let annotateCallback = null;
  let shadowEl = null;      // outer div holding the shadow root

  const STYLES = `
    .hly-btn, .hly-panel {
      all: initial;
      box-sizing: border-box;
      font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2328;
    }
    .hly-btn {
      position: fixed; top: 0; left: 0; z-index: 2147483647;
      height: 30px; padding: 0 14px;
      background: #1f2328; color: #fff;
      border: none; border-radius: 6px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
      line-height: 30px;
    }
    .hly-btn:hover { background: #333; }
    .hly-panel {
      position: fixed; top: 0; left: 0; z-index: 2147483647;
      width: 620px; max-width: calc(100vw - 16px);
      background: #fff;
      border: 1px solid rgba(0,0,0,.12);
      border-radius: 10px;
      box-shadow: 0 8px 30px rgba(0,0,0,.22);
      padding: 14px;
      font-size: 13px;
    }
    .hly-head { font-weight: 700; margin-bottom: 10px; }
    .hly-colors { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
    .hly-swatch {
      width: 22px; height: 22px; border-radius: 50%;
      border: 2px solid rgba(0,0,0,.15); cursor: pointer; padding: 0;
    }
    .hly-swatch.sel { border-color: #1f2328; box-shadow: 0 0 0 2px #fff inset; }
    .hly-custom { position: relative; display: inline-block; width: 22px; height: 22px; }
    .hly-custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .hly-custom span {
      display: block; width: 100%; height: 100%; border-radius: 50%;
      border: 2px dashed rgba(0,0,0,.3); line-height: 18px; text-align: center; color: #555; font-weight: 700;
    }
    .hly-text {
      width: 100%; min-height: 140px; resize: vertical;
      border: 1px solid #d0d7de; border-radius: 6px;
      padding: 8px; font: inherit; color: #1f2328;
      box-sizing: border-box;
      flex: 1 1 auto; min-width: 0;
    }
    .hly-text:focus { outline: 2px solid #C9A000; border-color: transparent; }
    .hly-md-tabs {
      display: flex; margin-bottom: 8px; overflow: hidden;
      border: 1px solid #aab1b9; border-radius: 8px;
      background: #d6dbe0; box-shadow: inset 0 1px 2px rgba(0,0,0,.08);
    }
    .hly-md-tabs button {
      flex: 1; border: none; background: transparent; cursor: pointer;
      padding: 7px 0; font: inherit; font-size: 12px; color: #4b5257;
    }
    .hly-md-tabs button + button { border-left: 1px solid #aab1b9; }
    .hly-md-tabs button.on { background: #fff; color: #1f2328; font-weight: 600; box-shadow: inset 0 1px 3px rgba(0,0,0,.12); }
    .hly-md-edit { display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
    .hly-md-edit .hly-resize { display: none; }
    .hly-md-edit[data-mode="write"] .hly-md-preview { display: none; }
    .hly-md-edit[data-mode="preview"] .hly-text { display: none; }
    .hly-md-edit[data-mode="split"] { flex-direction: row; border: 1px solid #d0d7de; border-radius: 6px; overflow: hidden; }
    .hly-md-edit[data-mode="split"] .hly-text { border: none; border-radius: 0; width: auto; flex: 1 1 50%; min-width: 0; }
    .hly-md-edit[data-mode="split"] .hly-md-preview { border: none; border-radius: 0; width: auto; flex: 1 1 50%; min-width: 0; }
    .hly-md-edit[data-mode="split"] .hly-resize {
      display: block; flex: 0 0 1px; cursor: col-resize;
      background: #d0d7de; margin: 0;
    }
    .hly-md-edit[data-mode="split"] .hly-resize:hover { background: #C9A000; }
    .hly-md-preview {
      border: 1px solid #d0d7de; border-radius: 6px; padding: 10px;
      min-height: 140px; max-height: 320px; overflow: auto;
      background: #fafbfc; color: #1f2328;
      font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .hly-note h1,.hly-note h2,.hly-note h3,.hly-note h4,.hly-note h5,.hly-note h6 { margin: .4em 0 .2em; line-height: 1.25; }
    .hly-note h1 { font-size: 1.3em; } .hly-note h2 { font-size: 1.2em; } .hly-note h3 { font-size: 1.1em; }
    .hly-note p { margin: .3em 0; }
    .hly-note ul, .hly-note ol { margin: .3em 0; padding-left: 1.3em; }
    .hly-note li { margin: .1em 0; }
    .hly-note blockquote { margin: .4em 0; padding: 0 .7em; border-left: 3px solid #d0d7de; color: #57606a; }
    .hly-note pre { background: #f0f4f8; border-radius: 6px; padding: 8px; overflow: auto; }
    .hly-note code { background: #f0f4f8; border-radius: 4px; padding: 0 .2em; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .9em; }
    .hly-note pre code { background: transparent; padding: 0; }
    .hly-note img { width: 50px; height: 50px; object-fit: cover; float: left; margin: 2px; border-radius: 6px; }
    .hly-note hr { border: none; border-top: 1px solid #d0d7de; margin: .6em 0; }
    .hly-images { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
    .hly-thumb { position: relative; width: 56px; height: 56px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(0,0,0,.1); }
    .hly-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .hly-thumb button {
      position: absolute; top: 1px; right: 1px; width: 16px; height: 16px;
      border: none; border-radius: 50%; background: rgba(0,0,0,.6); color: #fff;
      font-size: 11px; line-height: 16px; text-align: center; cursor: pointer; padding: 0;
    }
    .hly-add { background: #f0f4f8; border: 1px dashed #b6c2cf; color: #57606a; border-radius: 6px; padding: 6px 10px; cursor: pointer; font: inherit; }
    .hly-add:hover { background: #e6ecf2; }
    .hly-actions { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
    .hly-actions .hly-spacer { flex: 1; }
    .hly-btn-primary {
      background: #4a9eff; border: none; color: #fff;
      border-radius: 6px; padding: 8px 16px; font-weight: 700; cursor: pointer; font: inherit;
    }
    .hly-btn-primary:hover { background: #3a8ae0; }
    .hly-btn-ghost { background: transparent; border: 1px solid #d0d7de; border-radius: 6px; padding: 8px 12px; cursor: pointer; font: inherit; color: #57606a; }
    .hly-btn-ghost:hover { background: #f3f4f6; }
    .hly-btn-danger { background: transparent; border: 1px solid #f9c6c6; color: #cf222e; border-radius: 6px; padding: 8px 12px; cursor: pointer; font: inherit; }
    .hly-btn-danger:hover { background: #ffebe9; }
    .hly-confirm { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
    .hly-confirm .message { flex: 1; color: #cf222e; font-weight: 600; }
    .hly-status { color: #cf222e; font-size: 12px; margin-top: 8px; min-height: 0; }
    .hly-preview {
      position: fixed; top: 0; left: 0; z-index: 2147483647;
      background: #fff; border: 1px solid rgba(0,0,0,.14); border-radius: 8px;
      box-shadow: 0 8px 30px rgba(0,0,0,.3); padding: 4px;
      pointer-events: none;
    }
    .hly-preview img { display: block; max-width: 80vw; max-height: 80vh; width: auto; height: auto; border-radius: 5px; }
    .hly-peek {
      position: fixed; top: 0; left: 0; z-index: 2147483646;
      width: max-content; max-width: min(380px, calc(100vw - 24px));
      background: #fff; border: 1px solid rgba(0,0,0,.14); border-radius: 8px;
      box-shadow: 0 8px 30px rgba(0,0,0,.28); padding: 10px;
      pointer-events: none; max-height: 60vh; overflow: auto;
      font-size: 13px; color: #1f2328;
      font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .hly-peek img.peek-img { width: 50px; height: 50px; object-fit: cover; float: left; margin: 2px; border-radius: 6px; }
    .hly-lightbox {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0, 0, 0, .8);
      display: none; align-items: center; justify-content: center;
      cursor: zoom-out;
    }
    .hly-lightbox.open { display: flex; }
    .hly-lightbox img { max-width: 92vw; max-height: 92vh; border-radius: 6px; }
    .hidden { display: none !important; }
  `;

  function canonicalUrl() {
    try {
      return location.href.split("#")[0];
    } catch {
      return location.href;
    }
  }

  function build() {
    shadowEl = document.createElement("div");
    shadowEl.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;";
    shadowEl.dataset.hlyShadowHost = "";
    host = shadowEl.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLES;
    host.appendChild(style);

    // --- Annotate button ---
    const btn = document.createElement("button");
    btn.className = "hly-btn hidden";
    btn.textContent = "Annotate";
    btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep selection
    btn.addEventListener("click", () => {
      hideAnnotateButton();
      if (annotateCallback) annotateCallback();
    });
    host.appendChild(btn);
    els.button = btn;

    // --- Panel ---
    const panel = document.createElement("div");
    panel.className = "hly-panel hidden";
    panel.innerHTML = `
      <div class="hly-head">New annotation</div>
      <div class="hly-colors"></div>
      <div class="hly-md-tabs">
        <button type="button" data-md="write" class="on">Write</button>
        <button type="button" data-md="split">Split</button>
        <button type="button" data-md="preview">Preview</button>
      </div>
      <div class="hly-md-edit" data-mode="write">
        <textarea class="hly-text" placeholder="Write a note in Markdown…"></textarea>
        <div class="hly-resize" title="Drag to resize"></div>
        <div class="hly-md-preview"></div>
      </div>
      <div class="hly-images"></div>
      <button type="button" class="hly-add">+ Add image</button>
      <input type="file" accept="image/*" multiple class="hly-file" style="display:none">
      <div class="hly-actions">
        <button type="button" class="hly-btn-danger hidden">Delete</button>
        <span class="hly-spacer"></span>
        <button type="button" class="hly-btn-ghost">Cancel</button>
        <button type="button" class="hly-btn-primary">Save</button>
      </div>
      <div class="hly-confirm hidden">
        <span class="message">Delete this annotation?</span>
        <button type="button" class="hly-btn-ghost" data-c="no">Cancel</button>
        <button type="button" class="hly-btn-danger" data-c="yes">Delete</button>
      </div>
      <div class="hly-status"></div>
    `;
    host.appendChild(panel);
    els.panel = panel;
    els.colors = panel.querySelector(".hly-colors");
    els.text = panel.querySelector(".hly-text");
    els.mdEdit = panel.querySelector(".hly-md-edit");
    els.mdPreview = panel.querySelector(".hly-md-preview");
    els.resize = panel.querySelector(".hly-resize");
    els.images = panel.querySelector(".hly-images");
    els.add = panel.querySelector(".hly-add");
    els.file = panel.querySelector(".hly-file");
    els.status = panel.querySelector(".hly-status");
    els.save = panel.querySelector(".hly-btn-primary");
    els.cancel = panel.querySelector(".hly-btn-ghost");
    els.delete = panel.querySelector(".hly-btn-danger");
    els.head = panel.querySelector(".hly-head");
    els.actions = panel.querySelector(".hly-actions");
    els.confirm = panel.querySelector(".hly-confirm");
    els.confirmYes = els.confirm.querySelector('[data-c="yes"]');
    els.confirmNo = els.confirm.querySelector('[data-c="no"]');

    buildSwatches();
    els.add.addEventListener("click", () => els.file.click());
    els.file.addEventListener("change", onFiles);
    els.cancel.addEventListener("click", close);
    els.delete.addEventListener("click", showConfirm);
    els.confirmNo.addEventListener("click", hideConfirm);
    els.confirmYes.addEventListener("click", deleteCurrent);
    els.save.addEventListener("click", save);

    panel.querySelectorAll(".hly-md-tabs button").forEach((b) => {
      b.addEventListener("click", () => selectMode(b.dataset.md));
    });
    els.text.addEventListener("input", updateMdPreview);

    // Draggable divider for the Split view (resize the two panes).
    els.resize.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const cont = els.mdEdit;
      const rect = cont.getBoundingClientRect();
      const startX = e.clientX;
      const startPct = parseFloat(els.text.style.flexBasis) || 50;
      const move = (ev) => {
        const pct = Math.min(90, Math.max(10, startPct + ((ev.clientX - startX) / rect.width) * 100));
        els.text.style.flex = "1 1 " + pct + "%";
        els.mdPreview.style.flex = "1 1 auto";
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });

    // Hover preview (lightbox-style overlay) for note images.
    const preview = document.createElement("div");
    preview.className = "hly-preview hidden";
    preview.appendChild(document.createElement("img"));
    host.appendChild(preview);
    els.preview = preview;

    // Hover-to-peek tooltip for reapplied highlights.
    const peek = document.createElement("div");
    peek.className = "hly-peek hidden";
    peek.innerHTML = '<div class="hly-note"></div>';
    host.appendChild(peek);
    els.peek = peek;

    // Fullscreen click-to-zoom lightbox.
    const lightbox = document.createElement("div");
    lightbox.className = "hly-lightbox";
    lightbox.appendChild(document.createElement("img"));
    lightbox.addEventListener("click", closeLightbox);
    host.appendChild(lightbox);
    els.lightbox = lightbox;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && lightbox.classList.contains("open")) closeLightbox();
    });

    document.documentElement.appendChild(shadowEl);
  }

  function selectMode(mode) {
    els.mdEdit.dataset.mode = mode;
    host.querySelectorAll(".hly-md-tabs button").forEach((b) => {
      b.classList.toggle("on", b.dataset.md === mode);
    });
    updateMdPreview();
  }

  function updateMdPreview() {
    els.mdPreview.innerHTML = '<div class="hly-note">' + AnnotatorMarkdown.mdToHtml(els.text.value) + "</div>";
  }

  function openLightbox(data) {
    els.lightbox.querySelector("img").src = data;
    els.lightbox.classList.add("open");
    hidePreview();
  }

  function closeLightbox() {
    els.lightbox.classList.remove("open");
  }

  function buildSwatches() {
    SWATCHES.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hly-swatch";
      b.style.background = c;
      b.dataset.c = c;
      b.addEventListener("click", () => selectColor(c));
      els.colors.appendChild(b);
    });
    const custom = document.createElement("label");
    custom.className = "hly-custom";
    custom.innerHTML = '<span>+</span><input type="color" value="' + DEFAULT_COLOR + '">';
    const input = custom.querySelector("input");
    input.addEventListener("input", () => selectColor(input.value));
    els.colors.appendChild(custom);
  }

  function selectColor(c) {
    color = c;
    els.colors.querySelectorAll(".hly-swatch").forEach((s) => {
      s.classList.toggle("sel", s.dataset.c === c);
    });
  }

  function onFiles() {
    const files = Array.from(els.file.files).filter((f) => f.type.startsWith("image/"));
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        images.push(reader.result);
        renderImages();
      };
      reader.readAsDataURL(f);
    });
    els.file.value = "";
  }

  function renderImages() {
    els.images.innerHTML = "";
    images.forEach((data, i) => {
      const t = document.createElement("div");
      t.className = "hly-thumb";
      const img = document.createElement("img");
      img.src = data;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "\u00d7";
      rm.title = "Remove image";
      rm.addEventListener("click", () => {
        images.splice(i, 1);
        renderImages();
      });
      t.appendChild(img);
      t.appendChild(rm);
      t.addEventListener("mouseenter", () => showPreview(data, t));
      t.addEventListener("mouseleave", hidePreview);
      img.addEventListener("click", () => openLightbox(data));
      els.images.appendChild(t);
    });
  }

  function showPreview(data, thumbEl) {
    els.preview.querySelector("img").src = data;
    els.preview.classList.remove("hidden");
    const r = thumbEl.getBoundingClientRect();
    const b = els.preview.getBoundingClientRect();
    const pad = 8;
    let x = r.right + pad;
    let y = r.top;
    if (x + b.width > innerWidth - pad) x = r.left - b.width - pad;
    if (x < pad) x = pad;
    if (y + b.height > innerHeight - pad) y = Math.max(pad, innerHeight - b.height - pad);
    if (y < pad) y = pad;
    els.preview.style.left = x + "px";
    els.preview.style.top = y + "px";
  }

  function hidePreview() {
    els.preview.classList.add("hidden");
  }

  function setStatus(msg) {
    els.status.textContent = msg || "";
  }

  // Anchor the panel next to `rect`, clamped to the viewport.
  function position(rect) {
    if (!rect) rect = anchorRect;
    const pad = 8;
    panelOpen = true;
    els.panel.classList.remove("hidden");
    els.panel.style.visibility = "hidden";
    const b = els.panel.getBoundingClientRect();
    let x = rect ? rect.left : 16;
    let y = rect ? rect.bottom + pad : 60;
    if (y + b.height > innerHeight - pad) {
      y = rect ? Math.max(pad, rect.top - b.height - pad) : pad;
    }
    if (y < pad) y = pad;
    if (x + b.width > innerWidth - pad) x = Math.max(pad, innerWidth - b.width - pad);
    if (x < pad) x = pad;
    els.panel.style.left = x + "px";
    els.panel.style.top = y + "px";
    els.panel.style.visibility = "";
  }

  function openForRange(range, rect) {
    pendingRange = range;
    anchorRect = rect;
    currentId = null;
    color = DEFAULT_COLOR;
    images = [];
    els.text.value = "";
    els.head.textContent = "New annotation";
    els.delete.classList.add("hidden");
    selectColor(DEFAULT_COLOR);
    renderImages();
    setStatus("");
    hidePeek();
    selectMode("write");
    updateMdPreview();
    hideConfirm();
    position(rect);
    els.text.focus();
  }

  function openForId(id, rect) {
    AnnotatorStore.all()
      .then((list) => {
        const ann = list.find((a) => a.id === id);
        if (!ann) return;
        currentId = id;
        pendingRange = null;
        anchorRect = rect;
        color = ann.color || DEFAULT_COLOR;
        images = (ann.note && ann.note.images) || [];
        els.text.value = (ann.note && ann.note.text) || "";
        els.head.textContent = "Annotation";
        els.delete.classList.remove("hidden");
        selectColor(color);
        renderImages();
        setStatus("");
        hidePeek();
        selectMode("write");
        updateMdPreview();
        hideConfirm();
        position(rect);
      })
      .catch(() => setStatus("Could not load annotation."));
  }

  function showPeek(id, rect) {
    AnnotatorStore.all()
      .then((list) => {
        const ann = list.find((a) => a.id === id);
        if (!ann) return;
        const noteText = (ann.note && ann.note.text) || "";
        const imgs = (ann.note && ann.note.images) || [];
        let html = noteText
          ? '<div class="hly-note">' + AnnotatorMarkdown.mdToHtml(noteText) + "</div>"
          : '<div class="hly-note"><p style="color:#8b949e">No note text.</p></div>';
        if (imgs.length) html += imgs.map((s) => '<img class="peek-img" src="' + s + '">').join("");
        els.peek.innerHTML = html;
        els.peek.classList.remove("hidden");
        const b = els.peek.getBoundingClientRect();
        const pad = 6;
        let x = rect.right + pad;
        let y = rect.top;
        if (x + b.width > innerWidth - pad) x = rect.left - b.width - pad;
        if (x < pad) x = pad;
        if (y + b.height > innerHeight - pad) y = Math.max(pad, innerHeight - b.height - pad);
        if (y < pad) y = pad;
        els.peek.style.left = x + "px";
        els.peek.style.top = y + "px";
      })
      .catch(() => {});
  }

  function hidePeek() {
    if (els.peek) els.peek.classList.add("hidden");
  }

  function elById(id) {
    const sel = "." + TAG + '[data-hly-id="' + id + '"]';
    return document.querySelector(sel);
  }

  async function save() {
    const noteText = els.text.value.trim();
    const note = { text: noteText, images };

    if (currentId) {
      const spanEl = elById(currentId);
      if (spanEl) spanEl.style.background = color;
      await AnnotatorStore.update(currentId, { color, note });
      close();
      return;
    }

    if (!pendingRange) return;
    const id = crypto.randomUUID();
    const ann = {
      id,
      url: canonicalUrl(),
      host: location.origin,
      title: document.title,
      createdAt: Date.now(),
      color,
      range: AnnotatorRanges.serializeRange(pendingRange),
      note,
    };
    const span = AnnotatorRanges.applyHighlight(pendingRange, color, id);
    if (!span) {
      setStatus("Could not highlight that selection.");
      return;
    }
    await AnnotatorStore.add(ann);
    close();
  }

  async function deleteCurrent() {
    hideConfirm();
    if (!currentId) return;
    const spanEl = elById(currentId);
    if (spanEl) spanEl.remove();
    await AnnotatorStore.remove(currentId);
    close();
  }

  function showConfirm() {
    els.actions.classList.add("hidden");
    els.confirm.classList.remove("hidden");
  }

  function hideConfirm() {
    els.confirm.classList.add("hidden");
    els.actions.classList.remove("hidden");
  }

  function close() {
    panelOpen = false;
    els.panel.classList.add("hidden");
    els.status.textContent = "";
    hideConfirm();
    hidePreview();
    closeLightbox();
    hidePeek();
    currentId = null;
    pendingRange = null;
  }

  function hideAnnotateButton() {
    els.button.classList.add("hidden");
  }

  function showAnnotateButton(rect) {
    anchorRect = rect || anchorRect;
    els.button.classList.remove("hidden");
    if (rect) {
      const bh = 30;
      let x = rect.left + rect.width / 2 - 45;
      let y = rect.top - bh - 6;
      if (y < 4) y = rect.bottom + 6;
      x = Math.max(4, Math.min(x, innerWidth - 98));
      els.button.style.transform = "translate(" + x + "px," + y + "px)";
    }
  }

  return {
    init() {
      build();
    },
    setAnnotateCallback(fn) {
      annotateCallback = fn;
    },
    showAnnotateButton,
    hideAnnotateButton,
    openForRange,
    showPeek,
    hidePeek,
    openForId,
    close,
    isOpen() {
      return panelOpen;
    },
    // Callback used by content.js to close the panel when a selection browser
    // event demands it (e.g. mousedown outside).
    onDocumentPointerDown(target) {
      if (panelOpen && !shadowEl.contains(target)) close();
    },
  };
})();