import { VideoIcon } from "./VideoIcon";

export function FormHeader() {
  return (
    <>
      {/* Mobile */}
      <div className="md:hidden animate-entrance delay-0 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">
            <VideoIcon size={16} color="white" />
          </div>
          <span
            className="text-sm font-bold tracking-tight text-black"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Clip Agent
          </span>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block animate-entrance delay-0 mb-8">
        <h2
          className="text-2xl font-bold text-black tracking-tight"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Create a clip
        </h2>
        <p className="text-sm text-[var(--text-muted)] mt-1.5" style={{ fontFamily: "var(--font-sans)" }}>
          Drop in a link and tell us what to cut.
        </p>
      </div>
    </>
  );
}
