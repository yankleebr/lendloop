"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { TOOL_DESCRIPTION_MAX } from "../../../convex/lib/toolRules";
import type { ToolCategory, ToolCondition } from "../../../convex/lib/validators";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { CATEGORY_ITEMS, CONDITION_ITEMS, toolFormSchema } from "@/lib/tools";
import type { MyToolItem } from "@/types/tools";

interface FormState {
  name: string;
  category: ToolCategory | null;
  condition: ToolCondition | null;
  description: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

interface ToolFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The listing being edited; omit to create a new one. */
  tool?: MyToolItem;
}

export function ToolFormDialog({ open, onOpenChange, tool }: ToolFormDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  // New form state on every open; the form stays mounted during the close animation.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isSaving}>
        <DialogHeader>
          <DialogTitle>{tool ? "Edit tool" : "Add a tool"}</DialogTitle>
          <DialogDescription>
            {tool
              ? "Update the details neighbors see on the board."
              : "List a tool you're happy to lend to neighbors."}
          </DialogDescription>
        </DialogHeader>
        <ToolForm
          key={`${session}-${tool?._id ?? "new"}`}
          tool={tool}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface ToolFormProps {
  tool?: MyToolItem;
  isSaving: boolean;
  setIsSaving: (saving: boolean) => void;
  onDone: () => void;
}

function ToolForm({ tool, isSaving, setIsSaving, onDone }: ToolFormProps) {
  const createTool = useMutation(api.tools.create);
  const updateTool = useMutation(api.tools.update);
  const [values, setValues] = useState<FormState>({
    name: tool?.name ?? "",
    category: tool?.category ?? null,
    condition: tool?.condition ?? null,
    description: tool?.description ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = toolFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setIsSaving(true);
    try {
      if (tool) {
        await updateTool({ toolId: tool._id, ...parsed.data });
        toast.success("Changes saved");
      } else {
        await createTool(parsed.data);
        toast.success("Tool listed");
      }
      setIsSaving(false);
      onDone();
    } catch (error) {
      setIsSaving(false);
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <FieldGroup className="gap-4">
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="tool-name">Name</FieldLabel>
          <Input
            id="tool-name"
            value={values.name}
            onChange={(e) => setField("name", e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            autoComplete="off"
            placeholder="e.g. Cordless drill"
          />
          <FieldError>{errors.name}</FieldError>
        </Field>

        <Field data-invalid={errors.category ? true : undefined}>
          <FieldLabel htmlFor="tool-category">Category</FieldLabel>
          <Select
            items={CATEGORY_ITEMS}
            value={values.category}
            onValueChange={(next) => setField("category", next as ToolCategory | null)}
          >
            <SelectTrigger
              id="tool-category"
              className="w-full"
              aria-invalid={errors.category ? true : undefined}
            >
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{errors.category}</FieldError>
        </Field>

        <Field data-invalid={errors.condition ? true : undefined}>
          <FieldLabel htmlFor="tool-condition">Condition</FieldLabel>
          <Select
            items={CONDITION_ITEMS}
            value={values.condition}
            onValueChange={(next) => setField("condition", next as ToolCondition | null)}
          >
            <SelectTrigger
              id="tool-condition"
              className="w-full"
              aria-invalid={errors.condition ? true : undefined}
            >
              <SelectValue placeholder="Choose a condition" />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{errors.condition}</FieldError>
        </Field>

        <Field data-invalid={errors.description ? true : undefined}>
          <div className="flex items-baseline justify-between gap-2">
            <FieldLabel htmlFor="tool-description">Description</FieldLabel>
            <span className="text-xs text-muted-foreground tabular-nums">
              {values.description.length}/{TOOL_DESCRIPTION_MAX}
            </span>
          </div>
          <Textarea
            id="tool-description"
            value={values.description}
            onChange={(e) => setField("description", e.target.value)}
            aria-invalid={errors.description ? true : undefined}
            rows={4}
            placeholder="Optional: brand, accessories, anything to know"
          />
          <FieldError>{errors.description}</FieldError>
        </Field>
      </FieldGroup>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />} disabled={isSaving}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : tool ? "Save changes" : "List tool"}
        </Button>
      </DialogFooter>
    </form>
  );
}
