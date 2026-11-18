import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Practice Go Live demo (fictional practice going live on 2026-03-02) in ${rt.root}\n`);
  const f = { setup: 'onboarding-setup.json', roster: 'provider-roster.csv', enrollments: 'payer-enrollments.csv', fees: 'fee-schedule.csv', charges: 'charges-last-month.csv', as_of: '2026-02-15' };
  const r = await rt.call('golive_check', f);
  printStep('Check go-live readiness', r);
  for (const i of r.result.items) process.stdout.write(`    ${i.severity.padEnd(8)} ${i.area.padEnd(11)} ${i.message}\n`);
  const m = await rt.call('golive_payers', f);
  printStep('Payer readiness matrix', m);
  for (const p of m.result.payers) process.stdout.write(`    ${p.payer.padEnd(26)} EDI ${p.edi.padEnd(8)} ERA ${p.era.padEnd(8)} EFT ${p.eft.padEnd(8)} credentialed ${p.providers_credentialed}/${p.providers_listed} ${p.ready ? 'ready' : 'not ready'}\n`);
  printStep('Write the go-live checklist', await rt.call('golive_write_plan', f));
  printStep('Agent tries to switch the practice live', await rt.call('go_live_switch', {}));
}
