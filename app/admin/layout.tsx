import { Suspense } from "react";
import { requireAdminSession } from "@/server/dal/session";

async function AdminGuard({ children }: { children: React.ReactNode }) {
  await requireAdminSession();
  return <>{children}</>;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="premium-grid min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-primary/72">
            Admin
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-foreground">
            Operational visibility for SolveYourMoney
          </h1>
        </div>
        <Suspense>
          <AdminGuard>{children}</AdminGuard>
        </Suspense>
      </div>
    </main>
  );
}
