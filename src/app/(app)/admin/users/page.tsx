import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminUsersView } from "@/components/admin/AdminUsersView";

export const metadata: Metadata = { title: "Admin: users" };

export default async function AdminUsersPage() {
  await auth.protect();
  return (
    <AdminGate>
      <AdminUsersView />
    </AdminGate>
  );
}
