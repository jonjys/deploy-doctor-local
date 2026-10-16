import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { runRules } from '../src/rules.js';
import { redact } from '../src/context.js';
import { assertLocal } from '../src/ollama.js';

test('detects case mismatch from a real next build log', () => {
  const f = runRules(fs.readFileSync('examples/case-mismatch.log', 'utf8'), 'examples/broken-app');
  assert.ok(f[0].facts.some((x) => x.includes('CASE MISMATCH') && x.includes('header.js')));
});
test('detects missing suspense', () => {
  const f = runRules(fs.readFileSync('examples/suspense.log', 'utf8'), 'examples/suspense-app');
  assert.equal(f[0].id, 'missing-suspense');
});
test('redacts secrets', () => {
  const s = redact('STRIPE_SECRET_KEY=sk_live_abcdefgh1234 and ghp_aaaaaaaaaaaaaaaaaaaaaaaa');
  assert.ok(!s.includes('sk_live') && !s.includes('ghp_a'));
});
test('refuses remote model hosts', () => {
  assert.throws(() => assertLocal('https://api.example.com'));
  assert.doesNotThrow(() => assertLocal('http://127.0.0.1:11434'));
});
