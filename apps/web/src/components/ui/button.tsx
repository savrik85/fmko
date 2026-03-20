import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-pitch-500 hover:bg-pitch-400 text-white shadow-card hover:shadow-hover",
  secondary: "bg-white hover:bg-gray-50 text-pitch-500 border border-pitch-500/20 shadow-card",
  danger: "bg-card-red hover:bg-red-600 text-white shadow-card",
  ghost: "bg-transparent hover:bg-black/5 text-pitch-500",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-base",
  lg: "px-8 py-4 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`font-heading font-bold rounded-card transition-all inline-flex items-center justify-center ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
