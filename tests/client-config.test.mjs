import test from 'node:test';
import assert from 'node:assert/strict';
import {clientConfigModule, createClientConfig} from '../client-config.js';

test('client configuration is tenant-isolated, immutable and public-only', () => {
  const config = createClientConfig({
    tenantId:'alpha-client', domain:'Example.Client', apiOrigin:'https://api.example.test/', frontendOrigin:'https://app.example.test',
    branding:{productName:'Alpha'}, mail:{sender:'noreply@example.test'},
    bindings:{api:'alpha-api',emailAck:'EMAIL_ACK'}, flags:{accounts:true}
  });
  assert.equal(config.apiOrigin,'https://api.example.test');
  assert.equal(config.domain,'example.client');
  assert.equal(config.mail.sender,'noreply@example.test');
  assert.equal(config.flags.accounts,true);
  assert.equal(config.flags.registration,false);
  assert.ok(Object.isFrozen(config));
  assert.throws(()=>{config.tenantId='other';}, /Cannot assign|read only|frozen/i);
  const other = createClientConfig({tenantId:'beta-client',apiOrigin:'https://beta.example.test'});
  assert.notEqual(config.tenantId,other.tenantId);
  assert.equal(other.mail.sender,'');
});

test('client configuration rejects unsafe origins and mailbox values', () => {
  assert.throws(()=>createClientConfig({tenantId:'client',apiOrigin:'https://api.example.test/path'}),/api_origin_must_be_origin/);
  assert.throws(()=>createClientConfig({tenantId:'client',frontendOrigin:'javascript:alert(1)'}),/frontend_origin_must_be_origin/);
  assert.throws(()=>createClientConfig({tenantId:'client',mail:{sender:'not-an-email'}}),/mail_sender_must_be_email/);
  assert.throws(()=>createClientConfig({tenantId:'Client'}),/tenant_id_invalid/);
  assert.throws(()=>createClientConfig({tenantId:'client',domain:'https://example.test'}),/domain_invalid/);
});

test('generated preview config has no secret-shaped fields and preserves flags', () => {
  const module = clientConfigModule(createClientConfig({tenantId:'preview',apiOrigin:'https://api.example.test',flags:{accounts:false}}));
  assert.match(module,/CLIENT_CONFIG/);
  assert.ok(module.includes('https://api.example.test'));
  assert.doesNotMatch(module,/password|secret|token|privateKey|client_secret/i);
  assert.match(module,/"accounts": false/);
});
