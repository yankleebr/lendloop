import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { MyListingsView } from "@/components/tools/MyListingsView";

export const metadata: Metadata = { title: "My listings" };

export default async function MyListingsPage() {
  await auth.protect();
  return <MyListingsView />;
}
