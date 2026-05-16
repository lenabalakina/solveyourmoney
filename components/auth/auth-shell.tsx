import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-bg min-h-dvh flex flex-col lg:grid lg:grid-cols-[45fr_55fr]">
      {/* Left panel — hidden on mobile/tablet, visible at lg (1024px+) */}
      <div
        className="hidden lg:flex items-center"
        style={{
          background: "var(--bg-1)",
          borderRight: "1px solid var(--line)",
          padding: 48,
        }}
      >
        <div style={{ maxWidth: 380 }}>
          {/* Brand mark */}
          <p
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono), monospace",
              color: "var(--primary-glow)",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            SolveYourMoney
          </p>

          {/* Headline */}
          <h1
            style={{
              fontSize: 38,
              fontWeight: 560,
              color: "var(--fg)",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              margin: "16px 0 12px",
            }}
          >
            Calm financial clarity for the next real-life decision.
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--fg-soft)",
              lineHeight: 1.6,
              maxWidth: 340,
              margin: "0 0 32px",
            }}
          >
            Sign in to continue your money journey and keep your progress in one place.
          </p>

          {/* Decorative mini-preview */}
          <div className="card" style={{ opacity: 0.8, transform: "translateY(-4px)", padding: 16 }}>
            {/* XP row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span className="pill primary" style={{ flexShrink: 0 }}>Lv 7</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--fg-dim)" }}>XP this week</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--xp)" }}>+225 XP</span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 4,
                    background: "var(--primary-soft)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "62%",
                      height: "100%",
                      background: "var(--primary-glow)",
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Metric tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div className="metric accent" style={{ padding: "10px 12px" }}>
                <div className="lbl" style={{ fontSize: 10 }}>Net worth</div>
                <div className="val" style={{ fontSize: 16 }}>$4,240</div>
              </div>
              <div className="metric" style={{ padding: "10px 12px" }}>
                <div className="lbl" style={{ fontSize: 10 }}>Streak</div>
                <div className="val" style={{ fontSize: 16 }}>12 days</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — full width on mobile, right column at lg */}
      <div className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm sm:max-w-md">
          {children}
        </div>
      </div>
    </main>
  );
}
