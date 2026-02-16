import { join } from 'path';
import { getPathConfig, ensureWritableDirs, requireDefaultOrg } from './config/paths';
import { initLogger } from './logger';
import { createLayeredFs } from './core/layered-fs';
import { createOrgStore } from './core/org-store';
import { createLayeredMemoryStore, createLayeredTaskManager } from './core/layered-data';
import { setTaskManager } from './core/task-manager';
import { setMemoryStore } from './memory/store';
import { knowledgeBase } from './memory/knowledge-base';
import { orgManager } from './core/org';
import { createServer } from './web/server';
import { logger } from './logger';

async function main() {
  const paths = await getPathConfig();
  await ensureWritableDirs(paths);
  await requireDefaultOrg(paths);
  await initLogger(paths.logDir);

  logger.info('genat starting up');

  const orgLayeredFs = createLayeredFs({
    defaultDir: paths.defaultOrgDir,
    agentDir: paths.agentOrgDir,
    userDir: paths.userOrgDir,
  });
  const uiLayeredFs = createLayeredFs({
    defaultDir: paths.defaultUiDir,
    agentDir: paths.agentUiDir,
    userDir: paths.userUiDir,
  });

  const orgStore = createOrgStore(orgLayeredFs, () => {
    void orgManager.reloadOrg();
  });
  orgManager.setOrgStore(orgStore);

  const layeredMemoryStore = createLayeredMemoryStore(
    join(paths.userDataDir, 'memory.sqlite'),
    join(paths.agentDataDir, 'memory.sqlite')
  );
  const layeredTaskManager = createLayeredTaskManager(
    join(paths.userDataDir, 'tasks.sqlite'),
    join(paths.agentDataDir, 'tasks.sqlite')
  );
  layeredMemoryStore.init();
  layeredTaskManager.init();
  setMemoryStore(layeredMemoryStore);
  setTaskManager(layeredTaskManager);

  logger.info({ phase: 'init' }, 'Databases initialized');

  logger.info({ phase: 'knowledge' }, 'Loading knowledge base');
  knowledgeBase.setOrgStore(orgStore);
  await knowledgeBase.load();
  logger.info({ phase: 'knowledge' }, 'Knowledge base loaded');

  logger.info({ phase: 'org' }, 'Loading organization');
  await orgManager.loadOrg();
  await orgManager.setupChannelsAndQueues();
  logger.info({ phase: 'org' }, 'Channels and queues set up');

  logger.info({ phase: 'boot' }, 'Booting agents');
  await orgManager.boot();
  logger.info({ phase: 'boot', agentCount: orgManager.agents.size }, 'Agents booted');

  const { app, port } = createServer(3000, uiLayeredFs);
  Bun.serve({
    port,
    fetch: app.fetch,
  });

  logger.info(
    {
      port,
      agentCount: orgManager.agents.size,
    },
    'genat is running'
  );
}

main().catch((err) => {
  logger.fatal({ err }, 'Startup failed');
  process.exit(1);
});
