// Build an isolated static Pages preview. The allowlist is intentional: never
// point Pages at the repository root, which contains Worker source and notes.
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { clientConfigModule, createClientConfig } from '../client-config.js';

export const STAGING_API = 'https://between-g5-staging-api.digiwongadude.workers.dev';
export const STAGING_CLIENT_CONFIG = createClientConfig({
  tenantId: 'between-g5',
  domain: 'digiwongadude.com',
  apiOrigin: STAGING_API,
  frontendOrigin: 'https://between-g5-preview.pages.dev',
  branding: {productName: 'THE BETWEEN', title: 'THE BETWEEN / THRESHOLDS', edition: 'G5'},
  mail: {sender: 'invitations@digiwongadude.com', reviewRecipient: 'invitations@digiwongadude.com'},
  bindings: {api: 'between-g5-staging-api', emailAck: 'EMAIL_ACK', emailReview: 'EMAIL_REVIEW'},
  flags: {accounts: false, registration: false, invitationRequests: false}
});
export const PREVIEW_FILES = [
  'index.html', 'style.css', 'app.js', 'engine.js', 'view.js',
  'journey-client.js', 'account-client.js', 'invitation-request.html',
  'invitation-request.js', 'invitation-request-config.js'
];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function buildPagesPreview(outputDir = join(repoRoot, 'dist')) {
  const output = resolve(outputDir);
  if (output === repoRoot) throw new Error('Pages output must be an isolated directory');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const file of PREVIEW_FILES) await copyFile(join(repoRoot, file), join(output, file));
  await writeFile(join(output, 'g5-config.js'), clientConfigModule(STAGING_CLIENT_CONFIG), 'utf8');
  return { output, files: [...PREVIEW_FILES, 'g5-config.js'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await buildPagesPreview();
  console.log(`Pages preview built at ${result.output} (${result.files.length} allowlisted files).`);
}
