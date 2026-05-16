"use client";

import { useState } from "react";
import { Bell, Sparkles, Coins } from "lucide-react";
import type { Notification } from "@/features/notifications/services/notificationsSchema";

type Kind = Notification["kind"];
type Filter = "all" | "unread" | "win" | "insight";

type UINotif = Notification & { read: boolean };

function formatRelDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return "Today";
  if (diffH < 24) return "Today";
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  return d.toLocaleDateString("nl-NL", { month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

const KIND_ICON: Record<Kind, React.FC<{ size?: number }>> = {
  win:     Sparkles,
  insight: Coins,
  info:    Bell,
};

const ACCENT_COLOR: Record<Kind, string> = {
  win:     "var(--success)",
  insight: "var(--warn)",
  info:    "var(--primary-glow)",
};
const ACCENT_SOFT: Record<Kind, string> = {
  win:     "var(--success-soft)",
  insight: "var(--warn-soft)",
  info:    "var(--primary-soft)",
};

function NotifRow({ n, onToggle }: { n: UINotif; onToggle: () => void }) {
  const Icon = KIND_ICON[n.kind];
  const color = ACCENT_COLOR[n.kind];
  const soft  = ACCENT_SOFT[n.kind];
  return (
    <div
      className="row"
      style={{
        padding: "14px 18px",
        gap: 14,
        borderTop: "1px solid var(--line)",
        background: n.read ? "transparent" : "oklch(0.66 0.18 282 / 0.03)",
        position: "relative",
        cursor: "pointer",
      }}
      onClick={onToggle}
    >
      {!n.read && (
        <span style={{
          position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
          width: 6, height: 6, borderRadius: 9, background: "var(--primary-glow)",
          boxShadow: "0 0 6px var(--primary-glow)",
        }} />
      )}
      <span style={{
        width: 32, height: 32, flexShrink: 0, borderRadius: 9,
        background: soft, color,
        display: "grid", placeItems: "center",
      }}>
        <Icon size={15} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row between" style={{ gap: 12 }}>
          <span className="f-sm" style={{ fontWeight: n.read ? 460 : 520, color: "var(--fg)" }}>{n.title}</span>
          <span className="mono muted f-xs" style={{ flexShrink: 0 }}>{formatTime(n.occurredAt)}</span>
        </div>
        <div className="f-xs muted" style={{ marginTop: 3, lineHeight: 1.5 }}>{n.body}</div>
        {n.xp && (
          <span className="mono f-xs" style={{ color: "var(--xp)", marginTop: 6, display: "inline-block" }}>{n.xp}</span>
        )}
      </div>
    </div>
  );
}

export function NotificationsContent({
  initialNotifications,
}: {
  initialNotifications: Notification[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<UINotif[]>(
    initialNotifications.map((n) => ({ ...n, read: false })),
  );
  const [digest, setDigest] = useState<"off" | "daily" | "weekly" | "monthly">("weekly");

  const counts = {
    all:     items.length,
    unread:  items.filter((i) => !i.read).length,
    wins:    items.filter((i) => i.kind === "win").length,
    insight: items.filter((i) => i.kind === "insight").length,
  };

  const filtered =
    filter === "all"     ? items :
    filter === "unread"  ? items.filter((i) => !i.read) :
    filter === "win"     ? items.filter((i) => i.kind === "win") :
    items.filter((i) => i.kind === "insight");

  const groups: Record<string, UINotif[]> = {};
  filtered.forEach((n) => {
    const day = formatRelDate(n.occurredAt);
    (groups[day] ??= []).push(n);
  });

  function markAll() { setItems(items.map((i) => ({ ...i, read: true }))); }
  function toggleRead(id: string) { setItems(items.map((i) => i.id === id ? { ...i, read: !i.read } : i)); }

  const FILTERS: { id: Filter; label: string; count: number }[] = [
    { id: "all",     label: "All",      count: counts.all },
    { id: "unread",  label: "Unread",   count: counts.unread },
    { id: "win",     label: "Wins",     count: counts.wins },
    { id: "insight", label: "Insights", count: counts.insight },
  ];

  return (
    <>
      <div className="page-hd">
        <div>
          <h1>Notifications</h1>
          <div className="sub">A quiet inbox. We only ping when it matters.</div>
        </div>
        <div className="row gap-8">
          <button className="btn ghost" onClick={markAll}>Mark all read</button>
        </div>
      </div>

      <div className="metrics" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="metric accent">
          <div className="lbl"><span className="ico"><Bell size={13} /></span>Unread</div>
          <div className="val">{counts.unread}</div>
          <span className="delta neut">{counts.all} total</span>
        </div>
        <div className="metric">
          <div className="lbl"><span className="ico"><Sparkles size={13} /></span>Big wins</div>
          <div className="val">{counts.wins}</div>
          <span className="delta neut">This account</span>
        </div>
        <div className="metric">
          <div className="lbl"><span className="ico"><Coins size={13} /></span>Insights</div>
          <div className="val">{counts.insight}</div>
          <span className="delta neut">In your inbox</span>
        </div>
        <div className="metric">
          <div className="lbl"><span className="ico"><Bell size={13} /></span>Digest</div>
          <div className="val" style={{ fontSize: 18, textTransform: "capitalize" }}>{digest}</div>
          <span className="delta neut">Cadence</span>
        </div>
      </div>

      <div className="g-12" style={{ marginTop: 16 }}>
        <div style={{ gridColumn: "span 8" }}>
          <div className="row between" style={{ margin: "4px 4px 12px" }}>
            <div className="seg">
              {FILTERS.map(({ id, label, count }) => (
                <button
                  key={id}
                  className={filter === id ? "on" : ""}
                  onClick={() => setFilter(id)}
                >
                  {label}{" "}
                  <span className="mono" style={{ color: "var(--fg-dim)", marginLeft: 4, fontSize: 11 }}>{count}</span>
                </button>
              ))}
            </div>
            <span className="muted f-xs">Sorted by newest</span>
          </div>

          <div className="card flat" style={{ padding: 0 }}>
            {Object.keys(groups).length === 0 ? (
              <div style={{ padding: "56px 20px", textAlign: "center", color: "var(--fg-mute)" }}>
                {items.length === 0
                  ? "No activity yet. Complete a lesson or update a goal to see your first notification."
                  : "Nothing matches this filter."}
              </div>
            ) : (
              Object.entries(groups).map(([day, list], gi) => (
                <div key={day}>
                  <div style={{
                    padding: "10px 18px 6px",
                    fontSize: 11, color: "var(--fg-dim)", textTransform: "uppercase", letterSpacing: "0.08em",
                    borderTop: gi === 0 ? undefined : "1px solid var(--line)",
                  }}>
                    {day}
                  </div>
                  {list.map((n) => (
                    <NotifRow
                      key={n.id}
                      n={n}
                      onToggle={() => toggleRead(n.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ gridColumn: "span 4", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Digest cadence</div>
            </div>
            <div className="seg" style={{ width: "100%" }}>
              {(["off", "daily", "weekly", "monthly"] as const).map((v) => (
                <button
                  key={v}
                  style={{ flex: 1 }}
                  className={digest === v ? "on" : ""}
                  onClick={() => setDigest(v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <div className="f-xs muted mt-12" style={{ marginTop: 10 }}>
              Digest emails are not yet sent — this preference will be used when email delivery is enabled.
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">About notifications</div>
            </div>
            <div className="f-xs muted" style={{ lineHeight: 1.7 }}>
              Notifications are generated from your real activity — lessons completed, goals updated, budgets changed. There are no automated alerts or scheduled messages in this version.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
