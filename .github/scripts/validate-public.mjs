// Public deployment validation only. Contains no optimization or evaluation engine.
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PUBLIC_FILES = new Set(['README.md', 'docs/.nojekyll', 'docs/index.html', 'docs/support.html', 'docs/privacy-policy.html',
  'docs/assets/malgyeol-icon.png', 'docs/registry/manifest.json', '.github/workflows/pages.yml', '.github/scripts/validate-public.mjs']);
export const REGISTRY_FILE = /^docs\/registry\/registry-([1-9][0-9]*)-([a-f0-9]{12})\.json$/;
export const allowedPublicPath = name => PUBLIC_FILES.has(name) || REGISTRY_FILE.test(name);
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export function parsePublicJSON(bytes, name) {
  try { return JSON.parse(bytes); } catch { throw Error('Invalid public JSON: ' + name); }
}
export function assertNoSecrets(bytes, name) {
  if (/\.png$/.test(name)) return; // Binary images require separate visual review.
  const text = bytes.toString('utf8');
  const rules = [/\bAIza[0-9A-Za-z_-]{30,}/, /\bAQ\.[0-9A-Za-z_-]{30,}/,
    /\bgh[pousr]_[0-9A-Za-z]{30,}/, /\bgithub_pat_[0-9A-Za-z_]{40,}/,
    /\bsk-(?:proj-|ant-)?[0-9A-Za-z_-]{32,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{64,}/];
  if (rules.some(rule => rule.test(text))) throw Error('Possible credential material: ' + name);
}
export async function publicFiles(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    if (!prefix && entry.name === '.git') continue;
    const name = prefix ? prefix + '/' + entry.name : entry.name;
    const stat = await lstat(path.join(root, name));
    if (stat.isSymbolicLink()) throw Error('Symlink is not publishable: ' + name);
    if (stat.isDirectory()) files.push(...await publicFiles(root, name));
    else if (stat.isFile()) files.push(name);
    else throw Error('Special file is not publishable: ' + name);
  }
  return files.sort();
}
export async function validatePublic(root) {
  const files = await publicFiles(root);
  for (const file of files) {
    if (!allowedPublicPath(file)) throw Error('File is outside the public allowlist: ' + file);
    const stat = await lstat(path.join(root, file));
    if (stat.size > 2 * 1024 * 1024) throw Error('Public file size limit: ' + file);
    assertNoSecrets(await readFile(path.join(root, file)), file);
    if (file.endsWith('.png')) {
      const image = await readFile(path.join(root, file));
      if (image.length < 26 || image.toString('hex', 0, 8) !== '89504e470d0a1a0a' || image.readUInt32BE(16) !== 128 || image.readUInt32BE(20) !== 128) throw Error('Invalid public brand icon');
    }
  }
  for (const required of PUBLIC_FILES) if (!files.includes(required)) throw Error('Missing public file: ' + required);
  const manifest = parsePublicJSON(await readFile(path.join(root, 'docs/registry/manifest.json')), 'manifest.json');
  if (Object.keys(manifest).some(key => !['schemaVersion','version','file','sha256','bytes','generatedAt'].includes(key))) throw Error('Unexpected registry manifest field');
  if (manifest.schemaVersion !== 1 || !Number.isSafeInteger(manifest.version) || manifest.version < 4
      || !REGISTRY_FILE.test('docs/registry/' + manifest.file) || !/^[a-f0-9]{64}$/.test(manifest.sha256)
      || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 2 * 1024 * 1024) throw Error('Invalid registry manifest');
  const versions = new Map();
  for (const file of files.filter(f => REGISTRY_FILE.test(f))) {
    const [, number, hash] = REGISTRY_FILE.exec(file);
    const raw = await readFile(path.join(root, file));
    const data = parsePublicJSON(raw, file);
    const version = Number(number);
    if (!Number.isSafeInteger(version) || data.schemaVersion !== 1 || data.version !== version || sha256(raw).slice(0, 12) !== hash
        || !Array.isArray(data.models) || !Array.isArray(data.profiles) || !data.models.length || !data.profiles.length) throw Error('Invalid registry payload: ' + file);
    if (versions.has(version)) throw Error('Same-version registry collision: ' + version);
    versions.set(version, file);
    if (version > manifest.version) throw Error('Manifest does not point to latest registry');
  }
  const latest = await readFile(path.join(root, 'docs/registry', manifest.file));
  if (latest.length !== manifest.bytes || sha256(latest) !== manifest.sha256 || versions.get(manifest.version) !== 'docs/registry/' + manifest.file) throw Error('Registry hash/size/version mismatch');
  return { manifest, files };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await validatePublic(path.resolve(process.argv[2] || '.')); console.log('Public allowlist and registry integrity PASS: v' + result.manifest.version + ', ' + result.files.length + ' files'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
