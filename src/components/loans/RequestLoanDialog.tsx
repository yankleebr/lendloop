"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { formatPeriod, loanRequestSchema, maxEndDate, maxStartDate } from "@/lib/loans";

export interface RequestableTool {
  _id: Id<"tools">;
  name: string;
}

interface RequestLoanDialogProps {
  /** The tool to request; null keeps the dialog closed. */
  tool: RequestableTool | null;
  today: string;
  onOpenChange: (open: boolean) => void;
}

export function RequestLoanDialog({ tool, today, onOpenChange }: RequestLoanDialogProps) {
  const [isSending, setIsSending] = useState(false);
  // Keep the last tool so the content stays filled during the close animation.
  const [lastTool, setLastTool] = useState(tool);
  if (tool !== null && tool !== lastTool) setLastTool(tool);
  const shown = tool ?? lastTool;
  // New form state on every open; the form stays mounted during the close animation.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(tool !== null);
  if ((tool !== null) !== wasOpen) {
    setWasOpen(tool !== null);
    if (tool !== null) setSession((s) => s + 1);
  }

  return (
    <Dialog open={tool !== null} onOpenChange={(next) => !isSending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isSending}>
        <DialogHeader>
          <DialogTitle className="break-words">Request &ldquo;{shown?.name}&rdquo;</DialogTitle>
          <DialogDescription>
            Pick the days you need it. The owner will approve or reject your request.
          </DialogDescription>
        </DialogHeader>
        {shown && (
          <RequestLoanForm
            key={`${session}-${shown._id}`}
            tool={shown}
            today={today}
            isSending={isSending}
            setIsSending={setIsSending}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormState {
  startDate: string;
  endDate: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

interface RequestLoanFormProps {
  tool: RequestableTool;
  today: string;
  isSending: boolean;
  setIsSending: (sending: boolean) => void;
  onDone: () => void;
}

function RequestLoanForm({ tool, today, isSending, setIsSending, onDone }: RequestLoanFormProps) {
  const requestLoan = useMutation(api.loans.request);
  const [values, setValues] = useState<FormState>({ startDate: "", endDate: "" });
  const [errors, setErrors] = useState<FieldErrors>({});

  function setField(key: keyof FormState, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = loanRequestSchema(today).safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setIsSending(true);
    try {
      await requestLoan({ toolId: tool._id, ...parsed.data });
      toast.success("Request sent");
      setIsSending(false);
      onDone();
    } catch (error) {
      setIsSending(false);
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field data-invalid={errors.startDate ? true : undefined}>
          <FieldLabel htmlFor="loan-start">From</FieldLabel>
          <Input
            id="loan-start"
            type="date"
            value={values.startDate}
            min={today}
            max={maxStartDate(today)}
            onChange={(e) => setField("startDate", e.target.value)}
            aria-invalid={errors.startDate ? true : undefined}
          />
          <FieldError>{errors.startDate}</FieldError>
        </Field>
        <Field data-invalid={errors.endDate ? true : undefined}>
          <FieldLabel htmlFor="loan-end">To</FieldLabel>
          <Input
            id="loan-end"
            type="date"
            value={values.endDate}
            min={values.startDate || today}
            max={maxEndDate(values.startDate)}
            onChange={(e) => setField("endDate", e.target.value)}
            aria-invalid={errors.endDate ? true : undefined}
          />
          <FieldError>{errors.endDate}</FieldError>
        </Field>
      </FieldGroup>

      <BookedPeriods toolId={tool._id} today={today} />

      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />} disabled={isSending}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSending}>
          {isSending ? "Sending…" : "Send request"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function BookedPeriods({ toolId, today }: { toolId: Id<"tools">; today: string }) {
  const periods = useQuery(api.loans.bookedPeriods, { toolId, today });

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">Already booked</p>
      {periods === undefined ? (
        <Skeleton className="h-4 w-40" />
      ) : periods.length === 0 ? (
        <p className="text-muted-foreground">No bookings yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-muted-foreground">
          {periods.map((p) => (
            <li key={`${p.startDate}-${p.endDate}`}>{formatPeriod(p.startDate, p.endDate)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
