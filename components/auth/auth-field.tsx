"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface AuthFieldProps {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  errorId?: string;
  required?: boolean;
  minLength?: number;
}

export function AuthField({
  label,
  name,
  type = "text",
  autoComplete,
  errorId,
  required,
  minLength,
}: AuthFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && showPassword ? "text" : type;

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="f-xs muted">{label}</span>
      <div style={{ position: "relative" }}>
        <input
          name={name}
          type={resolvedType}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          aria-describedby={errorId}
          aria-invalid={errorId ? "true" : undefined}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-glow)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-1)]"
          style={{
            height: 44,
            width: "100%",
            background: "oklch(1 0 0 / 0.04)",
            border: 0,
            color: "var(--fg)",
            font: "inherit",
            paddingLeft: 12,
            paddingRight: isPassword ? 44 : 12,
            borderRadius: 8,
            boxShadow: "0 0 0 1px var(--line)",
            fontSize: 13,
          }}
        />
        {isPassword && (
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
            style={{
              position: "absolute",
              inset: 0,
              left: "auto",
              width: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: "var(--fg-dim)",
            }}
          >
            {showPassword ? (
              <EyeOff size={15} strokeWidth={1.75} />
            ) : (
              <Eye size={15} strokeWidth={1.75} />
            )}
          </button>
        )}
      </div>
    </label>
  );
}
