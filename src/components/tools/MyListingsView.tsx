"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToday } from "@/hooks/useToday";
import type { MyToolItem } from "@/types/tools";
import { RemoveToolDialog } from "./RemoveToolDialog";
import { ToolCard } from "./ToolCard";
import { ToolFormDialog } from "./ToolFormDialog";
import { ToolGridSkeleton } from "./ToolGridSkeleton";

export function MyListingsView() {
  const { user } = useCurrentUser();
  const today = useToday();
  // "skip" until users.store has created the row (listMine uses requireUser).
  const tools = useQuery(api.tools.listMine, user ? { today } : "skip");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MyToolItem | undefined>(undefined);
  const [removing, setRemoving] = useState<MyToolItem | null>(null);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(tool: MyToolItem) {
    setEditing(tool);
    setFormOpen(true);
  }

  const addButton = (
    <Button onClick={openCreate}>
      <PlusIcon data-icon="inline-start" />
      Add a tool
    </Button>
  );

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My listings</h1>
        {addButton}
      </div>

      {tools === undefined ? (
        <ToolGridSkeleton count={3} />
      ) : tools.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-muted-foreground">You haven&apos;t listed any tools yet.</p>
          {addButton}
        </div>
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
                actions={
                  <>
                    <Button variant="outline" size="sm" onClick={() => openEdit(tool)}>
                      <PencilIcon data-icon="inline-start" />
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setRemoving(tool)}>
                      <Trash2Icon data-icon="inline-start" />
                      Remove
                    </Button>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <ToolFormDialog open={formOpen} onOpenChange={setFormOpen} tool={editing} />
      <RemoveToolDialog
        tool={removing}
        onOpenChange={(open) => !open && setRemoving(null)}
      />
    </>
  );
}
