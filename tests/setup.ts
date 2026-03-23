import { vi } from "vitest";
import Module from "module";
import path from "path";

// Set env vars so supabaseClient.cjs doesn't throw when loaded
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

// ─── CJS module mocks ─────────────────────────────────────────────────
// Vitest's vi.mock() doesn't intercept CJS require() calls.
// We patch Node's require to return mocks for scripts/lib/*.cjs modules.

const ROOT = path.resolve(__dirname, "..");
const SCRIPTS_LIB = path.join(ROOT, "scripts", "lib");

// Shared mock functions that tests can access via require()
const mocks: Record<string, Record<string, unknown>> = {
  "youtube.cjs": {
    fetchYoutubeMetadataAndTranscript: vi.fn().mockResolvedValue({ metadata: {}, transcript: [] }),
    getVideoId: vi.fn(),
  },
  "db.cjs": {
    getJobById: vi.fn().mockResolvedValue({}),
    updateJob: vi.fn().mockResolvedValue({}),
    insertCandidatesForJob: vi.fn().mockResolvedValue([]),
  },
  "llm.cjs": {
    generateCandidates: vi.fn().mockResolvedValue([]),
    generateTags: vi.fn().mockResolvedValue([]),
  },
  "downloader.cjs": {
    downloadYoutubeVideo: vi.fn().mockResolvedValue("/tmp/source.mp4"),
  },
  "ffmpeg.cjs": {
    trimVideoSegment: vi.fn().mockResolvedValue("/tmp/clip.mp4"),
  },
  "notion.cjs": {
    createNotionClipPage: vi.fn().mockResolvedValue("notion-page-mock"),
  },
  "transcriptUtils.cjs": {
    buildSentencesFromTranscript: vi.fn().mockReturnValue([]),
  },
  "supabaseClient.cjs": {
    supabase: {},
  },
  "supabaseStorage.cjs": {
    uploadClipToStorage: vi.fn().mockResolvedValue({ storagePath: "clips/mock.mp4", publicUrl: "https://storage.mock/clip.mp4" }),
  },
};

// Export mocks so tests can access and configure them
export { mocks as cjsMocks };

// Patch require to intercept scripts/lib/*.cjs
const originalResolveFilename = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module as any)._resolveFilename = function (
  request: string,
  parent: { filename?: string },
  ...rest: unknown[]
) {
  // Let it resolve normally first
  const resolved = originalResolveFilename.call(this, request, parent, ...rest) as string;

  // If it resolves to scripts/lib/*.cjs, return a special marker
  if (resolved.startsWith(SCRIPTS_LIB) && resolved.endsWith(".cjs")) {
    return resolved; // keep the resolved path
  }
  return resolved;
};

// Prepopulate the module cache with our mocks
for (const [filename, mockExports] of Object.entries(mocks)) {
  const fullPath = path.join(SCRIPTS_LIB, filename);
  const mod = new Module(fullPath);
  mod.filename = fullPath;
  mod.loaded = true;
  mod.exports = mockExports;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Module as any)._cache[fullPath] = mod;
}

// Mock @supabase/supabase-js for ESM imports (orchestrator etc.)
vi.mock("@supabase/supabase-js", () => {
  const mockChain = () => {
    const chain: Record<string, unknown> = {};
    const methods = ["from", "select", "insert", "update", "delete", "eq", "neq", "in", "order", "limit", "single", "maybeSingle"];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  };

  return {
    createClient: vi.fn(() => mockChain()),
  };
});
