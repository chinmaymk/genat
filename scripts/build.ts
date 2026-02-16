import { mkdir, cp, access } from "fs/promises";
import { join } from "path";

// -----------------------------------------------------------------------------
// Paths
// -----------------------------------------------------------------------------

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "dist", "genat");

/** Compile step runs with cwd here so .bun-build temp dirs stay under dist/ */
const BUILD_TMP = join(ROOT, "dist", ".bun-build-tmp");

const PATHS = {
  orgSource: join(ROOT, "org"),
  defaultOrg: join(OUT, "default", "org"),
  defaultUi: join(OUT, "default", "ui"),
  binary: join(OUT, "bin", "genat"),
  entry: {
    ui: join(ROOT, "src", "web", "ui", "index.tsx"),
    cli: join(ROOT, "src", "index.ts"),
  },
} as const;

const STUB_DIRS = [
  join(OUT, "agent", "org"),
  join(OUT, "agent", "data"),
  join(OUT, "agent", "ui"),
  join(OUT, "user", "org"),
  join(OUT, "user", "data"),
  join(OUT, "user", "ui"),
  join(OUT, "log"),
] as const;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function assertOk(result: Awaited<ReturnType<typeof Bun.build>>, step: string): void {
  if (result.success) return;
  const messages = result.logs.map((m) => (typeof m === "string" ? m : m.message)).join("\n");
  throw new Error(`${step} failed:\n${messages}`);
}

// -----------------------------------------------------------------------------
// Build steps
// -----------------------------------------------------------------------------

async function ensureLayout(): Promise<void> {
  await mkdir(BUILD_TMP, { recursive: true });
  await mkdir(OUT, { recursive: true });
}

async function copyOrg(): Promise<void> {
  if (!(await exists(PATHS.orgSource))) {
    throw new Error(`org/ not found at ${PATHS.orgSource}`);
  }
  await mkdir(join(PATHS.defaultOrg, ".."), { recursive: true });
  await cp(PATHS.orgSource, PATHS.defaultOrg, { recursive: true });
}

async function createStubDirs(): Promise<void> {
  for (const dir of STUB_DIRS) {
    await mkdir(dir, { recursive: true });
  }
}

async function buildUi(): Promise<void> {
  await mkdir(PATHS.defaultUi, { recursive: true });
  const result = await Bun.build({
    entrypoints: [PATHS.entry.ui],
    outdir: PATHS.defaultUi,
    target: "browser",
  });
  assertOk(result, "UI bundle");
}

async function buildBinary(): Promise<void> {
  await mkdir(join(OUT, "bin"), { recursive: true });

  process.env.TMPDIR = BUILD_TMP;
  process.env.BUN_TMPDIR = BUILD_TMP;

  const cwd = process.cwd();
  try {
    process.chdir(BUILD_TMP);
    const result = await Bun.build({
      entrypoints: [PATHS.entry.cli],
      compile: { outfile: PATHS.binary },
      minify: true,
      sourcemap: "linked",
    });
    assertOk(result, "Binary compile");
  } finally {
    process.chdir(cwd);
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Build: creating output at", OUT);

  await ensureLayout();
  await copyOrg();
  await createStubDirs();
  await buildUi();
  await buildBinary();

  console.log("Build complete:", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
