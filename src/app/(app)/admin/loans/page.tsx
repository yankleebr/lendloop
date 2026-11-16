import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminLoansView } from "@/components/admin/AdminLoansView";

export const metadata: Metadata = { title: "Admin: loans" };

export default async function AdminLoansPage() {
  await auth.protect();
  return (
    <AdminGate>
      <AdminLoansView />
    </AdminGate>
  );
}
