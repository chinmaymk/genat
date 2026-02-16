import { join } from 'path';
import { access, mkdir, stat } from 'fs/promises';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRoot(): Promise<string> {
  const envRoot = process.env.GENAT_ROOT;
  if (envRoot) {
    const resolved = join(process.cwd(), envRoot);
    if (await pathExists(resolved)) return resolved;
    return envRoot.startsWith('/') ? envRoot : join(process.cwd(), envRoot);
  }
  const execPath = process.execPath;
  const binDir = join(execPath, '..');
  const candidateRoot = join(binDir, '..');
  const defaultOrg = join(candidateRoot, 'default', 'org');
  if (await pathExists(defaultOrg)) {
    const st = await stat(defaultOrg);
    if (st.isDirectory()) return candidateRoot;
  }
  throw new Error(
    'GENAT_ROOT must be set or run from the installed genat binary (default/org must exist under root).'
  );
}

let _root: string | null = null;

async function getRoot(): Promise<string> {
  if (_root === null) {
    _root = await resolveRoot();
  }
  return _root;
}

export async function getPathConfig() {
  const root = await getRoot();
  return {
    root,
    defaultOrgDir: join(root, 'default', 'org'),
    agentOrgDir: join(root, 'agent', 'org'),
    userOrgDir: join(root, 'user', 'org'),
    agentDataDir: join(root, 'agent', 'data'),
    userDataDir: join(root, 'user', 'data'),
    defaultUiDir: join(root, 'default', 'ui'),
    agentUiDir: join(root, 'agent', 'ui'),
    userUiDir: join(root, 'user', 'ui'),
    logDir: process.env.LOG_DIR ?? join(root, 'log'),
  };
}

export type PathConfig = Awaited<ReturnType<typeof getPathConfig>>;

const WRITABLE_DIRS: (keyof PathConfig)[] = [
  'agentOrgDir',
  'agentDataDir',
  'agentUiDir',
  'userOrgDir',
  'userDataDir',
  'userUiDir',
  'logDir',
];

export async function ensureWritableDirs(paths: PathConfig): Promise<void> {
  for (const key of WRITABLE_DIRS) {
    const dir = paths[key];
    if (typeof dir === 'string') {
      try {
        await mkdir(dir, { recursive: true });
      } catch {
        // already exists or permission; continue
      }
    }
  }
}

export async function requireDefaultOrg(paths: PathConfig): Promise<void> {
  if (!(await pathExists(paths.defaultOrgDir))) {
    throw new Error(`default/org is required but missing at ${paths.defaultOrgDir}`);
  }
}
