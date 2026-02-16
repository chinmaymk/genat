import type { OrgStore } from '../core/org-store';

export class KnowledgeBase {
  private docs: Map<string, string>;
  private orgStore: OrgStore | null = null;

  constructor() {
    this.docs = new Map();
  }

  setOrgStore(store: OrgStore): void {
    this.orgStore = store;
  }

  async load(): Promise<void> {
    const store = this.orgStore;
    if (!store) {
      console.warn('[KnowledgeBase] OrgStore not set; skipping load');
      return;
    }

    const names = await store.listKnowledgeNames();
    for (const name of names) {
      const content = await store.readKnowledge(name);
      if (content !== null) {
        this.docs.set(name, content);
      }
    }

    console.log(`[KnowledgeBase] Loaded ${this.docs.size} document(s): [${[...this.docs.keys()].join(', ')}]`);
  }

  reload(): void {
    this.docs.clear();
    void this.load();
  }

  get(name: string): string | undefined {
    return this.docs.get(name);
  }

  search(query: string): string[] {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 0);

    if (terms.length === 0) return this.list();

    const results: string[] = [];

    for (const [name, content] of this.docs.entries()) {
      const lowerContent = content.toLowerCase();
      const allTermsPresent = terms.every(term => lowerContent.includes(term));
      if (allTermsPresent) {
        results.push(name);
      }
    }

    return results;
  }

  list(): string[] {
    return Array.from(this.docs.keys());
  }
}

export const knowledgeBase = new KnowledgeBase();
