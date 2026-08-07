# chrome-annotator

A Manifest V3 Chrome extension for highlighting text and attaching persistent notes with images.

## What it does

- Select text on any page and a floating **Annotate** button appears above the selection.
- Clicking it opens a note panel where you can:
  - pick a highlight color (color picker, dark yellow by default),
  - write a note in **Markdown** (Write / Split / Preview tabs),
  - attach images (stored as base64; the `unlimitedStorage` permission bypasses the 10 MB quota).
- Save wraps the selection in a highlight; hover a thumbnail for a larger preview, click it for a fullscreen lightbox.
- Hover a reapplied highlight on the page to peek its note without opening the panel.
- Annotations persist in `chrome.storage.local` and are re-applied automatically the next time you visit the same page. Click a reapplied highlight to edit or delete it.
- A dedicated **annotation browser** (open it via the toolbar icon) lets you:
  - filter sites (search box, left panel),
  - pick a site to see all its notes,
  - filter notes by their text (search box, right panel),
  - open, edit, or delete each annotation,
  - **Export / Import** all annotations as JSON (backup or move between browsers).

## Install (developer mode)

1. Download or clone this repository and unzip it.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right).
4. Click **Load unpacked**.
5. Select the project folder (the one containing `manifest.json`).
6. The **Annotator** extension is now installed. Pin it to the toolbar to open the annotation browser.

## Data

Everything is stored locally in your browser (`chrome.storage.local`) — nothing is sent to any server.
