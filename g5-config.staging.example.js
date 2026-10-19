// Copy this file to g5-config.js only in an isolated frontend preview build.
// Never use it for the G1–G4 production bundle and never put credentials here.
export const G5_API_URL = 'https://between-g5-staging-api.digiwongadude.workers.dev';

// Candidate Cloudflare Pages hostname for OAuth/hosting checks. UNCONFIRMED:
// it becomes real only if Paul/Sara provision a Pages project with this exact
// name. app.js uses G5_API_URL above; this value is documentation only.
export const G5_FRONTEND_ORIGIN = 'https://between-g5-preview.pages.dev';
