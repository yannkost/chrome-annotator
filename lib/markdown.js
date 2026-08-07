// Lightweight, dependency-free Markdown-to-HTML for notes.
// SAFETY: input is HTML-escaped first, then only our own tags are emitted —
// raw HTML in notes can never be executed. Link hrefs are restricted to
// http/https and inline images to http/https or data:image.
self.AnnotatorMarkdown = (() => {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inline(str) {
    let s = String(str);
    s = escapeHtml(s);

    // Images: ![alt](url)
    s = s.replace(
      /!\[([^\]]*)\]\((data:image\/[^)\s]+|https?:[^)\s]+)\)/g,
      '<img src="$2" alt="$1">'
    );
    // Links: [text](url)
    s = s.replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
    );
    // Inline code
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Emphasis / strong / strike
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    return s;
  }

  function mdToHtml(src) {
    if (!src || !String(src).trim()) return "";
    const lines = String(src).replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let para = [];
    let i = 0;

    const flush = () => {
      if (para.length) {
        out.push("<p>" + para.map(inline).join("<br>") + "</p>");
        para = [];
      }
    };

    const ulRe = /^\s*[-*+]\s+.*$/;
    const olRe = /^\s*\d+[.)]\s+.*$/;
    let inFence = false;
    const code = [];

    while (i < lines.length) {
      const line = lines[i];

      if (/^\s*```/.test(line)) {
        if (inFence) {
          out.push("<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>");
          code.length = 0;
          inFence = false;
        } else {
          inFence = true;
        }
        i++;
        continue;
      }

      if (inFence) {
        code.push(line);
        i++;
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flush();
        const n = heading[1].length;
        out.push("<h" + n + ">" + inline(heading[2]) + "</h" + n + ">");
        i++;
        continue;
      }

      if (/^\s*(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
        flush();
        out.push("<hr>");
        i++;
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        flush();
        const q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          q.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        out.push("<blockquote>" + q.map(inline).join("<br>") + "</blockquote>");
        continue;
      }

      if (ulRe.test(line)) {
        flush();
        const items = [];
        while (i < lines.length && ulRe.test(lines[i])) {
          items.push(inline(lines[i].replace(/^\s*[-*+]\s+/, "")));
          i++;
        }
        out.push("<ul>" + items.map((x) => "<li>" + x + "</li>").join("") + "</ul>");
        continue;
      }

      if (olRe.test(line)) {
        flush();
        const items = [];
        while (i < lines.length && olRe.test(lines[i])) {
          items.push(inline(lines[i].replace(/^\s*\d+[.)]\s+/, "")));
          i++;
        }
        out.push("<ol>" + items.map((x) => "<li>" + x + "</li>").join("") + "</ol>");
        continue;
      }

      if (/^\s*$/.test(line)) {
        flush();
        i++;
        continue;
      }

      para.push(line);
      i++;
    }
    flush();
    if (inFence) out.push("<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>");
    return out.join("\n");
  }

  return { mdToHtml };
})();