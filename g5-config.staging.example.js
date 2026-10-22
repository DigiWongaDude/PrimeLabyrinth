// Reference only. `npm run build:pages-preview` generates the preview config
// from an allowlist; do not copy this file into the repository root manually.
// Never use it for the G1–G4 production bundle and never put credentials here.
export const G5_API_URL = 'https://between-g5-staging-api.digiwongadude.workers.dev';

// Candidate Cloudflare Pages branch-preview hostname. UNCONFIRMED: it becomes
// real only if Paul/Sara create project `between-g5-preview` and deploy branch
// `codex/g5-persistence`. app.js uses G5_API_URL above; this is documentation.
export const G5_FRONTEND_ORIGIN = 'https://codex-g5-persistence.between-g5-preview.pages.dev';
