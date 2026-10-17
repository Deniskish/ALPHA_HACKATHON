// Real source checks after deployment. Read-only: never changes user data.
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
if (!process.env.OPORA_FUNDING_CHECK_CHILD) {
  const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
  const api = processes.find(p => p.name === 'opora-api')?.pm2_env;
  if (!api) throw new Error('API_PROCESS_NOT_FOUND');
  const env = { ...process.env, OPORA_FUNDING_CHECK_CHILD: '1' };
  for (const key of ['NODE_EXTRA_CA_CERTS','NODE_OPTIONS']) {
    const value = api[key] ?? api.env?.[key];
    if (typeof value === 'string') env[key] = value;
  }
  const run = spawnSync(process.execPath, [__filename], { cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit', timeout: 150000 });
  process.exitCode = run.status ?? 1;
} else {
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
  const { BudgetSource, normalizeBudgetCard } = require('../dist/funding-catalog/live');
  (async () => {
    const status = await (await fetch('http://127.0.0.1:3002/api/funding/live-status', { signal: AbortSignal.timeout(10000) })).json();
    console.log('Funding monitor:', JSON.stringify({ imported: status.imported, checkedAt: status.checkedAt, error: status.error }));
    const source = new BudgetSource(), page = await source.page(1);
    const card = page.rows.find(r => r.competitionType === 0 && normalizeBudgetCard(r).status === 'active');
    if (!card) throw new Error('FUNDING_ACTIVE_SOURCE_EMPTY');
    const opportunity = normalizeBudgetCard(card);
    opportunity.imported.detail = await source.details(opportunity.id);
    console.log('Funding source:', JSON.stringify({ totalAtSource: page.total, detailComplete: opportunity.imported.detail.complete, criteriaLength: opportunity.imported.detail.text.length }));
    if (!opportunity.imported.detail.complete) throw new Error('FUNDING_DETAILS_INCOMPLETE');
  })().catch(error => { console.error('Funding check failed:', error.name === 'TimeoutError' ? 'TIMEOUT' : String(error.message).replace(/Bearer\s+\S+/gi, 'Bearer [hidden]')); process.exitCode = 1; });
}
