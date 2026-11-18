import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Provider Credentialing demo (fictional providers and payers) in ${rt.root}\n`);
  const f = { roster: 'provider-roster.csv', enrollments: 'payer-enrollments.csv', config: 'credentialing-config.json', as_of: '2026-02-15' };
  const r = await rt.call('credentialing_tasks', f);
  printStep('Credentialing and enrollment tasks', r);
  for (const t of r.result.items.filter((x) => x.status !== 'ok')) process.stdout.write(`    ${t.status.padEnd(18)} ${t.provider.padEnd(28)} ${t.payer ? `${t.payer}: ` : ''}${t.message}\n`);
  printStep('Write the work list and the due-date calendar', await rt.call('credentialing_write_report', f));
  printStep('Agent tries to submit an enrollment', await rt.call('enrollment_submit', {}));
}
