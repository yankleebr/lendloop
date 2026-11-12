"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { ToolCategory } from "../../../convex/lib/validators";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { CategoryFilter } from "./CategoryFilter";
import { ToolCard } from "./ToolCard";
import { ToolGridSkeleton } from "./ToolGridSkeleton";

export function AllToolsView() {
  const { user } = useCurrentUser();
  const [category, setCategory] = useState<ToolCategory | undefined>(undefined);
  // "skip" until users.store has created the row (list uses requireUser).
  const tools = useQuery(api.tools.list, user ? { category } : "skip");

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">All tools</h1>
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
                isMine={tool.isMine}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
