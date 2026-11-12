import { auth } from "@clerk/nextjs/server";
import { AllToolsView } from "@/components/tools/AllToolsView";

export default async function AllToolsPage() {
  await auth.protect();
  return <AllToolsView />;
}
