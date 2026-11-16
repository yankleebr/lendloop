import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { MyRequestsView } from "@/components/loans/MyRequestsView";

export const metadata: Metadata = { title: "My requests" };

export default async function MyRequestsPage() {
  await auth.protect();
  return <MyRequestsView />;
}
