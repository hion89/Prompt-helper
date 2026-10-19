import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT' && arguments.length > 1) return fallback; throw error; }
}
export async function atomicWrite(path, text) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, text, { flag: 'wx' }); await rename(temporary, path);
}
export const profilePayload = profile => ({ brand: profile.brand, modelId: profile.modelId, policyId: profile.policyId, optimization: profile.optimization, recommendations: profile.recommendations, sourceRefs: profile.sourceRefs });
