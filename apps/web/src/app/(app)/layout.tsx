"use client";

import { AuthProvider } from "@/lib/use-auth";
import { AppShell } from "@/components/dashboard-shell";
import { ToastProvider } from "@/components/ui/toast";

export default function AppPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </AuthProvider>
  );
}
