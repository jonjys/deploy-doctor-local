# deploy-doctor-local

Your Vercel build failed. You do not want to paste a private repo into a cloud chatbot. This CLI reads the build log and the relevant files in your repo, then asks an open-weight code model running in Ollama **on your own machine** what went wrong and how to fix it.

Nothing leaves your laptop. The client refuses to talk to any model host that is not localhost.

## Install

```sh
# 1. Ollama + an open-weight coder model (about 2 GB)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:3b

# 2. The CLI (Node 18+, zero dependencies)
git clone https://github.com/jonjys/deploy-doctor-local
cd deploy-doctor-local && npm link
```

## Use

```sh
cd my-next-app
npx vercel build 2>&1 | ddl --repo .
# or
ddl --log build.log --repo . [--model qwen2.5-coder:1.5b] [--rules-only] [--show-prompt]
```

`--show-prompt` prints exactly what the model sees, so you can audit it.

## How it works

1. **Static checks first.** Regex rules catch common Next.js and Vercel failures (case-sensitive imports, missing Suspense around `useSearchParams`, missing env vars, Node version, lockfile drift, out of memory). For imports it walks your file tree and confirms a case mismatch on disk.
2. **Facts, not guesses.** Rule hits become a FACTS block, including a VERIFIED FIX when the fix is mechanical. Small models do much better when you hand them facts.
3. **Trimmed, redacted context.** Only the error block of the log, `package.json`, Next/Vercel config and the files the log points at. Stripe keys, GitHub tokens, AWS keys, JWTs and `*_SECRET=` style values are redacted before the prompt is built.
4. **Local inference.** One call to `http://127.0.0.1:11434/api/generate`. Swap the model with `--model`.

## Real demo output

Both example apps in `examples/` were built with `next build` (Next.js 15.5.4) on Linux and failed for real. The logs are unedited apart from replacing one absolute path. Full outputs for both models are in `examples/*.out.txt`.

```text
== deploy-doctor-local ==
model: qwen2.5-coder:3b via http://127.0.0.1:11434 (local only)

Known patterns:
  * Import cannot be resolved
      - import specifier: @/app/components/Header
      - CASE MISMATCH on disk: code imports "app/components/Header" but the file is "app/components/header.js". macOS and Windows ignore case, Vercel's Linux builders do not.
      - VERIFIED FIX: change the import to '@/app/components/header', or rename with: git mv app/components/header.js tmp && git mv tmp app/components/Header.js

Diagnosis:
CAUSE: The import specifier in `app/page.js` is incorrect due to a case mismatch between the import and the file name on disk.

FIX:
1. Change the import specifier in `app/page.js` from `import Header from '@/app/components/Header';` to `import Header from '@/app/components/header';`.
2. Alternatively, rename the file `app/components/header.js` to `app/components/Header.js` ...

(400 prompt tokens, 125 output tokens, 12.5s on this machine, 0 bytes sent off it)
```

Applying fix 1 made `next build` pass.

Measured on an 8 vCPU cloud VM with no GPU: 5 to 7 s per diagnosis with the 1.5B model, 12 to 22 s with the 3B model.

## Known limits

- The 3B model's Suspense code snippet had bugs (missing `'use client'` and a missing `Suspense` import). The cause and steps were right; the snippet was not. Treat generated code as a draft.
- The 1.5B model is fast but sometimes repeats parts of the prompt and once suggested the wrong rename direction before the VERIFIED FIX facts were added.
- Rules cover the failures I see most. Unknown failures go to the model alone and quality drops.

## Tests

```sh
npm test
```

## Related

[DeployDoctor](https://deploydoctor.nyttolabs.com) is the hosted version for public repos. This CLI is the private-code path: same idea, your hardware, your model.

MIT licensed.
