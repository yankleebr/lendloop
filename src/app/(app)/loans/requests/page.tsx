import { auth } from "@clerk/nextjs/server";
import { MyRequestsView } from "@/components/loans/MyRequestsView";

export default async function MyRequestsPage() {
  await auth.protect();
  return <MyRequestsView />;
}
