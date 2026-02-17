import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { OrgLoader } from '../src/core/org-loader';
import { createLayeredFs } from '../src/core/layered-fs';
import { OrgStore } from '../src/core/org-store';

const orgDir = join(process.cwd(), 'org');

function createTestLoader() {
  const layeredFs = createLayeredFs({
    defaultDir: orgDir,
    agentDir: orgDir,
    userDir: orgDir,
  });
  const store = new OrgStore(layeredFs);
  return new OrgLoader(store);
}

describe('OrgLoader', () => {
  test('loads org chart from org.md', async () => {
    const loader = createTestLoader();
    const members = await loader.loadMembers();
    expect(members.size).toBe(3);
    expect(members.get('ceo')).toEqual({ id: 'ceo', role: 'ceo', reportsTo: 'board' });
    expect(members.get('swe-1')).toEqual({ id: 'swe-1', role: 'swe', reportsTo: 'eng-director' });
  });

  test('loads role config', async () => {
    const loader = createTestLoader();
    const role = await loader.loadRole('swe');
    expect(role.id).toBe('swe');
    expect(role.title).toBe('Software Engineer');
    expect(role.skills.length).toBeGreaterThan(0);
  });

  test('loads skill config', async () => {
    const loader = createTestLoader();
    const skill = await loader.loadSkill('code-with-claude');
    expect(skill.id).toBe('code-with-claude');
    expect(skill.tool).toBe('claude-code');
    expect(skill.content.length).toBeGreaterThan(0);
  });

  test('getDirectReports via members', async () => {
    const loader = createTestLoader();
    const members = await loader.loadMembers();
    const reports = Array.from(members.values()).filter((m) => m.reportsTo === 'eng-director');
    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe('swe-1');
  });

  test('getManager via members', async () => {
    const loader = createTestLoader();
    const members = await loader.loadMembers();
    const swe1 = members.get('swe-1');
    expect(swe1).toBeDefined();
    const mgr = members.get(swe1!.reportsTo);
    expect(mgr).toBeDefined();
    expect(mgr!.id).toBe('eng-director');
  });

  test('loadTeams returns role lists by team name', async () => {
    const loader = createTestLoader();
    const teams = await loader.loadTeams();
    expect(teams.size).toBeGreaterThan(0);
    const engRoles = teams.get('engineering');
    expect(engRoles).toContain('swe');
    expect(engRoles).toContain('eng-director');
  });

  test('resolveTeam returns team name for known role', async () => {
    const loader = createTestLoader();
    const teams = await loader.loadTeams();
    expect(loader.resolveTeam('swe', teams)).toBe('engineering');
    expect(loader.resolveTeam('eng-director', teams)).toBe('engineering');
  });

  test('resolveTeam returns executive for unknown role', async () => {
    const loader = createTestLoader();
    const teams = await loader.loadTeams();
    expect(loader.resolveTeam('ceo', teams)).toBe('executive');
  });
});
