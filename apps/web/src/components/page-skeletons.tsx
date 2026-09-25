import { BrandLogo } from "@/components/brand-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function SrLoading() {
  return <span className="sr-only">İçerik yükleniyor</span>;
}

export function PageSkeletonFrame({
  children,
  titleWidth = "w-48",
}: {
  children: React.ReactNode;
  titleWidth?: string;
}) {
  return (
    <div aria-busy="true" role="status">
      <SrLoading />
      <div className="mb-5 space-y-3 sm:mb-6">
        <Skeleton className={`h-8 ${titleWidth} sm:h-9`} />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      {children}
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" role="status">
      <SrLoading />
      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 hidden h-screen max-h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
          <div className="mb-8 flex shrink-0 items-center gap-2 px-2">
            <BrandLogo size={36} />
            <div className="space-y-2">
              <Skeleton tone="onInk" className="h-4 w-20" />
              <Skeleton tone="onInk" className="h-3 w-16" />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {Array.from({ length: 16 }).map((_, i) => (
              <Skeleton key={i} tone="onInk" className="h-10 w-full shrink-0 rounded-xl" />
            ))}
          </div>
          <Skeleton tone="onInk" className="mt-3 h-28 w-full shrink-0 rounded-2xl" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b border-border px-4 sm:h-16 sm:px-6">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="hidden h-10 flex-1 rounded-full md:block" />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-10 w-28 rounded-full" />
            </div>
          </header>
          <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
            <DashboardPageSkeleton />
          </main>
        </div>
      </div>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <PageSkeletonFrame titleWidth="w-40">
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full rounded-xl" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-36" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border p-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-[70%]" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-xl" />
            ))}
          </CardContent>
        </Card>
      </div>
    </PageSkeletonFrame>
  );
}

export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <PageSkeletonFrame titleWidth="w-36">
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-40 rounded-xl" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-4"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-44 max-w-full" />
              </div>
              <div className="space-y-2 text-right">
                <Skeleton className="ml-auto h-4 w-16" />
                <Skeleton className="ml-auto h-5 w-14" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageSkeletonFrame>
  );
}

export function BillingPageSkeleton() {
  return (
    <PageSkeletonFrame titleWidth="w-32">
      <Card className="mb-4">
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="space-y-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[85%]" />
              <Skeleton className="h-4 w-[66%]" />
              <Skeleton className="mt-4 h-10 w-full rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </PageSkeletonFrame>
  );
}

export function SettingsPageSkeleton() {
  return (
    <PageSkeletonFrame titleWidth="w-28">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            ))}
            <Skeleton className="h-10 w-36 rounded-full" />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-20" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageSkeletonFrame>
  );
}

export function AuthPageSkeleton() {
  return (
    <div
      className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-10"
      aria-busy="true"
      role="status"
    >
      <SrLoading />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <BrandLogo size={44} />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6 sm:p-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          ))}
          <Skeleton className="h-11 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function NotificationsPanelSkeleton() {
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-busy="true" role="status">
      <SrLoading />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-border bg-background p-4">
          <div className="flex justify-between gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[75%]" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function OrderDetailSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" role="status">
      <SrLoading />
      <Skeleton className="h-6 w-24 rounded-full" />
      <div className="rounded-xl border border-border bg-background p-4 space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
