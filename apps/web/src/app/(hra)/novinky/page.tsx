"use client";

import { useEffect } from "react";
import { RELEASE_NOTES, markNotesSeen } from "@/data/release-notes";

export default function NovinkyPage() {
  useEffect(() => {
    markNotesSeen();
  }, []);

  return (
    <div className="page-container space-y-4">
      <p className="text-sm text-muted">Co se v Pralesu změnilo — nejnovější nahoře.</p>
      {RELEASE_NOTES.map((n) => (
        <div key={`${n.date}-${n.title}`} className="card p-4 sm:p-5">
          <div className="text-xs text-muted font-heading font-bold uppercase tracking-wide">
            {new Date(n.date).toLocaleDateString("cs", { day: "numeric", month: "long", year: "numeric" })}
          </div>
          <h2 className="font-heading font-bold text-lg mt-0.5">
            {n.emoji} {n.title}
          </h2>
          <ul className="mt-2.5 space-y-1.5">
            {n.items.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed flex gap-2">
                <span className="text-pitch-500 shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
