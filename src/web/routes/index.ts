import { Hono } from 'hono';
import { createDirectivesRoutes } from './directives';
import { createChannelsRoutes } from './channels';
import { createOrgRoutes } from './org';
import type { ChannelManager } from '../../core/channel';
import type { Org } from '../../core/org';

export interface RouteContext {
  channels: ChannelManager;
  org: Org;
}

export function createRoutes(ctx: RouteContext) {
  const api = new Hono();
  api.route('/directives', createDirectivesRoutes(ctx.channels));
  api.route('/channels', createChannelsRoutes(ctx.channels));
  api.route('/org', createOrgRoutes(ctx.org));
  return api;
}
