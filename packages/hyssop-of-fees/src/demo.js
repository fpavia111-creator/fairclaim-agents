import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'remedy-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Hyssop of Fees demo (made-up RVUs and GPCIs, fictional fee schedule) in ${rt.root}\n`);
  const f = { fees: 'fee-schedule.csv', rvu: 'rvu-illustrative.csv', gpci: 'gpci-illustrative.csv', config: 'fee-config.json' };
  const r = await rt.call('hyssop_review', f);
  printStep('Price the fee schedule against Medicare', r);
  for (const i of r.result.items) process.stdout.write(`    ${i.status.padEnd(18)} ${i.code.padEnd(6)} fee ${String(i.fee ?? '-').padStart(7)}  Medicare ${String(i.medicare ?? '-').padStart(7)}  ${i.percent_of_medicare ?? '-'}%\n`);
  printStep('Show the arithmetic for one code', await rt.call('hyssop_price', { rvu: f.rvu, gpci: f.gpci, config: f.config, code: '99214' }));
  rt.mode = 'auto'; rt.autoActions.add('hyssop_draft_fee_update');
  const d = await rt.call('hyssop_draft_fee_update', { ...f, as_of: '2026-02-15' });
  printStep('Draft the fee update (checks left for a person)', d);
  printStep('Approving it while checks are open is refused', await rt.call('hyssop_request_go_live', { draft: d.result.draft, draft_sha256: d.result.draft_sha256 }));
  printStep('Agent tries to load fees into the practice system', await rt.call('fee_schedule_publish', {}));
}
