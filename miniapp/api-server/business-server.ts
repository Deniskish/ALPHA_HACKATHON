// HTTP entry point. Configuration is loaded before provider selection; imports have no network side effects.
import { config } from 'dotenv';
import path from 'node:path';
import { createApp } from './app';
config({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
config({ quiet: true });
config({ path: path.resolve(__dirname, __dirname.endsWith('dist') ? '../../../.env.dadata' : '../../.env.dadata'), quiet: true });
const port = Number(process.env.PORT || 3002);
// Canonical application state; synthetic demo data is seeded on every start.
const creditDb = process.env.CREDIT_DB_PATH || path.resolve(process.cwd(), 'data/credit.sqlite');
createApp({ creditDb }).listen(port, '0.0.0.0', () => {
  console.log(`Credit cabinet API: http://localhost:${port}/api/health`);
});
