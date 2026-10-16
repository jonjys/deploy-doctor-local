#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { runRules } from '../src/rules.js';
import { trimLog, repoContext, redact } from '../src/context.js';
import { ask } from '../src/ollama.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (args.includes('-h') || args.includes('--help')) {
  console.log(`ddl: offline Vercel/Next.js build doctor

Usage:
  vercel build 2>&1 | ddl --repo .
  ddl --log build.log --repo ./my-app [--model qwen2.5-coder:3b] [--rules-only] [--show-prompt]

Env: OLLAMA_HOST (default http://127.0.0.1:11434), DDL_MODEL`);
  process.exit(0);
}
const repo = path.resolve(opt('--repo', '.'));
const model = opt('--model', process.env.DDL_MODEL || 'qwen2.5-coder:3b');
const host = process.env.OLLAMA_HOST ? (process.env.OLLAMA_HOST.startsWith('http') ? process.env.OLLAMA_HOST : `http://${process.env.OLLAMA_HOST}`) : 'http://127.0.0.1:11434';
const logPath = opt('--log');
const log = logPath ? fs.readFileSync(logPath, 'utf8') : fs.readFileSync(0, 'utf8');

const findings = runRules(log, repo);
console.log('\n== deploy-doctor-local ==');
console.log(`repo:  ${repo}\nmodel: ${model} via ${host} (local only)\n`);
if (findings.length) {
  console.log('Known patterns:');
  for (const f of findings) { console.log(`  * ${f.title}`); for (const x of f.facts) console.log(`      - ${x}`); }
} else console.log('Known patterns: none matched, the model will work from the log alone.');
if (args.includes('--rules-only')) process.exit(0);

const system = `You are a senior Next.js and Vercel engineer. Diagnose one failed production build.
Answer in this exact format, short and concrete:
CAUSE: one sentence.
FIX: numbered steps. Name exact files and lines. Include a code or shell snippet if useful.
WHY IT WORKED LOCALLY: one sentence, or "n/a".
If FACTS contain a VERIFIED FIX, your FIX must follow it. Trust FACTS over your own guesses. Do not invent files that are not shown.`;
const prompt = `FACTS FROM STATIC CHECKS:\n${findings.map((f) => `- ${f.title}: ${f.facts.join('; ')}`).join('\n') || '- none'}\n\nBUILD LOG (trimmed, secrets redacted):\n${redact(trimLog(log))}\n\nREPO FILES:\n${repoContext(repo, log)}`;
if (args.includes('--show-prompt')) console.log('\n--- prompt sent to local model ---\n' + prompt + '\n---');

try {
  const r = await ask({ host, model, system, prompt });
  const text = r.text.split('\n').filter((l) => !/^(Trust the FACTS|Do not invent)/.test(l.trim())).join('\n').trim();
  console.log('\nDiagnosis:\n' + text);
  console.log(`\n(${r.promptTokens} prompt tokens, ${r.evalTokens} output tokens, ${(r.ms / 1000).toFixed(1)}s on this machine, 0 bytes sent off it)`);
} catch (e) {
  console.error(`\nLocal model unavailable: ${e.message}\nStart it with: ollama serve && ollama pull ${model}`);
  process.exit(findings.length ? 0 : 1);
}
