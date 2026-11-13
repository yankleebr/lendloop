"use client";

import type { AdminLoanFilter as Filter } from "../../../convex/lib/validators";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ADMIN_LOAN_FILTER_ITEMS } from "@/lib/admin";

interface AdminLoanFilterProps {
  value: Filter;
  onChange: (value: Filter) => void;
}

export function AdminLoanFilter({ value, onChange }: AdminLoanFilterProps) {
  return (
    <Select
      items={ADMIN_LOAN_FILTER_ITEMS}
      value={value}
      onValueChange={(next) => onChange(next === null ? "all" : (next as Filter))}
    >
      <SelectTrigger aria-label="Filter loans by status" className="w-full sm:w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ADMIN_LOAN_FILTER_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
