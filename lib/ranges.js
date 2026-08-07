// Serialize a live Range into a stable-enough descriptor (XPath to the owning
// element + index of the text node among its childNodes + char offsets), and
// re-materialize it later. Re-location is best-effort: XPath first, then a
// document-wide substring search for the quoted text (unique match only).
self.AnnotatorRanges = (() => {
  function nodeXPath(el) {
    let n = el && el.nodeType === Node.ELEMENT_NODE ? el : el && el.parentElement;
    if (!n) return "/html";
    if (n === document.documentElement) return "/html";
    const parts = [];
    while (n && n.nodeType === Node.ELEMENT_NODE && n !== document.documentElement) {
      let idx = 1;
      let sib = n.previousElementSibling;
      while (sib) {
        if (sib.tagName === n.tagName) idx++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(n.tagName.toLowerCase() + "[" + idx + "]");
      n = n.parentElement;
    }
    return "/html/" + parts.join("/");
  }

  function xpathQuery(xp) {
    if (!xp) return null;
    if (xp === "/html") return document.documentElement;
    try {
      const res = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return res.singleNodeValue;
    } catch {
      return null;
    }
  }

  function rangeFor(node, start, end) {
    try {
      const r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, end);
      return r;
    } catch {
      return null;
    }
  }

  function serializeRange(range) {
    let node = range.startContainer;
    let element = node;
    let nodeIndex = -1;

    if (node.nodeType === Node.TEXT_NODE) {
      element = node.parentElement || document.body;
      if (element && element.childNodes) {
        nodeIndex = Array.prototype.indexOf.call(element.childNodes, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      element = node;
    }

    let content = "";
    try {
      content = range.toString();
    } catch {
      content = "";
    }

    return {
      nodePath: nodeXPath(element),
      nodeIndex,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      content,
    };
  }

  function resolveRange(ser) {
    if (!ser) return null;
    const el = xpathQuery(ser.nodePath);
    let node = el;
    if (el && ser.nodeIndex != null && ser.nodeIndex >= 0 && el.childNodes) {
      node = el.childNodes[ser.nodeIndex];
    }
    if (!node) return null;

    const len = typeof node.data === "string" ? node.data.length : (node.textContent ? node.textContent.length : 0);
    if (len === 0) return null;

    const s = Math.max(0, Math.min(ser.startOffset || 0, len));
    const e = Math.max(s, Math.min(ser.endOffset || 0, len));
    const expect = ser.content || "";

    if (typeof node.data === "string") {
      if (expect) {
        if (node.data.substr(s, e - s) === expect) return rangeFor(node, s, e);
        const found = node.data.indexOf(expect);
        if (found !== -1) return rangeFor(node, found, found + expect.length);
        return null;
      }
      return rangeFor(node, s, e);
    }
    return rangeFor(node, s, e);
  }

  // Fallback re-location: find the quoted text anywhere on the page.
  // Returns null when the match is ambiguous or missing.
  function findByText(content) {
    if (!content) return null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let match = null;
    while ((node = walker.nextNode())) {
      const idx = node.data.indexOf(content);
      if (idx === -1) continue;
      if (match) return null; // ambiguous
      match = { node, idx };
    }
    if (!match) return null;
    return rangeFor(match.node, match.idx, match.idx + content.length);
  }

  // Wrap a range in a highlighted span. Best-effort: surroundContents first,
  // fall back to extract+insert when the range covers partial element nodes.
  // Sets data-hly-id when an id is provided.
  function applyHighlight(range, color, id) {
    if (!range || range.collapsed) return null;
    const span = document.createElement("span");
    span.className = "hly-marker";
    span.style.background = color;
    if (id) span.dataset.hlyId = id;
    try {
      range.surroundContents(span);
    } catch {
      try {
        const frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      } catch {
        return null;
      }
    }
    return span;
  }

  return { serializeRange, resolveRange, findByText, applyHighlight };
})();