"use client";

import React, { useId } from "react";

type InputVariant = "light" | "dark";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  label?: string;
}

export function Input({ variant = "light", label, className = "", id, ...props }: InputProps) {
  // Popisek musí být s polem svázaný přes htmlFor — jinak ho čtečka nepřečte
  // a na mobilu se klepnutím na popisek nedostaneš do pole. useId dá stabilní
  // identifikátor i při vícenásobném vykreslení; vlastní `id` má přednost.
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputClass = variant === "dark" ? "input-dark" : "input";
  const labelClass = variant === "dark" ? "input-label-dark" : "input-label";

  return (
    <div>
      {label && <label className={labelClass} htmlFor={inputId}>{label}</label>}
      <input id={inputId} className={`${inputClass} ${className}`} {...props} />
    </div>
  );
}
