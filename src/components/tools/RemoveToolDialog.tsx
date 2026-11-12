"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
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
import type { MyToolItem } from "@/types/tools";

interface RemoveToolDialogProps {
  /** The listing to remove; null keeps the dialog closed. */
  tool: MyToolItem | null;
  onOpenChange: (open: boolean) => void;
}

export function RemoveToolDialog({ tool, onOpenChange }: RemoveToolDialogProps) {
  const removeTool = useMutation(api.tools.remove);
  const [isRemoving, setIsRemoving] = useState(false);
  // Keep the last tool so the text stays filled during the close animation.
  const [lastTool, setLastTool] = useState(tool);
  if (tool !== null && tool !== lastTool) setLastTool(tool);
  const shownName = (tool ?? lastTool)?.name;

  async function handleRemove() {
    if (tool === null) return;
    setIsRemoving(true);
    try {
      await removeTool({ toolId: tool._id });
      toast.success("Tool removed");
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
          <AlertDialogTitle>Remove this tool?</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            &ldquo;{shownName}&rdquo; will disappear from the board and its pending requests
            will be rejected. This can&apos;t be undone.
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
