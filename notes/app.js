// Dedicated annotation browser: left = URL list (search #1), right = that
// page's annotations (search #2), with edit/delete per note.
(() => {
  const $ = (id) => document.getElementById(id);
  const urlSearch = $("url-search");
  const noteSearch = $("note-search");
  const urlList = $("url-list");
  const notesList = $("notes-list");
  const notesHead = $("notes-head");
  const empty = $("empty");
  const totalCount = $("total-count");

  let all = [];
  let selectedUrl = null;

  function groupByUrl(anns) {
    const map = new Map();
    for (const a of anns) {
      if (!map.has(a.url)) map.set(a.url, { url: a.url, host: a.host || "", title: a.title || "", notes: [] });
      map.get(a.url).notes.push(a);
    }
    return [...map.values()].sort((x, y) => (x.host + x.url).localeCompare(y.host + y.url));
  }

  function esc(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function fmtDate(ts) {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return "";
    }
  }

  function renderUrls() {
    const q = urlSearch.value.trim().toLowerCase();
    const groups = groupByUrl(all).filter(
      (g) => !q || (g.host + " " + g.url + " " + g.title).toLowerCase().includes(q)
    );
    urlList.innerHTML = "";
    totalCount.textContent = all.length + " annotation" + (all.length === 1 ? "" : "s");

    if (!groups.length) {
      const li = document.createElement("li");
      li.className = "url-item";
      li.style.color = "#8b949e";
      li.textContent = "No sites match.";
      urlList.appendChild(li);
      return;
    }

    for (const g of groups) {
      const li = document.createElement("li");
      li.className = "url-item" + (g.url === selectedUrl ? " active" : "");
      li.innerHTML =
        '<div class="u-host">' + esc(g.host) + "</div>" +
        '<div class="u-title">' + esc(g.title || g.url) + "</div>" +
        '<div class="u-meta">' + g.notes.length + " note" + (g.notes.length === 1 ? "" : "s") + "</div>";
      li.addEventListener("click", () => {
        selectedUrl = g.url;
        renderUrls();
        renderNotes();
      });
      urlList.appendChild(li);
    }
  }

  function renderNotes() {
    notesList.innerHTML = "";
    if (!selectedUrl) {
      notesHead.classList.add("hidden");
      empty.classList.remove("hidden");
      empty.textContent = "Select a site on the left to see its annotations.";
      return;
    }
    const group = groupByUrl(all).find((g) => g.url === selectedUrl);
    if (!group) {
      selectedUrl = null;
      renderUrls();
      renderNotes();
      return;
    }
    notesHead.classList.remove("hidden");
    notesHead.textContent = group.host + (group.title ? " — " + group.title : "");

    const q = noteSearch.value.trim().toLowerCase();
    const notes = group.notes
      .filter((a) => {
        if (!q) return true;
        const hay = ((a.note && a.note.text) || "") + " " + (a.range && a.range.content || "");
        return hay.toLowerCase().includes(q);
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    empty.classList.toggle("hidden", notes.length > 0);
    if (!notes.length) {
      empty.classList.remove("hidden");
      empty.textContent = "No matching notes.";
      return;
    }

    for (const a of notes) {
      notesList.appendChild(card(a));
    }
  }

  function card(a) {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.id = a.id;

    const noteText = (a.note && a.note.text) || "";
    const quote = (a.range && a.range.content) || "";

    const imgs = (a.note && a.note.images) || [];

    el.innerHTML =
      '<div class="row-top">' +
      '<span class="chip" style="background:' + esc(a.color || "#C9A000") + '"></span>' +
      '<span class="quote" style="border-left-color:' + esc(a.color || "#C9A000") + '">' + esc(quote || "(no selected text)") + "</span>" +
      "</div>" +
      '<div class="note-body"><div class="note-text">' + (noteText ? AnnotatorMarkdown.mdToHtml(noteText) : '<span style="color:#8b949e">No note text.</span>') + "</div></div>" +
      '<div class="imgs"></div>' +
      '<div class="meta">Added ' + fmtDate(a.createdAt) + "</div>" +
      '<div class="actions">' +
      '<button class="btn" data-act="open">Open page</button>' +
      '<button class="btn" data-act="edit">Edit</button>' +
      '<button class="btn danger" data-act="delete">Delete</button>' +
      "</div>";

    const imgsEl = el.querySelector(".imgs");
    for (const src of imgs) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "note image";
      img.addEventListener("click", () => openLightbox(src));
      img.addEventListener("mouseenter", () => showPreview(src, img));
      img.addEventListener("mouseleave", hidePreview);
      imgsEl.appendChild(img);
    }

    el.querySelector("[data-act='open']").addEventListener("click", () => {
      chrome.tabs.create({ url: a.url });
    });

    el.querySelector("[data-act='delete']").addEventListener("click", async () => {
      if (!window.confirm("Delete this annotation?")) return;
      await AnnotatorStore.remove(a.id);
      all = await AnnotatorStore.all();
      renderUrls();
      renderNotes();
    });

    el.querySelector("[data-act='edit']").addEventListener("click", () => {
      if (el.querySelector(".note-body textarea")) return;
      const body = el.querySelector(".note-body");
      body.innerHTML =
        '<div class="md-tabs">' +
        '<button type="button" data-md="write" class="on">Write</button>' +
        '<button type="button" data-md="split">Split</button>' +
        '<button type="button" data-md="preview">Preview</button>' +
        "</div>" +
        '<div class="md-edit" data-mode="write">' +
        '<textarea data-edit="text">' + esc(noteText) + "</textarea>" +
        '<div class="md-resize" title="Drag to resize"></div>' +
        '<div class="md-preview"></div>' +
        "</div>" +
        '<div class="actions" style="margin-top:8px">' +
        '<button class="btn primary" data-act="save">Save</button>' +
        '<button class="btn" data-act="edit-cancel">Cancel</button>' +
        "</div>";
      const ta = body.querySelector("textarea");
      const preview = body.querySelector(".md-preview");
      const update = () => {
        preview.innerHTML = '<div class="note-text">' + AnnotatorMarkdown.mdToHtml(ta.value) + "</div>";
      };
      update();
      body.querySelectorAll(".md-tabs button").forEach((b) => {
        b.addEventListener("click", () => {
          body.querySelector(".md-edit").dataset.mode = b.dataset.md;
          body.querySelectorAll(".md-tabs button").forEach((x) => x.classList.toggle("on", x === b));
          update();
        });
      });
      ta.addEventListener("input", update);
      body.querySelector(".md-resize").addEventListener("mousedown", (e) => {
        e.preventDefault();
        const cont = body.querySelector(".md-edit");
        const rect = cont.getBoundingClientRect();
        const startX = e.clientX;
        const startPct = parseFloat(ta.style.flexBasis) || 50;
        const move = (ev) => {
          const pct = Math.min(90, Math.max(10, startPct + ((ev.clientX - startX) / rect.width) * 100));
          ta.style.flex = "1 1 " + pct + "%";
          preview.style.flex = "1 1 auto";
        };
        const up = () => {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
      body.querySelector("[data-act='save']").addEventListener("click", async () => {
        const newText = ta.value.trim();
        await AnnotatorStore.update(a.id, { note: { text: newText, images: (a.note && a.note.images) || [] } });
        all = await AnnotatorStore.all();
        renderNotes();
      });
      body.querySelector("[data-act='edit-cancel']").addEventListener("click", renderNotes);
    });

    return el;
  }

  let lightbox = null;
  function openLightbox(src) {
    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.className = "lightbox";
      const img = document.createElement("img");
      lightbox.appendChild(img);
      lightbox.addEventListener("click", () => lightbox.classList.remove("open"));
      document.body.appendChild(lightbox);
    }
    lightbox.querySelector("img").src = src;
    lightbox.classList.add("open");
  }

  let preview = null;
  function showPreview(src, thumb) {
    if (!preview) {
      preview = document.createElement("div");
      preview.className = "preview";
      preview.appendChild(document.createElement("img"));
      document.body.appendChild(preview);
    }
    preview.querySelector("img").src = src;
    preview.classList.add("open");
    const r = thumb.getBoundingClientRect();
    const pad = 8;
    const b = preview.getBoundingClientRect();
    let x = r.right + pad;
    let y = r.top;
    if (x + b.width > innerWidth - pad) x = r.left - b.width - pad;
    if (x < pad) x = pad;
    if (y + b.height > innerHeight - pad) y = Math.max(pad, innerHeight - b.height - pad);
    if (y < pad) y = pad;
    preview.style.left = x + "px";
    preview.style.top = y + "px";
  }
  function hidePreview() {
    if (preview) preview.classList.remove("open");
  }

  urlSearch.addEventListener("input", renderUrls);
  noteSearch.addEventListener("input", renderNotes);

  async function exportJson() {
    const anns = await AnnotatorStore.all();
    const payload = {
      app: "chrome-annotator",
      version: 1,
      exportedAt: new Date().toISOString(),
      annotations: anns,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "annotator-export-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importJson(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const arr = Array.isArray(data) ? data : Array.isArray(data.annotations) ? data.annotations : [];
      const cleaned = arr.filter((x) => x && x.id && x.url && x.range && typeof x.range.content === "string");
      if (!cleaned.length) {
        window.alert("No valid annotations found in that file.");
        return;
      }
      await AnnotatorStore.replace(cleaned);
      all = await AnnotatorStore.all();
      selectedUrl = (groupByUrl(all)[0] || {}).url || null;
      renderUrls();
      renderNotes();
      window.alert("Imported " + cleaned.length + " annotations.");
    } catch (err) {
      window.alert("Import failed: " + err.message);
    }
  }

  $("export").addEventListener("click", exportJson);
  $("import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", importJson);

  (async function init() {
    all = await AnnotatorStore.all();
    if (!all.length) {
      urlList.innerHTML = "";
      totalCount.textContent = "0 annotations";
      empty.classList.remove("hidden");
      empty.innerHTML = "No annotations yet. Select text on any page and click <strong>Annotate</strong>.";
      return;
    }
    selectedUrl = groupByUrl(all)[0].url;
    renderUrls();
    renderNotes();
  })();
})();