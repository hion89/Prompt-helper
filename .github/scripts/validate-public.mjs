// Public deployment validation only. Contains no optimization or evaluation engine.
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PUBLIC_FILES = new Set(['README.md', 'docs/.nojekyll', 'docs/index.html', 'docs/support.html', 'docs/privacy-policy.html',
  'docs/assets/malgyeol-icon.png', 'docs/registry/manifest.json', '.github/workflows/pages.yml', '.github/scripts/validate-public.mjs']);
// Frozen, manually reviewed reference release. No directory-wide source allowance.
export const REFERENCE_FILES = Object.freeze({
  "open-source/prompt-core/core/adapters/base.js": "a1d7977b55b41c795ae9f1f186fd085c0d59624a349866acf390aaddab0173a9",
  "open-source/prompt-core/core/adapters/chatgpt.js": "bc96ac640d48282f35ea19a2269f11502d28d317de9711ec3afc491d3bd7dc52",
  "open-source/prompt-core/core/adapters/claude.js": "07bf29e7d9bcabc12432ce8b862c469ccfd194a22f35ab3edbfdd6097089bdba",
  "open-source/prompt-core/core/adapters/gemini.js": "fd5e26e7656b0960be1b879cc4de0b7d2cab756a29ce50dacc80ae600476bccb",
  "open-source/prompt-core/core/adapters/index.js": "17dca9e8442989a996ba545b399668f583ddf0a44df401150ee7f938db464c76",
  "open-source/prompt-core/core/adapters/perplexity.js": "0b5dcc9fac357b42ca1880176d247b571296e959ec51e3543e0b0b3a7fdcd9dc",
  "open-source/prompt-core/core/adapters/profiles.js": "5836df4c89ffdb49109df9e1bc631728eba17f3f0e21d1bba03904a112f369a3",
  "open-source/prompt-core/core/intent-parser.js": "5fd37307e6cf5a0981f1cf80de2afe1cdf33e81816551e85480239d17de869fa",
  "open-source/prompt-core/core/languages/language-adapter.js": "d47c91e5c596ae86e769bcc480c45c24729cad54c46949154946c4e670db2c5c",
  "open-source/prompt-core/core/languages/messages.js": "0fcddffd3f992f752c189dc46967104e77ff388d45fcf92f2c291b4ea766fbb6",
  "open-source/prompt-core/core/modes/default.js": "625bbdf82cdd1c9241958f3304339a770ff0313d0c869a7c3bab8e24e5a9a381",
  "open-source/prompt-core/core/modes/eco.js": "9a0ef6a7111b20aa9e2995882a4e5720be5336c03afd04e8377b7eaa1e0a62cd",
  "open-source/prompt-core/core/modes/index.js": "48b2b9f3343b9d88553a50623533d8f31ee3dba24f83d9dfef8c4d679e88c330",
  "open-source/prompt-core/core/modes/natural.js": "1930bdb3bd709ac1bac7ceef3cb19309b3cd77f46c8b2e138b9b6b11439a0b98",
  "open-source/prompt-core/core/modes/precision.js": "ad1e3b34535972341f82009a95b4300de62fe194d0b541c84d87555eadf03412",
  "open-source/prompt-core/core/prompt-builder.js": "ec1c6fe1b0506f4acd00c74a0ba5e9b746d2150541f65936663cc1e88191ac51",
  "open-source/prompt-core/core/prompt-ir.js": "172db465870eb7522261913f166f9ec6ae09ba54c6c8103b5cdab9bfd4d495b1",
  "open-source/prompt-core/examples/basic.mjs": "87591a4965bddc34333a67f158d615f5113f143963bb958df2540ca8ad8472aa",
  "open-source/prompt-core/LICENSE": "4805279343a8e4b7fe14cecd21ed0ef6fee2efa114924a70236fec66f27b1013",
  "open-source/prompt-core/package.json": "a01857d1ed56f1aad3e9d601598f9444fedb8f4d2b7652cacf915b0a08612a7e",
  "open-source/prompt-core/providers/local-optimizer.js": "47c5513fdf7a094b4a2956374a27d937b627f0dc73d9fea4ccf5c833363791af",
  "open-source/prompt-core/providers/optimizer-provider.js": "b33814291080ff24572f96df3a0f2ead6069e46afaae5fb022c5c845f115d0ee",
  "open-source/prompt-core/README.md": "73434727dea8db07095bcd438941e87427fae5a79359f5b582f485e5e8abb351",
  "open-source/prompt-core/SOURCE.json": "71cfae63e88cdd105b60eb3dbc6a13c79354770096952184ac3485ab4092322a",
  "open-source/prompt-core/tests/compiler.test.js": "4f74893da16740169e67d2947ecb95f9f41af65e8a02448d56cffc1d46d41471",
  "open-source/prompt-core/tests/offline.test.js": "71d665c19196d8ab79645fd192fed8b2fc479394cea2b54a4808d71768e5cebd"
});
export const EXTRA_PUBLIC_FILES = new Set(['.gitattributes', 'SECURITY.md', 'docs/open-source.html']);
export function assertReferenceFiles(content) {
  const hasReference = [...content.keys()].some(name => name.startsWith('open-source/'));
  if (!hasReference) return; // Existing public history predates this reviewed release.
  for (const [name, hash] of Object.entries(REFERENCE_FILES)) {
    if (!content.has(name) || sha256(content.get(name)) !== hash) throw Error('Reviewed reference hash mismatch or missing file: ' + name);
  }
  for (const name of EXTRA_PUBLIC_FILES) if (!content.has(name)) throw Error('Missing reference documentation: ' + name);
}
export const REGISTRY_FILE = /^docs\/registry\/registry-([1-9][0-9]*)-([a-f0-9]{12})\.json$/;
export const allowedPublicPath = name => PUBLIC_FILES.has(name) || EXTRA_PUBLIC_FILES.has(name) || Object.hasOwn(REFERENCE_FILES, name) || REGISTRY_FILE.test(name);
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
  assertReferenceFiles(new Map(await Promise.all(files.map(async file => [file, await readFile(path.join(root, file))]))));
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
