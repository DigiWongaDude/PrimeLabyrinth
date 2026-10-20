import {createClientConfig} from './client-config.js';

// Project-specific public defaults. Empty API origin keeps G5 disabled in the
// repository bundle; preview builds generate their own isolated config.
export const G5_CLIENT_CONFIG = createClientConfig({tenantId:'between-g5',domain:'digiwongadude.com'});
export const G5_API_URL = G5_CLIENT_CONFIG.apiOrigin;
