export interface ToolExecution {
  tool: string;
  args: string[];
  cwd?: string;       // worktree path
  env?: Record<string, string>;
}

export interface ToolResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Mapping from logical tool names to CLI command names
const TOOL_COMMANDS: Record<string, string> = {
  'claude-code': 'claude',
  'codex': 'codex',
  'gemini-cli': 'gemini',
  'gh': 'gh',
  'fly': 'fly',
  'git': 'git',
};

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    // Flush
    chunks.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }

  return chunks.join('');
}

export class ToolRunner {
  async execute(execution: ToolExecution): Promise<ToolResult> {
    const command = TOOL_COMMANDS[execution.tool] ?? execution.tool;
    const cmd = [command, ...execution.args];

    const opts: {
      stdout: 'pipe';
      stderr: 'pipe';
      cwd?: string;
      env?: Record<string, string>;
    } = { stdout: 'pipe', stderr: 'pipe' };

    if (execution.cwd) opts.cwd = execution.cwd;
    if (execution.env) opts.env = { ...process.env, ...execution.env } as Record<string, string>;

    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn(cmd, opts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        stdout: '',
        stderr: `Failed to spawn process "${command}": ${message}`,
        exitCode: 1,
      };
    }

    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        proc.kill();
        reject(new Error(`Process "${command}" timed out after 5 minutes`));
      }, TIMEOUT_MS)
    );

    const result = Promise.all([
      readStream(proc.stdout as ReadableStream<Uint8Array>),
      readStream(proc.stderr as ReadableStream<Uint8Array>),
      proc.exited,
    ]);

    const [stdout, stderr, exitCode] = await Promise.race([result, timeout]);

    return { stdout, stderr, exitCode };
  }
}

