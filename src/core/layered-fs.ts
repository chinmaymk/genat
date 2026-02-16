import { readFile, readdir, mkdir, writeFile, stat } from 'fs/promises';
import { join } from 'path';

export interface LayeredFsConfig {
  defaultDir: string;
  agentDir: string;
  userDir: string;
}

function rejectPathEscape(relativePath: string): void {
  if (relativePath.includes('..') || relativePath.startsWith('/') || relativePath.includes('\\')) {
    throw new Error(`Invalid path: ${relativePath}`);
  }
}

export function createLayeredFs(config: LayeredFsConfig) {
  const dirs = [config.userDir, config.agentDir, config.defaultDir] as const;

  async function resolve(relativePath: string): Promise<string | null> {
    rejectPathEscape(relativePath);
    for (const dir of dirs) {
      const candidate = join(dir, relativePath);
      try {
        const st = await stat(candidate);
        if (st.isFile()) return candidate;
      } catch {
        // not found or not accessible — try next dir
      }
    }
    return null;
  }

  async function readFileContent(relativePath: string): Promise<string | null> {
    const resolved = await resolve(relativePath);
    if (!resolved) return null;
    try {
      return await readFile(resolved, 'utf-8');
    } catch {
      return null;
    }
  }

  async function readFileBinary(relativePath: string): Promise<ArrayBuffer | null> {
    const resolved = await resolve(relativePath);
    if (!resolved) return null;
    try {
      const buf = await readFile(resolved);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch {
      return null;
    }
  }

  interface ListDirOptions {
    listFiles?: boolean;
    stripExtension?: string;
  }

  async function listDir(relativeDir: string, options: ListDirOptions = {}): Promise<string[]> {
    const { listFiles = true, stripExtension } = options;
    const seen = new Map<string, number>();
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      const fullDir = join(dir, relativeDir);
      try {
        const st = await stat(fullDir);
        if (!st.isDirectory()) continue;
      } catch {
        continue;
      }
      try {
        const entries = await readdir(fullDir, { withFileTypes: true });
        for (const e of entries) {
          const isFile = e.isFile();
          const isDir = e.isDirectory();
          if (listFiles && !isFile) continue;
          if (!listFiles && !isDir) continue;
          let name = e.name;
          if (stripExtension && name.endsWith(stripExtension)) {
            name = name.slice(0, -stripExtension.length);
          }
          if (!seen.has(name)) seen.set(name, i);
        }
      } catch {
        // skip
      }
    }
    return Array.from(seen.keys()).sort();
  }

  async function writeToAgent(relativePath: string, content: string): Promise<void> {
    rejectPathEscape(relativePath);
    const fullPath = join(config.agentDir, relativePath);
    const dir = join(fullPath, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  return {
    resolve,
    readFile: readFileContent,
    readFileBinary,
    listDir,
    writeToAgent,
  };
}

export type LayeredFs = ReturnType<typeof createLayeredFs>;
