import fs from 'node:fs';
import path from 'node:path';

const SECRET_RES = [
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
  /((?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z_]*\s*[=:]\s*)\S+/gi,
];
export function redact(s) { return SECRET_RES.reduce((acc, re) => acc.replace(re, (m, p1) => (typeof p1 === 'string' && /[=:]\s*$/.test(p1) ? p1 : '') + '[REDACTED]'), s); }

// Keep only the part of the log that matters: the first error block plus a little context.
export function trimLog(log, max = 3500) {
  const lines = log.split('\n');
  const i = lines.findIndex((l) => /error|failed|can't resolve|cannot find/i.test(l));
  const start = Math.max(0, (i < 0 ? lines.length - 60 : i) - 15);
  return lines.slice(start, start + 80).join('\n').slice(0, max);
}

export function repoContext(repo, log) {
  const parts = [];
  const pkg = safeRead(path.join(repo, 'package.json'));
  if (pkg) parts.push(`--- package.json ---\n${pkg.slice(0, 1500)}`);
  for (const f of ['next.config.js', 'next.config.mjs', 'next.config.ts', 'vercel.json', 'tsconfig.json']) {
    const c = safeRead(path.join(repo, f));
    if (c) parts.push(`--- ${f} ---\n${c.slice(0, 800)}`);
  }
  // Files the log points at.
  const seen = new Set();
  for (const m of log.matchAll(/(?:\.\/|\/vercel\/path\d+\/)?((?:src|app|pages|components|lib)\/[\w./\[\]()-]+\.(?:tsx?|jsx?|mjs))/g)) {
    const rel = m[1]; if (seen.has(rel) || seen.size >= 2) continue; seen.add(rel);
    const c = safeRead(path.join(repo, rel));
    if (c) parts.push(`--- ${rel} ---\n${c.slice(0, 1500)}`);
  }
  return redact(parts.join('\n\n'));
}
function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
