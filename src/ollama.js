export function assertLocal(host) {
  const u = new URL(host);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname) && !process.env.DDL_ALLOW_REMOTE) {
    throw new Error(`Refusing to send code to ${u.hostname}. deploy-doctor-local only talks to a model on this machine. Set DDL_ALLOW_REMOTE=1 if ${u.hostname} is a box you control.`);
  }
}
export async function ask({ host, model, system, prompt }) {
  assertLocal(host);
  const t0 = Date.now();
  const res = await fetch(new URL('/api/generate', host), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, system, prompt, stream: false, options: { temperature: 0.1, num_ctx: 8192 } }),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return { text: j.response.trim(), ms: Date.now() - t0, evalTokens: j.eval_count, promptTokens: j.prompt_eval_count };
}
