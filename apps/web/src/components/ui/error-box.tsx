import React, { type ReactNode } from "react";

type ErrorVariant = "light" | "dark";

interface ErrorBoxProps {
  /** Text hlášky. Když hláška potřebuje odkaz nebo tučné slovo, použij `children`. */
  message?: string;
  children?: ReactNode;
  variant?: ErrorVariant;
}

export function ErrorBox({ message, children, variant = "light" }: ErrorBoxProps) {
  if (!message && !children) return null;
  return (
    <div className={variant === "dark" ? "error-box-dark" : "error-box"} role="alert">
      <span aria-hidden="true">{variant === "dark" ? "✕" : "⚠"}</span>
      <span>{children ?? message}</span>
    </div>
  );
}
