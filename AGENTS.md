# Repository instructions

- Maintain `PROMPTS.md` as an append-only chronological record of user development prompts and corrections. Copy new prompts verbatim; do not reconstruct or embellish them.
- Keep runtime model instructions in `src/agent/system-prompt.ts`, separate from development prompt history.
- Never commit credentials, `.dev.vars`, `.wrangler/`, or generated build output.
- Do not add command-execution or infrastructure-mutation capabilities without an explicit product-scope change.
