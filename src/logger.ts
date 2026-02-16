import pino from 'pino';
import type { DestinationStream } from 'pino';
import pretty from 'pino-pretty';
import { createStream as createRotatingStream } from 'rotating-file-stream';
import { join } from 'path';
import { mkdir } from 'fs/promises';

let _logDir: string | null = null;
let _logger: pino.Logger | null = null;

const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info') as pino.Level;

export async function initLogger(logDir: string): Promise<void> {
  _logDir = logDir;
  await mkdir(logDir, { recursive: true });
}

function getLogDir(): string {
  return _logDir ?? process.env.LOG_DIR ?? join(process.cwd(), 'logs');
}

function createFileStream(): DestinationStream {
  const dir = getLogDir();
  const stream = createRotatingStream('genat.log', {
    path: dir,
    size: '10M',
    interval: '1d',
    maxFiles: 7,
    compress: 'gzip',
  });
  return stream as unknown as DestinationStream;
}

function createLogger(): pino.Logger {
  const usePretty = process.env.LOG_PRETTY === '1' || process.env.NODE_ENV === 'development';

  const streams: pino.StreamEntry[] = [
    {
      level: LOG_LEVEL,
      stream: usePretty
        ? (pretty({
            colorize: true,
            translateTime: 'SYS:standard',
            destination: 1,
          }) as unknown as DestinationStream)
        : (pino.destination({
            dest: 1,
            minLength: 4096,
            sync: false,
          }) as unknown as DestinationStream),
    },
    {
      level: LOG_LEVEL,
      stream: createFileStream(),
    },
  ];

  const multi = pino.multistream(streams);
  return pino(
    {
      level: LOG_LEVEL,
      base: {
        pid: process.pid,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    multi
  );
}

function getLogger(): pino.Logger {
  if (!_logger) {
    _logger = createLogger();
  }
  return _logger;
}

export const logger = new Proxy({} as pino.Logger, {
  get(_, prop) {
    return (getLogger() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/** Create a child logger with bound context (e.g. agentId, channel). */
export function child(bindings: Record<string, string | undefined>): pino.Logger {
  return getLogger().child(bindings);
}
