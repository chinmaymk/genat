import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { OrgManager } from '../src/core/org';
import { createLayeredFs } from '../src/core/layered-fs';
import { OrgStore } from '../src/core/org-store';

const orgDir = join(process.cwd(), 'org');

function createTestOrgStore() {
  const layeredFs = createLayeredFs({
    defaultDir: orgDir,
    agentDir: orgDir,
    userDir: orgDir,
  });
  return new OrgStore(layeredFs);
}

describe('OrgManager', () => {
  test('loads org chart from org.md', async () => {
    const org = new OrgManager();
    org.setOrgStore(createTestOrgStore());
    await org.loadOrg();
    expect(org.members.size).toBe(3);
    expect(org.members.get('ceo')).toEqual({ id: 'ceo', role: 'ceo', reportsTo: 'board' });
    expect(org.members.get('swe-1')).toEqual({ id: 'swe-1', role: 'swe', reportsTo: 'eng-director' });
  });

  test('loads role config', async () => {
    const org = new OrgManager();
    org.setOrgStore(createTestOrgStore());
    const role = await org.loadRole('swe');
    expect(role.id).toBe('swe');
    expect(role.title).toBe('Software Engineer');
    expect(role.skills.length).toBeGreaterThan(0);
  });

  test('loads skill config', async () => {
    const org = new OrgManager();
    org.setOrgStore(createTestOrgStore());
    const skill = await org.loadSkill('code-with-claude');
    expect(skill.id).toBe('code-with-claude');
    expect(skill.tool).toBe('claude-code');
    expect(skill.content.length).toBeGreaterThan(0);
  });

  test('getDirectReports', async () => {
    const org = new OrgManager();
    org.setOrgStore(createTestOrgStore());
    await org.loadOrg();
    const reports = org.getDirectReports('eng-director');
    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe('swe-1');
  });

  test('getManager', async () => {
    const org = new OrgManager();
    org.setOrgStore(createTestOrgStore());
    await org.loadOrg();
    const mgr = org.getManager('swe-1');
    expect(mgr).toBeDefined();
    expect(mgr!.id).toBe('eng-director');
  });
});
