import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PHONE_LENGTH, PHONE_PLACEHOLDER } from "@/lib/validation";

/** Small uppercase caption used above values across the app. */
export function Label({
  children,
  letterSpacing = 3,
  style,
}: {
  children: ReactNode;
  letterSpacing?: number;
  style?: CSSProperties;
}) {
  return (
    <p
      className="muted"
      style={{ fontSize: 12, letterSpacing, textTransform: "uppercase", ...style }}
    >
      {children}
    </p>
  );
}

/** Left label / right value line used in lists of items, stamps and counts. */
export function Row({
  left,
  right,
  style,
}: {
  left: ReactNode;
  right: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, ...style }}>
      {left}
      {right}
    </div>
  );
}

export function BackLink({ style }: { style?: CSSProperties }) {
  return (
    <Link href="/">
      <p className="muted" style={{ marginTop: 32, fontSize: 13, ...style }}>
        ← Back to MILO
      </p>
    </Link>
  );
}

export function PhoneInput({
  value,
  onChange,
  label = "Phone",
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  style?: CSSProperties;
}) {
  return (
    <input
      placeholder={`${label} (${PHONE_PLACEHOLDER})`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={PHONE_LENGTH}
      style={style}
    />
  );
}

export function ErrorText({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <p style={{ marginTop: 12, color: "#c45c4a", ...style }}>{children}</p>;
}
