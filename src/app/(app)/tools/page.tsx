import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { AllToolsView } from "@/components/tools/AllToolsView";

export const metadata: Metadata = { title: "All tools" };

export default async function AllToolsPage() {
  await auth.protect();
  return <AllToolsView />;
}
