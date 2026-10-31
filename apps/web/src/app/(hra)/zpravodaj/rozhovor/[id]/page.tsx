"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { InterviewForm } from "../../Interviews";

/** Rozhovor pro Zpravodaj: otázky redaktora a odpovědi trenéra. */
export default function InterviewPage() {
  const params = useParams();
  const id = decodeURIComponent(String(params.id ?? ""));
  return (
    <div className="page-container space-y-4">
      <Link href="/zpravodaj" className="inline-block text-sm text-pitch-700 hover:text-pitch-500">← Zpravodaj</Link>
      <InterviewForm interviewId={id} />
    </div>
  );
}
