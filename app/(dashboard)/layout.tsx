import { connection } from "next/server";
import { requireSession } from "@/server/dal/session";

export default async function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  await requireSession();
  return children;
}
