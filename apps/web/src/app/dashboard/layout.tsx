"use client";

import { usePathname } from "next/navigation";
import { FMSidebar } from "@/components/dashboard/fm-sidebar";
import { FMTopBar } from "@/components/dashboard/fm-topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { PageHeader } from "@/components/dashboard/page-header";

const DETAIL_PREFIXES = ["/dashboard/player/", "/dashboard/team/", "/dashboard/match/"];
const CUSTOM_HEADER_PAGES = ["/dashboard/liga", "/dashboard/schedule"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetailPage = DETAIL_PREFIXES.some((p) => pathname.startsWith(p) && pathname !== p.slice(0, -1));
  const hasCustomHeader = CUSTOM_HEADER_PAGES.includes(pathname);

  return (
    <div className="min-h-screen flex bg-paper">
      <FMSidebar />

      <div className="flex-1 flex flex-col min-w-0 pb-20 sm:pb-0">
        <FMTopBar />
        {!isDetailPage && !hasCustomHeader && <PageHeader />}
        <main className="flex-1">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
