import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Claim Rejections demo (fictional practice, payers and patients) in ${rt.root}\n`);
  const f = { acks: ['ack-999.x12', 'ack-277ca.x12'], claims: 'batch-2026-01-20.837' };
  const r = await rt.call('rejects_rejections', f);
  printStep('Read a 999 and a 277CA against the 837 sent', r);
  for (const i of r.result.items) process.stdout.write(`    ${i.source.padEnd(6)} ${String(i.claim_id).padEnd(6)} ${String(i.scope).padEnd(17)} ${i.message}\n`);
  printStep('Explain claim V1007', await rt.call('rejects_explain', { ...f, claim_id: 'V1007' }));
  printStep('Write the work list (Korean page)', await rt.call('rejects_write_report', { ...f, language: 'ko' }));
  const l = await rt.call('rejects_learn', { kind: 'rejection_fix', value: { status_code: '562', entity: '82', payer: 'Example Health Plan', fix: 'Rendering NPI must be enrolled with the plan; bill under the group NPI until enrolment is done' } });
  printStep('Remember a fix that worked', l);
  printStep('Agent tries to resend a claim itself', await rt.call('claim_resubmit', {}));
}
