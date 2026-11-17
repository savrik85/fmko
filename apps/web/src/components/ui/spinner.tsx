import React from "react";

type SpinnerSize = "sm" | "md" | "lg";

export function Spinner({ size = "md" }: { size?: SpinnerSize }) {
  return <div className={`spinner spinner-${size}`} />;
}

/** Načítá se celá stránka: kolečko uprostřed horní poloviny obrazovky. */
export function PageLoading() {
  return (
    <div className="page-container flex items-center justify-center min-h-[50vh]" role="status" aria-label="Načítám">
      <Spinner size="lg" />
    </div>
  );
}

/** Načítá se část stránky (karta, záložka). Když byl spinner v kartě, karta zůstává kolem. */
export function SectionLoading() {
  return (
    <div className="flex justify-center py-8" role="status" aria-label="Načítám">
      <Spinner />
    </div>
  );
}
