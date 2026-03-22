import React from "react";

type ErrorVariant = "light" | "dark";

interface ErrorBoxProps {
  message: string;
  variant?: ErrorVariant;
}

export function ErrorBox({ message, variant = "light" }: ErrorBoxProps) {
  if (!message) return null;
  return (
    <div className={variant === "dark" ? "error-box-dark" : "error-box"}>
      <span>{variant === "dark" ? "\u2715" : "\u26A0"}</span>
      <span>{message}</span>
    </div>
  );
}
