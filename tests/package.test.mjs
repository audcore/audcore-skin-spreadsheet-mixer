import assert from "node:assert/strict";
import test from "node:test";
import { buildPackage } from "../tools/build-package.mjs";
import { readSkinArchive } from "../tools/package-archive.mjs";


test("Sheet updates the installed skin ID and ships the shared mixer", async () => {
  const archive = readSkinArchive((await buildPackage(new URL("..", import.meta.url))).bytes);
  assert.equal(archive.manifest.id, "cn.audcore.routing-matrix");
  assert.equal(archive.manifest.name, "表格");
  assert.equal(archive.manifest.version, "0.4.16");
  assert.equal(archive.manifest.window.title, "工作簿 - Audcel v${skinVersion} | 声核 v${hostVersion}");
  assert.deepEqual(archive.manifest.window.default, [1080, 692]);
  const icon = archive.files.get(archive.manifest.window.icon);
  assert.equal(icon.readUInt32LE(0), 0x00010000);
  assert.equal(icon.readUInt16LE(4), 7);
  assert.deepEqual(Array.from({ length: 7 }, (_, index) => icon[6 + 16 * index]), [16, 24, 32, 48, 64, 128, 0]);
  const preview = archive.files.get(archive.manifest.preview);
  assert.equal(preview.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.deepEqual([preview.readUInt32BE(16), preview.readUInt32BE(20)], [160, 120]);
  assert.deepEqual(archive.manifest.themes, ["light", "dark"]);
  assert.ok(archive.files.has(archive.manifest.entry));
  assert.ok(archive.files.has("web/page.mjs"));
  assert.equal(archive.files.has("web/matrix-page.mjs"), false);
  assert.equal(archive.files.has("web/browser-preview.mjs"), false);

  const page = archive.files.get(archive.manifest.entry).toString();
  assert.match(page, /<title>Audcel<\/title>/);
  const header = page.match(/<header[^>]*>([\s\S]*?)<\/header>/)[1];
  assert.match(header, /id="window-close"/);
  assert.match(header, /id="table-save"/);
  for (const id of ["system-menu", "table-save", "table-undo", "add-channel", "transport", "table-search-box", "settings", "table-theme", "window-minimize", "window-maximize", "window-close"]) {
    assert.match(header, new RegExp(`id="${id}"[^>]*>\\s*<svg[^>]*viewBox="0 0 16 16"`));
  }
  assert.match(header, /id="settings"[\s\S]*?<\/button>\s*<button id="table-theme"/);
  assert.match(header, /<input id="table-search" type="search"[^>]+aria-controls="channels"/);
  assert.doesNotMatch(page, /ribbon|formula-bar/);
  assert.doesNotMatch(page, /data-table-label="输出"/);
  assert.match(page, /<footer id="table-footer" class="table-footer">/);
  assert.doesNotMatch(page.match(/<footer[^>]*>([\s\S]*?)<\/footer>/)[1], /type="range"/);
  assert.doesNotMatch(page, /table-sheet-bar|table-status-bar/);
  assert.match(page, /class="table-sheet-tab"/);
  assert.match(page, /id="table-scroll-x"[^>]+aria-controls="table-viewport"/);
  assert.match(page, /id="table-scroll-y"[^>]+aria-orientation="vertical"/);
  assert.match(page, /id="channels"[^>]*><\/div>\s*<div class="table-extension" aria-hidden="true">/);
  assert.match(page, /data-table-label="相位"[^\n]+\s+<span class="table-mute-label"/);
  assert.match(page, /data-table-label="效果链旁通"[^\n]+\s+<div class="table-row-heading"><span data-table-label="效果器"/);
  const css = archive.files.get("web/matrix.css").toString();
  assert.match(css, /#skin-root \{[^}]*border: 1px solid var\(--edge\);\s*border-radius: 3px;\s*overflow: clip;\s*background: var\(--paper\);/s);
  assert.match(css, /--table-column-width: 76px/);
  assert.match(css, /\.effects > \[data-effect-instance\] button \{[^}]*background: transparent;/s);
  assert.match(css, /\.table-send-level \{[^}]*justify-items: end; opacity: \.5; \}/);
  assert.match(css, /\.table-send-level::before \{ content: "-60\.0"; visibility: hidden; \}/);
  assert.match(css, /\.sends > \[role="slider"\] \{[^}]*font-size: 10px;/s);
  assert.match(css, /\.toolbar \{[^}]*--sheet-mark-size: 24px;[^}]*flex: 0 0 var\(--toolbar-height\)/s);
  assert.match(css, /\.toolbar \{[^}]*background: linear-gradient\(color-mix[^}]*backdrop-filter: blur\(12px\)/s);
  assert.match(css, /\.table-footer \{[^}]*background: color-mix[^}]*backdrop-filter: blur\(12px\)/s);
  assert.match(css, /\.table-viewport \{[^}]*scrollbar-width: none/s);
  assert.match(css, /\.table-extension \{[^}]*flex: 1 0 0;[^}]*pointer-events: none;/s);
  assert.match(css, /--extra-grid-height: calc\(10 \* var\(--cell\)\)/);
  assert.match(css, /grid-auto-rows: minmax\(var\(--extra-grid-height\), 1fr\)/);
  assert.match(css, /\.table-extension \{[^}]*grid-template-rows:[^;]*minmax\(var\(--extra-grid-height\), 1fr\)/s);
  assert.match(css, /\.table-extension > :last-child \{\s*padding-block-end: 1px;\s*background-clip: content-box;/);
  assert.match(css, /\.toolbar :is\(\.quick-access, \.caption\)[^}]*align-self: center/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?#window-drag \{ flex: 0 1 24px;[^}]*\}\s*#table-search-slot \{ flex: 1 1 160px; \}/);
  assert.match(css, /@media \(max-width: 500px\) \{\s*#table-search-slot \{ flex: 0 0 31px; \}/);
  assert.match(css, /#table-search-box:focus-within \{\s*width: 176px;/);
  assert.match(css, /calc\(var\(--cell\) \* 1\.4\)/);
  assert.match(css, /\.table-mute-label, \.channel \[data-control="mute"\] \{ font-weight: 700; \}/);
  assert.match(css, /\.channel\[data-muted\] \{ --cell-fade: 60%; \}/);
  assert.match(css, /:is\(\.channel\[data-muted\] > :not\(\.table-stack, \.value\),[^{}]*\)::after \{[^}]*inset: 0;[^}]*color-mix\(in srgb, var\(--paper\) var\(--cell-fade\), transparent\)/s);
  assert.match(css, /\.channel button\[data-control="mute"\] \{ background: var\(--channel-color\)/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.doesNotMatch(css.match(/\.value \{[^}]*\}/)[0], /\bborder:/);
  assert.match(css, /#table-rows\s*\{\s*position: sticky;\s*left: 0/);

});
