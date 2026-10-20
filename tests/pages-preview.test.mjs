import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildPagesPreview,
  PREVIEW_FILES,
  STAGING_API,
} from '../tools/build-pages-preview.mjs';

test('Pages preview contains only the safe static allowlist', async () => {
  const output = await mkdtemp(join(tmpdir(), 'between-pages-preview-'));
  try {
    const result = await buildPagesPreview(output);
    const expected = [...PREVIEW_FILES, 'g5-config.js'];
    assert.deepEqual(result.files, expected);
    assert.deepEqual((await readdir(output)).sort(), [...expected].sort());

    const config = await readFile(join(output, 'g5-config.js'), 'utf8');
    assert.match(config, new RegExp(STAGING_API.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(config, /oauth|redirect|secret|token/i);

    for (const file of PREVIEW_FILES) {
      assert.ok((await readFile(join(output, file), 'utf8')).length > 0, file);
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
