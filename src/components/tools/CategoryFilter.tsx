"use client";

import type { ToolCategory } from "../../../convex/lib/validators";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_ITEMS } from "@/lib/tools";

const ALL = "all";
const FILTER_ITEMS = [{ value: ALL, label: "All categories" }, ...CATEGORY_ITEMS];

interface CategoryFilterProps {
  value: ToolCategory | undefined;
  onChange: (value: ToolCategory | undefined) => void;
}

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  return (
    <Select
      items={FILTER_ITEMS}
      value={value ?? ALL}
      onValueChange={(next) =>
        onChange(next === null || next === ALL ? undefined : (next as ToolCategory))
      }
    >
      <SelectTrigger aria-label="Filter by category" className="w-full sm:w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FILTER_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
