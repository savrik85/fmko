import React from "react";

type SpinnerSize = "sm" | "md" | "lg";

export function Spinner({ size = "md" }: { size?: SpinnerSize }) {
  return <div className={`spinner spinner-${size}`} />;
}
