import { VideoIcon } from "./VideoIcon";

export function HeroPanel() {
  return (
    <div className="dot-grid hidden md:flex w-1/2 relative overflow-hidden items-center justify-center bg-black">
      <div className="relative z-10 px-12 max-w-sm animate-entrance delay-0">
        <div className="w-10 h-10 border border-white/20 rounded-lg flex items-center justify-center mb-8">
          <VideoIcon size={20} color="white" />
        </div>
        <p
          className="text-xs uppercase tracking-[0.2em] text-white/40 mb-4"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Clip Agent
        </p>
        <h1
          className="text-3xl font-700 text-white tracking-tight leading-snug mb-5"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Clip the moments that matter.
        </h1>
        <p className="text-sm leading-relaxed text-white/40" style={{ fontFamily: "var(--font-sans)" }}>
          Paste a YouTube link, describe the moment you want, and the agent will find and cut it.
        </p>
      </div>
    </div>
  );
}
