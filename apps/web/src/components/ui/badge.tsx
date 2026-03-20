import React from "react";

type BadgeVariant = "position" | "status" | "league" | "default";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  position: "bg-pitch-500/10 text-pitch-500 font-heading font-bold",
  status: "bg-gold-500/10 text-gold-600",
  league: "bg-pitch-500 text-white font-heading",
  default: "bg-gray-100 text-gray-600",
};

export function Badge({ variant = "default", className = "", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
