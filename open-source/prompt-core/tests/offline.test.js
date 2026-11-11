import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LocalPromptOptimizer } from '../providers/local-optimizer.js';

test('historical sources match their documented public origin hashes', async () => {
  const source = JSON.parse(await readFile(new URL('../SOURCE.json', import.meta.url)));
  assert.equal(source.extensionVersion, '1.13.1');
  assert.equal(source.commit, '9a8a71e89a6d79e8e141c11822309e81bcc55130');
  for (const file of source.files) {
    const bytes = await readFile(new URL('../' + file.path, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
});

test('compiler preserves exact facts, negations, code and formatting without network calls', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw Error('Network is forbidden in this reference'); };
  try {
    const optimizer = new LocalPromptOptimizer();
    const source = '  Do not translate this quotation. Keep -0.003, 22 and 2022 distinct.\r\n```js\r\nconst code = "KEEP";\r\n```\n  ';
    for (const mode of ['default', 'eco', 'precision', 'natural']) {
      for (const targetModel of ['chatgpt', 'claude', 'gemini', 'perplexity']) {
        const result = await optimizer.optimize(source, { mode, targetModel });
        assert.equal(result.ir.sourceText, source);
        assert.equal(result.text.split(source).length, 2);
        assert.equal(result.meta.provider, 'local');
      }
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test('runtime imports are relative and contain no network, storage or process primitives', async () => {
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) { await inspect(file); continue; }
      const text = await readFile(file, 'utf8');
      assert.doesNotMatch(text, /\b(?:fetch|XMLHttpRequest|WebSocket|eval|Function)\s*\(|\b(?:chrome|process|localStorage|sessionStorage)\s*\./);
      for (const match of text.matchAll(/from\s*['"]([^'"]+)['"]/g)) assert.match(match[1], /^\.\.?\//);
    }
  }
  await inspect(new URL('../core/', import.meta.url));
  await inspect(new URL('../providers/', import.meta.url));
});
