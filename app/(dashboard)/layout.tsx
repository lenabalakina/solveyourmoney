import { requireSession } from "@/server/dal/session";

export const dynamic = "force-dynamic";

export default async function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return children;
}
