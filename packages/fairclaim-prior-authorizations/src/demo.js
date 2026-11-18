import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Prior Authorizations demo (fictional practice, payers and patients) in ${rt.root}\n`);
  const f = { services: 'services-2026-02.csv', auths: 'auth-log.csv', rules: 'auth-rules.json', responses: ['responses-278.x12'], as_of: '2026-02-10' };
  const c = await rt.call('authorizations_check', f);
  printStep('Check eleven service lines against the authorization log and 278s', c);
  for (const i of c.result.items) process.stdout.write(`    ${i.status.padEnd(17)} ${String(i.claim_id).padEnd(4)} ${i.code} ${String(i.auth_number || '-').padEnd(11)} ${i.message}\n`);
  printStep('List the authorizations', await rt.call('authorizations_authorizations', { auths: f.auths, responses: f.responses }));
  printStep('Write the coordinator\'s list (Chinese page)', await rt.call('authorizations_write_report', { ...f, language: 'zh' }));
  const l = await rt.call('authorizations_learn', { kind: 'payer_auth_rule', value: { payer: 'Test Medicare Contractor', codes: ['64483'], note: 'Epidural injections need prior authorization in this jurisdiction' } });
  printStep('Teach a payer rule from a denial', l);
  printStep('Agent tries to request an authorization itself', await rt.call('auth_request_submit', {}));
}
