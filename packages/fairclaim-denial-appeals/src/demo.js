import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Denial Appeals demo (fictional practice, payers, policies and patients) in ${rt.root}\n`);
  const f = { remits: 'era-2026-02-12.835', config: 'appeal-config.json', policies: ['policies/smi-joint-injections.md', 'policies/tmc-ecg-coverage.txt'] };
  const s = await rt.call('appeals_policy_search', { ...f, claim_id: 'R1002', as_of: '2026-02-15' });
  printStep('Find the policy lines for a bundled injection', s);
  for (const c of s.result.citations) process.stdout.write(`    ${c.flagged ? 'FLAGGED' : `score ${c.score}`}  ${c.file}:${c.line}  ${c.text}\n`);
  rt.mode = 'auto'; rt.autoActions.add('appeals_draft_appeal');
  const d = await rt.call('appeals_draft_appeal', { ...f, claim_id: 'R1002' });
  printStep('Draft the appeal (markers left for what only a person knows)', d);
  printStep('Approving it while markers are open is refused', await rt.call('appeals_request_send', { draft: d.result.draft, draft_sha256: d.result.draft_sha256 }));
  printStep('Track open appeals', await rt.call('appeals_track', { appeals: 'appeal-log.csv', config: f.config, as_of: '2026-02-15' }));
  printStep('Write the tracker (German page)', await rt.call('appeals_write_report', { appeals: 'appeal-log.csv', config: f.config, as_of: '2026-02-15', language: 'de' }));
  printStep('Agent tries to file the appeal itself', await rt.call('appeal_submit', {}));
}
