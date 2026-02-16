import type { ChannelMessage } from './channel.ts';
import type { RoleConfig } from './agent.ts'; // type-only to avoid cycle

/**
 * Should this agent handle this message? Driven by role config (org data).
 *
 * Uses: getExclusiveChannelRole (channel owned by another role → not relevant),
 * role.handles_sources, role.handles_channels, role.reportsTo,
 * role.receives_from_direct_reports, and content mention.
 */
export function isRelevant(
  msg: ChannelMessage,
  agentId: string,
  role: RoleConfig,
  getDirectReports: (managerId: string) => { id: string }[],
  getExclusiveChannelRole?: (channel: string) => string | undefined
): boolean {
  if (msg.from === agentId) return false;

  if (getExclusiveChannelRole) {
    const exclusiveRole = getExclusiveChannelRole(msg.channel);
    if (exclusiveRole !== undefined && exclusiveRole !== role.id) return false;
  }

  const content = msg.content.toLowerCase();
  const idLower = agentId.toLowerCase();
  const roleLower = role.id.toLowerCase();

  if (role.handles_sources?.includes(msg.from)) return true;
  if (role.handles_channels?.includes(msg.channel)) return true;

  if (content.includes(idLower) || content.includes(`@${idLower}`)) return true;
  if (content.includes(roleLower) || content.includes(`@${roleLower}`)) return true;
  if (msg.from === role.reportsTo) return true;
  if (role.receives_from_direct_reports) {
    const reportIds = getDirectReports(agentId).map((m) => m.id);
    if (reportIds.includes(msg.from)) return true;
  }
  return false;
}
