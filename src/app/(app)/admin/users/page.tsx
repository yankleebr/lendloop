import { auth } from "@clerk/nextjs/server";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminUsersView } from "@/components/admin/AdminUsersView";

export default async function AdminUsersPage() {
  await auth.protect();
  return (
    <AdminGate>
      <AdminUsersView />
    </AdminGate>
  );
}
