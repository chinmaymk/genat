import type { LayeredFs } from './layered-fs';

function validateId(id: string, name: string): void {
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error(`Invalid ${name}: ${id}`);
  }
}

export function createOrgStore(layeredFs: LayeredFs, onWrite?: () => void) {
  function afterWrite(): void {
    onWrite?.();
  }

  return {
    async readOrgMd(): Promise<string | null> {
      return layeredFs.readFile('org.md');
    },

    async listChannelNames(): Promise<string[]> {
      return layeredFs.listDir('channels', { listFiles: true, stripExtension: '.md' });
    },

    async readChannel(name: string): Promise<string | null> {
      validateId(name, 'channel name');
      return layeredFs.readFile(`channels/${name}.md`);
    },

    async readRole(roleId: string): Promise<string | null> {
      validateId(roleId, 'roleId');
      return layeredFs.readFile(`roles/${roleId}.md`);
    },

    async readSkill(skillId: string): Promise<string | null> {
      validateId(skillId, 'skillId');
      const fromDir = await layeredFs.readFile(`skills/${skillId}/SKILL.md`);
      if (fromDir !== null) return fromDir;
      return layeredFs.readFile(`skills/${skillId}.md`);
    },

    async readKnowledge(name: string): Promise<string | null> {
      validateId(name, 'knowledge name');
      return layeredFs.readFile(`knowledge/${name}.md`);
    },

    async listRoleIds(): Promise<string[]> {
      return layeredFs.listDir('roles', { listFiles: true, stripExtension: '.md' });
    },

    async listSkillIds(): Promise<string[]> {
      const [fromDirs, fromFiles] = await Promise.all([
        layeredFs.listDir('skills', { listFiles: false }),
        layeredFs.listDir('skills', { listFiles: true, stripExtension: '.md' }),
      ]);
      const seen = new Set(fromDirs);
      const merged = [...fromDirs];
      for (const id of fromFiles) {
        if (!seen.has(id)) {
          seen.add(id);
          merged.push(id);
        }
      }
      return merged.sort();
    },

    async listKnowledgeNames(): Promise<string[]> {
      return layeredFs.listDir('knowledge', { listFiles: true, stripExtension: '.md' });
    },

    async listTeamNames(): Promise<string[]> {
      return layeredFs.listDir('teams', { listFiles: true, stripExtension: '.md' });
    },

    async writeRole(roleId: string, content: string): Promise<void> {
      validateId(roleId, 'roleId');
      await layeredFs.writeToAgent(`roles/${roleId}.md`, content);
      afterWrite();
    },

    async writeSkill(skillId: string, content: string): Promise<void> {
      validateId(skillId, 'skillId');
      await layeredFs.writeToAgent(`skills/${skillId}/SKILL.md`, content);
      afterWrite();
    },

    async writeKnowledge(name: string, content: string): Promise<void> {
      validateId(name, 'knowledge name');
      await layeredFs.writeToAgent(`knowledge/${name}.md`, content);
      afterWrite();
    },

    async writeOrgMd(content: string): Promise<void> {
      await layeredFs.writeToAgent('org.md', content);
      afterWrite();
    },
  };
}

export type OrgStore = ReturnType<typeof createOrgStore>;
