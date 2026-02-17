import matter from 'gray-matter';
import type { OrgStore } from './org-store';
import type { RoleConfig, SkillConfig } from './agent';
import { logger } from '../logger';

export interface OrgMember {
  id: string;
  role: string;
  reportsTo: string;
}

export interface ChannelConfig {
  name: string;
  purpose: string;
  handles_sources?: string[];
}

function parseOrgLine(line: string): OrgMember | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('- ')) return null;

  const body = trimmed.slice(2).trim();
  const parenStart = body.indexOf('(');
  const id = parenStart === -1 ? body.trim() : body.slice(0, parenStart).trim();
  if (!id) return null;

  let role = id;
  let reportsTo = '';

  if (parenStart !== -1) {
    const parenEnd = body.indexOf(')', parenStart);
    const inner = parenEnd === -1 ? body.slice(parenStart + 1) : body.slice(parenStart + 1, parenEnd);
    for (const part of inner.split(',')) {
      const colonIdx = part.indexOf(':');
      if (colonIdx === -1) continue;
      const key = part.slice(0, colonIdx).trim();
      const value = part.slice(colonIdx + 1).trim();
      if (key === 'role') role = value;
      if (key === 'reports_to') reportsTo = value;
    }
  }

  return { id, role, reportsTo };
}

export class OrgLoader {
  constructor(private store: OrgStore) {}

  async loadMembers(): Promise<Map<string, OrgMember>> {
    const content = await this.store.readOrgMd();
    if (!content) throw new Error('org.md not found or empty');
    const members = new Map<string, OrgMember>();
    for (const line of content.split('\n')) {
      const member = parseOrgLine(line);
      if (member) members.set(member.id, member);
    }
    logger.info({ memberCount: members.size }, 'Organization loaded');
    return members;
  }

  async loadRole(roleId: string): Promise<RoleConfig> {
    const raw = await this.store.readRole(roleId);
    if (!raw) throw new Error(`Role file not found: ${roleId}`);

    const parsed = matter(raw);
    const fm = parsed.data as Record<string, any>;
    const body = parsed.content.trim();
    const level = fm.level ?? 'ic';

    const role: RoleConfig = {
      id: fm.id ?? roleId,
      title: fm.title ?? roleId,
      level,
      reportsTo: fm.reports_to ?? fm.reportsTo ?? '',
      skills: Array.isArray(fm.skills) ? fm.skills : [],
      model: fm.model ?? { provider: 'anthropic' },
      systemPrompt: body,
      handles_sources: fm.handles_sources,
      handles_channels: fm.handles_channels,
      receives_from_direct_reports:
        fm.receives_from_direct_reports ?? (level === 'director' || level === 'executive'),
      channels: fm.channels,
    };

    if (role.model.provider === 'interview') {
      role.model = { ...role.model, provider: 'anthropic' };
    }

    return role;
  }

  async loadSkill(skillId: string): Promise<SkillConfig> {
    const raw = await this.store.readSkill(skillId);
    if (!raw) throw new Error(`Skill file not found: ${skillId}`);

    const parsed = matter(raw);
    const fm = parsed.data as Record<string, any>;
    const metadata = fm.metadata as Record<string, unknown> | undefined;

    return {
      id: skillId,
      name: (metadata?.displayName as string) ?? fm.name ?? skillId,
      tool: (metadata?.tool as string) ?? fm.tool ?? skillId,
      content: parsed.content.trim(),
    };
  }

  async loadSkillsForRole(role: RoleConfig, agentId: string): Promise<SkillConfig[]> {
    const skills: SkillConfig[] = [];
    for (const skillId of role.skills) {
      try {
        skills.push(await this.loadSkill(skillId));
      } catch (err) {
        logger.warn({ err, skillId, agentId }, 'Could not load skill');
      }
    }
    return skills;
  }

  async loadChannels(): Promise<ChannelConfig[]> {
    const names = await this.store.listChannelNames();
    const configs: ChannelConfig[] = [];
    for (const name of names) {
      const raw = await this.store.readChannel(name);
      if (!raw) continue;
      const parsed = matter(raw);
      const fm = parsed.data as Record<string, any>;
      configs.push({
        name,
        purpose: (fm.purpose as string) ?? '',
        handles_sources: Array.isArray(fm.handles_sources) ? fm.handles_sources : undefined,
      });
    }
    return configs;
  }
}
