import { isRelevant } from './message-relevance';
import type { ChannelMessage, ChannelManager } from './channel';
import type { Org } from './org';

export class MessageRouter {
  constructor(private org: Org, private channels: ChannelManager) {}

  select(msg: ChannelMessage, subscriberIds: string[]): string[] {
    // Thread ownership: if root message was claimed, route to that agent
    const rootId = msg.threadId ?? msg.id;
    const rootChannel = this.channels.get(msg.channel);
    const rootMsg = rootChannel?.messages.find((m) => m.id === rootId);
    const triaged = rootMsg?.claimedBy;
    if (triaged && subscriberIds.includes(triaged)) return [triaged];

    // Thread continuity: route to agent already in the thread
    const threadMessages = rootChannel?.getThread(rootId) ?? [];
    const othersInThread = threadMessages.filter((m) => m.id !== msg.id);
    if (othersInThread.length > 0) {
      const owner = othersInThread.find((m) => subscriberIds.includes(m.from));
      if (owner) return [owner.from];
    }

    // Role-based relevance
    const relevant = subscriberIds.filter((id) => {
      const agent = this.org.getAgent(id);
      return agent && isRelevant(
        msg, id, agent.role,
        (managerId) => this.org.getDirectReports(managerId),
        (ch) => this.org.getExclusiveChannelRole(ch)
      );
    });

    return relevant.length > 0 ? [relevant[0]] : [];
  }
}
