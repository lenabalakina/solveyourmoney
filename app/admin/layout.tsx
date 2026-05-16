import { requireAdminSession } from "@/server/dal/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSession();

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
        {children}
      </div>
    </main>
  );
}
