import { auth } from "@clerk/nextjs/server";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminListingsView } from "@/components/admin/AdminListingsView";

export default async function AdminListingsPage() {
  await auth.protect();
  return (
    <AdminGate>
      <AdminListingsView />
    </AdminGate>
  );
}
