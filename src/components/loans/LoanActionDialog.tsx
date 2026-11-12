"use client";

import { useState } from "react";
import { toast } from "sonner";
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

export interface LoanActionCopy {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  successMessage: string;
  destructive?: boolean;
}

interface LoanActionDialogProps {
  /** What to confirm; null keeps the dialog closed. */
  action: (LoanActionCopy & { run: () => Promise<unknown> }) | null;
  onOpenChange: (open: boolean) => void;
}

/** Generic confirm step for reject / cancel / mark returned. */
export function LoanActionDialog({ action, onOpenChange }: LoanActionDialogProps) {
  const [isRunning, setIsRunning] = useState(false);
  // Keep the last copy so the text stays filled during the close animation.
  const [lastAction, setLastAction] = useState(action);
  if (action !== null && action !== lastAction) setLastAction(action);
  const shown = action ?? lastAction;

  async function handleConfirm() {
    if (action === null) return;
    setIsRunning(true);
    try {
      await action.run();
      toast.success(action.successMessage);
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <AlertDialog open={action !== null} onOpenChange={(next) => !isRunning && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{shown?.title}</AlertDialogTitle>
          <AlertDialogDescription className="break-words">{shown?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRunning}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant={shown?.destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isRunning}
          >
            {isRunning ? shown?.pendingLabel : shown?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
