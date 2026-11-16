import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { IncomingRequestsView } from "@/components/loans/IncomingRequestsView";

export const metadata: Metadata = { title: "Incoming requests" };

export default async function IncomingRequestsPage() {
  await auth.protect();
  return <IncomingRequestsView />;
}
