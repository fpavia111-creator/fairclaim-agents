import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'remedy-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Cumin of DME demo (fictional supplier and patients) in ${rt.root}\n`);
  const f = { claims: 'dme-claims-2026-02.csv', history: 'rental-history.csv', config: 'dme-config.json', as_of: '2026-02-15' };
  const r = await rt.call('cumin_check', f);
  printStep('Check February DME claims', r);
  for (const i of r.result.items.filter((x) => x.status !== 'ok')) process.stdout.write(`    ${i.status.padEnd(8)} ${i.claim_id} ${i.code}${i.modifiers ? `-${i.modifiers.replace(/ /g, '-')}` : ''}${i.rental_month ? ` month ${i.rental_month}` : ''}  ${i.issues.map((x) => x.message).join(' ')}\n`);
  const t = await rt.call('cumin_rentals', f);
  printStep('Rentals and next month', t);
  for (const x of t.result.items) process.stdout.write(`    ${x.status.padEnd(19)} ${x.code} ${String(x.months_billed).padStart(2)} month(s)${x.next_date ? `  next ${x.next_date} ${x.next_modifiers}` : ''}\n`);
  printStep('Write the list', await rt.call('cumin_write_report', f));
  printStep('Agent tries to sign an order', await rt.call('order_sign', {}));
}
