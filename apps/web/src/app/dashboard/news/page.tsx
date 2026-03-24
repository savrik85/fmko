"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, Spinner, SectionLabel } from "@/components/ui";

interface Article {
  id: string;
  type: string;
  headline: string;
  body: string;
  icon: string;
  date: string;
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Teď";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "short" });
}

export default function NewsPage() {
  const { teamId } = useTeam();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ articles: Article[] }>(`/api/teams/${teamId}/news`)
      .then((data) => { setArticles(data.articles); setLoading(false); })
      .catch(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  return (
    <div className="page-container space-y-5">

      {articles.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-center text-muted py-8">Zatím žádné novinky. Odehraj první zápas!</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => {
            const inner = (
              <Card key={article.id} hover={article.type === "match"}>
                <CardBody>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0 mt-0.5">{article.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-heading font-bold text-base leading-snug">{article.headline}</h3>
                        <span className="text-xs text-muted shrink-0">{timeAgo(article.date)}</span>
                      </div>
                      <p className="text-sm text-ink-light mt-1">{article.body}</p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );

            if (article.type === "match") {
              return <Link key={article.id} href={`/dashboard/match/${article.id}`}>{inner}</Link>;
            }
            return <div key={article.id}>{inner}</div>;
          })}
        </div>
      )}
    </div>
  );
}
