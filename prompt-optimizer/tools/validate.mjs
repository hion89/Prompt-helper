import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFile(path.join(root, p), 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.type, 'module');
assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'storage']);
assert(!manifest.host_permissions, 'Static matching content scripts need no additional host permission.');
assert(!manifest.externally_connectable);
assert(!manifest.web_accessible_resources);
assert(!/unsafe-eval|unsafe-inline/.test(manifest.content_security_policy.extension_pages));
assert.deepEqual(manifest.optional_host_permissions, ['https://generativelanguage.googleapis.com/*']);
assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'none'; base-uri 'none'; connect-src https://generativelanguage.googleapis.com");
const references = [
  manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page,
  ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap(c => [...c.js, ...(c.css || [])]),
];
for (const p of references) await access(path.join(root, p));
for (const entry of manifest.content_scripts) {
  assert.equal(entry.run_at, 'document_idle');
  assert(entry.matches.every(m => m.startsWith('https://') && !m.includes('*://')));
}
async function walk(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name.startsWith('.') || item.name === 'node_modules') continue;
    const p = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...await walk(p));
    else files.push(p);
  }
  return files;
}
const files = await walk(root);
let scripts = 0;
for (const file of files) {
  if (!/\.(js|mjs)$/.test(file)) continue;
  scripts++;
  const check = spawnSync(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', '--check', file], { encoding: 'utf8', windowsHide: true });
  assert.equal(check.status, 0, check.stderr);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) {
    await access(path.resolve(path.dirname(file), match[1]));
  }
  if (/[/\\](core|popup|content|background|providers|shared)[/\\]/.test(file)) {
    assert(!/\beval\s*\(|new Function\s*\(/.test(source), 'CSP-unsafe code: ' + file);
    assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(source) || file.endsWith('remote-optimizer.js'), 'Unexpected network request: ' + file);
  }
}
for (const htmlPath of [manifest.action.default_popup, manifest.options_ui.page, 'help/help.html']) {
  const html = await read(htmlPath);
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'No inline scripts.');
  assert(!/\son\w+\s*=/i.test(html), 'No inline handlers.');
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    if (/^(?:#|https?:|data:)/.test(match[1])) continue;
    await access(path.resolve(root, path.dirname(htmlPath), match[1]));
  }
}
for (const [size, iconPath] of Object.entries(manifest.icons)) {
  const icon = await readFile(path.join(root, iconPath));
  assert.equal(icon.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16), Number(size));
  assert.equal(icon.readUInt32BE(20), Number(size));
}
console.log('PASS: Manifest V3, ' + references.length + ' resource references, ' + scripts + ' JS syntax/import checks, CSP, permissions, popup HTML and icon dimensions.');
