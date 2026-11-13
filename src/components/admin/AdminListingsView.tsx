"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Trash2Icon } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { ToolCategory } from "../../../convex/lib/validators";
import { CategoryFilter } from "@/components/tools/CategoryFilter";
import { ToolCard } from "@/components/tools/ToolCard";
import { ToolGridSkeleton } from "@/components/tools/ToolGridSkeleton";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToday } from "@/hooks/useToday";
import { AdminRemoveToolDialog, type RemovableTool } from "./AdminRemoveToolDialog";

export function AdminListingsView() {
  const { user } = useCurrentUser();
  const today = useToday();
  const [category, setCategory] = useState<ToolCategory | undefined>(undefined);
  const [removing, setRemoving] = useState<RemovableTool | null>(null);
  // The whole active board (tools.list); "skip" until the caller is known to be an admin.
  const tools = useQuery(api.tools.list, user?.role === "admin" ? { category, today } : "skip");

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-medium">Listings</h2>
        <CategoryFilter value={category} onChange={setCategory} />
      </div>

      {tools === undefined ? (
        <ToolGridSkeleton />
      ) : tools.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          {category ? "No tools in this category yet." : "No tools yet."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <li key={tool._id}>
              <ToolCard
                name={tool.name}
                category={tool.category}
                condition={tool.condition}
                description={tool.description}
                availability={tool.availability}
                ownerName={tool.owner.name}
                ownerTrusted={tool.owner.isTrustedLender}
                isMine={tool.isMine}
                actions={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setRemoving({
                        _id: tool._id,
                        name: tool.name,
                        ownerName: tool.isMine ? "you" : tool.owner.name,
                      })
                    }
                  >
                    <Trash2Icon data-icon="inline-start" />
                    Remove
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <AdminRemoveToolDialog
        tool={removing}
        onOpenChange={(open) => !open && setRemoving(null)}
      />
    </>
  );
}
