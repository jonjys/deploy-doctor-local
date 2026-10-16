// Deterministic first pass. Cheap, instant, and it gives the small model
// facts to reason about instead of guesses.
import fs from 'node:fs';
import path from 'node:path';

export const RULES = [
  {
    id: 'module-not-found',
    re: /Module not found: (?:Error: )?Can't resolve '([^']+)'(?:[\s\S]{0,200}?in '([^']+)')?/,
    title: 'Import cannot be resolved',
    check(m, repo) {
      const spec = m[1];
      const facts = [`import specifier: ${spec}`];
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        const hit = findCaseMismatch(repo, spec, m[2]);
        if (hit) {
          facts.push(`CASE MISMATCH on disk: code imports "${hit.wanted}" but the file is "${hit.actual}". macOS and Windows ignore case, Vercel's Linux builders do not.`);
          const target = hit.actual.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
          facts.push(`VERIFIED FIX: change the import to '${spec.startsWith('@/') ? '@/' : ''}${target}', or rename with: git mv ${hit.actual} tmp && git mv tmp ${hit.actual.replace(/[^/]+$/, (f) => hit.wanted.split('/').pop() + f.slice(f.lastIndexOf('.')))}`);
        }
      } else {
        const pkg = readJson(path.join(repo, 'package.json')) || {};
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        facts.push(deps[name] ? `${name} is listed in package.json (${deps[name]})` : `${name} is NOT listed in package.json`);
      }
      return facts;
    },
  },
  { id: 'missing-suspense', re: /useSearchParams\(\) should be wrapped in a suspense boundary at page "([^"]+)"/, title: 'useSearchParams needs a Suspense boundary', check: (m) => [`page: ${m[1]}`, 'App Router. Do not suggest getServerSideProps or getStaticProps.', 'VERIFIED FIX: move the code that calls useSearchParams into its own client component and render it inside <Suspense fallback={...}> from the page.'] },
  { id: 'type-error', re: /Type error: ([^\n]+)/, title: 'TypeScript error fails the production build', check: (m) => [`message: ${m[1]}`] },
  { id: 'env-missing', re: /(?:process\.env\.)?([A-Z][A-Z0-9_]{2,}) (?:is not defined|is missing|is required)|Missing (?:required )?environment variable:? ?([A-Z][A-Z0-9_]+)/, title: 'Environment variable missing at build time', check: (m) => [`variable: ${m[1] || m[2]}`, 'Local .env files are not uploaded to Vercel. Add it in Project Settings > Environment Variables for the right environment.'] },
  { id: 'node-version', re: /(?:engine "node" is incompatible|Unsupported engine|requires Node(?:\.js)? (?:version )?[>=^~]*\s*\d+)/i, title: 'Node.js version mismatch', check: () => ['Check "engines.node" in package.json and the Node version in Vercel Project Settings.'] },
  { id: 'eslint', re: /Failed to compile[\s\S]{0,400}?(?:Error: [^\n]*eslint|\d+:\d+\s+Error:)/i, title: 'ESLint errors fail the build', check: () => [] },
  { id: 'oom', re: /JavaScript heap out of memory|SIGKILL|exited with 137/, title: 'Build ran out of memory', check: () => [] },
  { id: 'lockfile', re: /(?:ERR_PNPM_OUTDATED_LOCKFILE|npm ci` can only install packages when your package\.json and package-lock\.json|lockfile needs to be updated)/, title: 'Lockfile out of sync with package.json', check: () => [] },
];

export function runRules(log, repo) {
  const out = [];
  for (const r of RULES) {
    const m = log.match(r.re);
    if (m) out.push({ id: r.id, title: r.title, facts: r.check(m, repo) });
  }
  return out;
}

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

export function findCaseMismatch(repo, spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = repo;
  else if (fromFile) base = path.isAbsolute(fromFile) ? mapToRepo(repo, fromFile) : path.join(repo, fromFile);
  else base = repo;
  const rel = spec.startsWith('@/') ? spec.slice(2) : spec;
  const parts = path.normalize(path.join(path.relative(repo, base) || '.', rel)).split(path.sep).filter(Boolean);
  let dir = repo, actualParts = [], mismatch = false;
  for (let i = 0; i < parts.length; i++) {
    const want = parts[i];
    if (want === '.') continue;
    if (want === '..') { dir = path.dirname(dir); actualParts.push('..'); continue; }
    let entries; try { entries = fs.readdirSync(dir); } catch { return null; }
    const last = i === parts.length - 1;
    const match = entries.find((e) => e === want || (last && stripExt(e) === want))
      || entries.find((e) => e.toLowerCase() === want.toLowerCase() || (last && stripExt(e).toLowerCase() === want.toLowerCase()));
    if (!match) return null;
    const name = last ? (stripExt(match) === stripExt(want) || match === want ? match : match) : match;
    if (!(match === want || stripExt(match) === want)) mismatch = true;
    actualParts.push(name); dir = path.join(dir, match);
  }
  return mismatch ? { wanted: rel, actual: actualParts.join('/') } : null;
}
function stripExt(f) { return f.replace(/\.(tsx?|jsx?|mjs|cjs)$/, ''); }
function mapToRepo(repo, abs) {
  // Vercel logs use /vercel/path0/...; map that back onto the local repo.
  const m = abs.match(/\/vercel\/path\d+\/(.*)$/);
  return m ? path.join(repo, m[1]) : abs;
}
