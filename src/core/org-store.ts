import type { LayeredFs } from './layered-fs';

function validateId(id: string, name: string): void {
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error(`Invalid ${name}: ${id}`);
  }
}

export class OrgStore {
  private layeredFs: LayeredFs;
  private onWrite: (() => void) | undefined;

  constructor(layeredFs: LayeredFs, onWrite?: () => void) {
    this.layeredFs = layeredFs;
    this.onWrite = onWrite;
  }

  private afterWrite(): void {
    this.onWrite?.();
  }

  async readOrgMd(): Promise<string | null> {
    return this.layeredFs.readFile('org.md');
  }

  async listChannelNames(): Promise<string[]> {
    return this.layeredFs.listDir('channels', { listFiles: true, stripExtension: '.md' });
  }

  async readChannel(name: string): Promise<string | null> {
    validateId(name, 'channel name');
    return this.layeredFs.readFile(`channels/${name}.md`);
  }

  async readRole(roleId: string): Promise<string | null> {
    validateId(roleId, 'roleId');
    return this.layeredFs.readFile(`roles/${roleId}.md`);
  }

  async readSkill(skillId: string): Promise<string | null> {
    validateId(skillId, 'skillId');
    const fromDir = await this.layeredFs.readFile(`skills/${skillId}/SKILL.md`);
    if (fromDir !== null) return fromDir;
    return this.layeredFs.readFile(`skills/${skillId}.md`);
  }

  async listTeamNames(): Promise<string[]> {
    return this.layeredFs.listDir('teams', { listFiles: true, stripExtension: '.md' });
  }

  async readTeam(name: string): Promise<string | null> {
    validateId(name, 'team name');
    return this.layeredFs.readFile(`teams/${name}.md`);
  }

  async writeRole(roleId: string, content: string): Promise<void> {
    validateId(roleId, 'roleId');
    await this.layeredFs.writeToAgent(`roles/${roleId}.md`, content);
    this.afterWrite();
  }

  async writeSkill(skillId: string, content: string): Promise<void> {
    validateId(skillId, 'skillId');
    await this.layeredFs.writeToAgent(`skills/${skillId}/SKILL.md`, content);
    this.afterWrite();
  }

  async writeOrgMd(content: string): Promise<void> {
    await this.layeredFs.writeToAgent('org.md', content);
    this.afterWrite();
  }
}
