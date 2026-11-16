import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminListingsView } from "@/components/admin/AdminListingsView";

export const metadata: Metadata = { title: "Admin: listings" };

export default async function AdminListingsPage() {
  await auth.protect();
  return (
    <AdminGate>
      <AdminListingsView />
    </AdminGate>
  );
}
