import React from "react";

type InputVariant = "light" | "dark";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  label?: string;
}

export function Input({ variant = "light", label, className = "", ...props }: InputProps) {
  const inputClass = variant === "dark" ? "input-dark" : "input";
  const labelClass = variant === "dark" ? "input-label-dark" : "input-label";

  return (
    <div>
      {label && <label className={labelClass}>{label}</label>}
      <input className={`${inputClass} ${className}`} {...props} />
    </div>
  );
}
