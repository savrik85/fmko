"use client";

import { useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

const PREFIX_RE = /^\(\d+\) /;

export function NotificationTitle() {
  const { teamId, token } = useTeam();

  useEffect(() => {
    if (!teamId) return;

    const update = async () => {
      try {
        const [convs, votes] = await Promise.all([
          apiFetch<Array<{ unreadCount: number }>>(`/api/teams/${teamId}/conversations`),
          apiFetch<Array<{ status: string; my_answer: string | null }>>(
            "/api/votes",
            token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
          ).catch((e) => { console.warn("votes fetch:", e); return []; }),
        ]);
        const unread = convs.reduce((s, c) => s + (c.unreadCount ?? 0), 0);
        const unvoted = votes.filter((v) => v.status === "open" && v.my_answer === null).length;
        const total = unread + unvoted;

        const base = document.title.replace(PREFIX_RE, "");
        document.title = total > 0 ? `(${total}) ${base}` : base;
      } catch (e) {
        console.error("notification title fetch:", e);
      }
    };

    update();
    const interval = setInterval(update, 30000);
    return () => {
      clearInterval(interval);
      document.title = document.title.replace(PREFIX_RE, "");
    };
  }, [teamId, token]);

  return null;
}
