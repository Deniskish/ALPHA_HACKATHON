// HTTP entry point. Configuration is loaded before provider selection; imports have no network side effects.
import { config } from 'dotenv';
import path from 'node:path';
import { createApp } from './app';
import { SourceStore, startSourceMonitor } from './ai/sources';
import { LiveCatalog } from './funding-catalog/live';
import { OfficialWebCatalog } from './funding-catalog/web-catalog';
import { createGigaChatClient } from './gigachat';
config({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
config({ quiet: true });
config({ path: path.resolve(__dirname, __dirname.endsWith('dist') ? '../../../.env.dadata' : '../../.env.dadata'), quiet: true });
const port = Number(process.env.PORT || 3002);
const sources = new SourceStore();
const dataDirectory = process.env.OPORA_FUNDING_DIR || path.resolve(process.cwd(), 'source-data/funding');
const catalog = new LiveCatalog(dataDirectory);
let giga: ReturnType<typeof createGigaChatClient> | null = null;
try { if (process.env.GIGACHAT_AUTH_KEY) giga = createGigaChatClient({ authKey: process.env.GIGACHAT_AUTH_KEY,
  scope: process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS', model: process.env.GIGACHAT_MODEL || 'GigaChat-2-Pro' }); } catch { console.error('AI configuration is invalid'); }
const webCatalog = new OfficialWebCatalog(path.join(dataDirectory, 'official-web'), giga?.extractOpportunity);
catalog.attachWeb(webCatalog);
createApp({ sources, catalog, giga }).listen(port, '0.0.0.0', () => {
  console.log(`Opora API: http://localhost:${port}/api/health`);
  if (process.env.AI_SOURCE_SYNC !== 'off') startSourceMonitor(sources);
  if (process.env.FUNDING_SYNC !== 'off') {
    webCatalog.start();
    const sync = () => void catalog.sync().catch(() => console.error('Funding catalogue sync failed'));
    setTimeout(sync, 3000).unref(); setInterval(sync, 15 * 60000).unref();
  }
});
