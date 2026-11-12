import { auth } from "@clerk/nextjs/server";
import { IncomingRequestsView } from "@/components/loans/IncomingRequestsView";

export default async function IncomingRequestsPage() {
  await auth.protect();
  return <IncomingRequestsView />;
}
