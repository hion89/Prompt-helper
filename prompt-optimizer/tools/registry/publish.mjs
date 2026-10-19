import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRegistry, REGISTRY_SCHEMA } from '../../shared/registry-schema.js';
import { readJson, atomicWrite, digest } from './files.mjs';
export async function publishRegistry(registry, output, { at = new Date().toISOString() } = {}) {
  validateRegistry(registry);
  const old = await readJson(path.join(output, 'manifest.json'), null);
  const data = structuredClone(registry);
  data.version = Math.max(data.version + 1, (old?.version || 0) + 1);
  data.generatedAt = at; data.profileRevision = 'registry-' + data.version;
  validateRegistry(data);
  const raw = JSON.stringify(data); const sha256 = digest(raw); const bytes = Buffer.byteLength(raw);
  if (bytes > 2 * 1024 * 1024) throw new Error('Registry size limit');
  const file = 'registry-' + data.version + '-' + sha256.slice(0, 12) + '.json';
  await atomicWrite(path.join(output, file), raw);
  // Publish immutable data first. Manifest replacement is the commit point.
  await atomicWrite(path.join(output, 'manifest.json'), JSON.stringify({ schemaVersion: 1, version: data.version, file, sha256, bytes, generatedAt: at }, null, 2) + '\n');
  return data;
}
export async function writeBundle(data, root) {
  validateRegistry(data);
  await atomicWrite(path.join(root, 'registry/default-registry.json'), JSON.stringify(data, null, 2) + '\n');
  await atomicWrite(path.join(root, 'registry/registry.schema.json'), JSON.stringify(REGISTRY_SCHEMA, null, 2) + '\n');
  await atomicWrite(path.join(root, 'shared/registry-seed.js'), '// Generated from registry/default-registry.json; run node tools/registry/run.mjs --bundle.\nexport const DEFAULT_REGISTRY = ' + JSON.stringify(data) + ';\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const output = path.resolve(root, '../docs/registry');
  const command = process.argv[2];
  if (command === '--rollback') {
    const old = validateRegistry(await readJson(path.resolve(process.argv[3])));
    const data = await publishRegistry(old, output);
    await writeBundle(data, root); console.log('Rollback published as new monotonic version ' + data.version);
  } else throw new Error('Usage: node tools/registry/publish.mjs --rollback <previous-registry.json>');
}
