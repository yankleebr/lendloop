"use client";

import { usePreloadedQuery, type Preloaded } from "convex/react";
import type { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_LABELS } from "@/lib/tools";

interface PublicToolListProps {
  preloaded: Preloaded<typeof api.tools.listPublic>;
}

export function PublicToolList({ preloaded }: PublicToolListProps) {
  const tools = usePreloadedQuery(preloaded);

  if (tools.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No tools listed yet. Be the first to lend one!
      </p>
    );
  }

  return (
    <ul className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <li key={tool._id}>
          <Card size="sm" className="h-full">
            <CardHeader className="gap-2">
              <CardTitle className="break-words">{tool.name}</CardTitle>
              <Badge variant="secondary">{CATEGORY_LABELS[tool.category]}</Badge>
            </CardHeader>
          </Card>
        </li>
      ))}
    </ul>
  );
}
