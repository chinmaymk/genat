import { getPathConfig, ensureWritableDirs, requireDefaultOrg } from './config/paths';
import { initLogger } from './logger';
import { logger } from './logger';
import { createLayeredFs } from './core/layered-fs';
import { OrgStore } from './core/org-store';
import { OrgLoader } from './core/org-loader';
import { ChannelManager } from './core/channel';
import { LLMClient } from './core/llm-client';
import { MessageRouter } from './core/message-router';
import { Org } from './core/org';
import { createServer } from './web/server';

async function main() {
  const paths = await getPathConfig();
  await ensureWritableDirs(paths);
  await requireDefaultOrg(paths);
  await initLogger(paths.logDir);

  logger.info('genat starting up');

  const orgFs = createLayeredFs({
    defaultDir: paths.defaultOrgDir,
    agentDir: paths.agentOrgDir,
    userDir: paths.userOrgDir,
  });
  const uiFs = createLayeredFs({
    defaultDir: paths.defaultUiDir,
    agentDir: paths.agentUiDir,
    userDir: paths.userUiDir,
  });

  const channels = new ChannelManager();
  const llm = new LLMClient();

  // store callback references org.reload() — use let + closure so org can be assigned after
  let org: Org;
  const store = new OrgStore(orgFs, () => { void org?.reload(); });
  const loader = new OrgLoader(store);
  org = new Org(loader, channels, llm);

  const router = new MessageRouter(org, channels);
  channels.setRouter((msg, ids) => router.select(msg, ids));

  logger.info({ phase: 'boot' }, 'Booting agents');
  await org.boot();
  logger.info({ phase: 'boot', agentCount: org.getAgents().size }, 'Agents booted');

  const { app, port } = createServer(3000, { channels, org }, uiFs);
  Bun.serve({ port, fetch: app.fetch });

  logger.info({ port, agentCount: org.getAgents().size }, 'genat is running');
}

main().catch((err) => {
  logger.fatal({ err }, 'Startup failed');
  process.exit(1);
});
