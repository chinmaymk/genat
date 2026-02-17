import { Hono } from 'hono';
import { createRoutes } from './routes';
import type { RouteContext } from './routes';
import { logger } from '../logger';
import type { LayeredFs } from '../core/layered-fs';
import { getIndexHtml } from './index-html';

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function contentTypeFor(filename: string): string {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

function rejectPathEscape(path: string): boolean {
  return path.includes('..') || path.includes('/') || path.includes('\\');
}

export function createServer(port = 3000, ctx: RouteContext, uiLayeredFs: LayeredFs) {
  const app = new Hono();
  logger.info({ port }, 'Web server created');

  app.route('/api', createRoutes(ctx));

  app.get('/assets/:filename', async (c) => {
    const filename = c.req.param('filename');
    if (rejectPathEscape(filename)) {
      return c.json({ error: 'Invalid path' }, 400);
    }
    const buf = await uiLayeredFs.readFileBinary(filename);
    if (buf === null) {
      return c.notFound();
    }
    return new Response(buf, {
      headers: { 'Content-Type': contentTypeFor(filename) },
    });
  });

  app.get('*', async (c) => {
    const indexContent = await uiLayeredFs.readFile('index.html');
    if (indexContent !== null) {
      return c.html(indexContent);
    }
    return c.html(getIndexHtml());
  });

  return { app, port };
}
