export class Interviewer {
  async evaluateModel(
    roleId: string,
    provider: string,
    model: string
  ): Promise<{ score: number; passed: boolean }> {
    // Phase 2: Run benchmark tasks and evaluate the candidate model
    // against role-specific criteria, scoring output quality and reliability.
    return { score: 0, passed: true };
  }

  async selectBestModel(roleId: string): Promise<{ provider: string; model: string }> {
    // Phase 1: Return Anthropic Sonnet as the default for all roles.
    // Phase 2: Run evaluateModel across candidate pool and pick highest scorer.
    return { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
  }
}

export const interviewer = new Interviewer();
