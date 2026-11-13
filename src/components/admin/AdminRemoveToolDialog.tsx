"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getErrorMessage } from "@/lib/errors";

export interface RemovableTool {
  _id: Id<"tools">;
  name: string;
  ownerName: string;
}

interface AdminRemoveToolDialogProps {
  /** The listing to remove; null keeps the dialog closed. */
  tool: RemovableTool | null;
  onOpenChange: (open: boolean) => void;
}

export function AdminRemoveToolDialog({ tool, onOpenChange }: AdminRemoveToolDialogProps) {
  const removeTool = useMutation(api.admin.removeTool);
  const [isRemoving, setIsRemoving] = useState(false);
  // Keep the last tool so the text stays filled during the close animation.
  const [lastTool, setLastTool] = useState(tool);
  if (tool !== null && tool !== lastTool) setLastTool(tool);
  const shown = tool ?? lastTool;

  async function handleRemove() {
    if (tool === null) return;
    setIsRemoving(true);
    try {
      await removeTool({ toolId: tool._id });
      toast.success("Listing removed");
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <AlertDialog
      open={tool !== null}
      onOpenChange={(next) => !isRemoving && onOpenChange(next)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            Remove &ldquo;{shown?.name}&rdquo; by {shown?.ownerName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The listing will disappear from the board and its pending requests will be
            rejected. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleRemove} disabled={isRemoving}>
            {isRemoving ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
