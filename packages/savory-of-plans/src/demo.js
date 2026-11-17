import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'remedy-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Savory of Plans demo (fictional practice and guarantors) in ${rt.root}\n`);
  const f = { plans: 'payment-plans.csv', payments: 'plan-payments.csv', config: 'plan-config.json', as_of: '2026-02-20' };
  const r = await rt.call('savory_review', f);
  printStep('Review payment plans', r);
  for (const i of r.result.items) process.stdout.write(`    ${i.status.padEnd(15)} ${i.plan_id}  ${i.message}${i.policy.length ? ` Policy: ${i.policy.join(' ')}` : ''}\n`);
  printStep('Options for a new 1,250 balance', await rt.call('savory_options', { balance: 1250, config: f.config }));
  rt.mode = 'auto'; rt.autoActions.add('savory_draft_plan_agreement');
  printStep('Draft a 12-month agreement', await rt.call('savory_draft_plan_agreement', { balance: 1250, months: 12, first_due: '2026-03-01', config: f.config, reference: 'demo-1250' }));
  printStep('Agent tries to charge a card', await rt.call('card_charge', {}));
}
