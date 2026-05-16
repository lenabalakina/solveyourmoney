import type { AuthFormState } from "@/server/actions/auth";

interface AuthMessageProps {
  state: AuthFormState;
  id?: string;
}

export function AuthMessage({ state, id }: AuthMessageProps) {
  if (!state.message) return null;

  if (state.status === "error") {
    return (
      <div
        id={id}
        role="alert"
        style={{
          background: "var(--danger-soft)",
          color: "var(--danger)",
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 13,
        }}
      >
        {state.message}
      </div>
    );
  }

  // idle + message = info (e.g. "reset link is on its way")
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      style={{
        background: "var(--bg-2)",
        color: "var(--fg-soft)",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 13,
      }}
    >
      {state.message}
    </div>
  );
}
