export function HeroPanel() {
  return (
    <div
      className="hidden md:flex w-1/2 relative overflow-hidden items-center justify-center"
      style={{
        background: "#0A0A0A",
        borderRight: "1px solid #2a2a2a",
      }}
    >
      <div className="relative z-10 px-12 max-w-md animate-entrance delay-0">
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "14px",
            color: "#10B981",
            marginBottom: "24px",
          }}
        >
          &gt; clip_agent
        </p>
        <h1
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "42px",
            fontWeight: 700,
            color: "#FAFAFA",
            lineHeight: 1.1,
            marginBottom: "24px",
          }}
        >
          clip the moments
          <br />
          that matter.
        </h1>
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "14px",
            color: "#6B7280",
            lineHeight: 1.5,
          }}
        >
          paste a youtube link, describe the moment
          <br />
          you want, and the agent will find and cut it.
        </p>
      </div>
    </div>
  );
}
