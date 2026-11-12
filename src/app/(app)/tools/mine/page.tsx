import { auth } from "@clerk/nextjs/server";
import { MyListingsView } from "@/components/tools/MyListingsView";

export default async function MyListingsPage() {
  await auth.protect();
  return <MyListingsView />;
}
