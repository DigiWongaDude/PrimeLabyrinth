import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: { bindings: {
      REGISTRATION_ENABLED: 'true',
      TEST_MIGRATIONS: await readD1Migrations('./backend/migrations'),
      // Review-only schema: never added to Wrangler's deployable migrations yet.
      TEST_INVITATION_MIGRATIONS: await readD1Migrations('./backend/invitation-candidate')
    } }
  }))],
  test: { include: ['backend/*.test.ts'], testTimeout: 20000 }
});
