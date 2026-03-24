export function FormHeader() {
  return (
    <>
      {/* Mobile */}
      <div className="md:hidden animate-entrance delay-0 mb-12">
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "14px",
            color: "#10B981",
          }}
        >
          &gt; clip_agent
        </span>
      </div>

      {/* Desktop */}
      <div className="hidden md:block animate-entrance delay-0 mb-12">
        <h2
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "20px",
            fontWeight: 700,
            color: "#FAFAFA",
          }}
        >
          // create_clip
        </h2>
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "13px",
            color: "#6B7280",
            marginTop: "8px",
          }}
        >
          drop in a link and tell us what to cut.
        </p>
      </div>
    </>
  );
}
