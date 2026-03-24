"use client";

import { FMSidebar } from "@/components/dashboard/fm-sidebar";
import { FMTopBar } from "@/components/dashboard/fm-topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { PageHeader } from "@/components/dashboard/page-header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-paper">
      <FMSidebar />

      <div className="flex-1 flex flex-col min-w-0 pb-20 sm:pb-0">
        <div className="sticky top-0 z-20">
          <FMTopBar />
          <PageHeader />
        </div>
        <main className="flex-1">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
