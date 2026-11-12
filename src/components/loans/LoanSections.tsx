import type { ReactNode } from "react";
import type { LoanStatus } from "../../../convex/lib/validators";
import { isActiveLoan } from "@/lib/loans";

interface LoanSectionsProps<T extends { _id: string; status: LoanStatus }> {
  loans: T[];
  renderLoan: (loan: T) => ReactNode;
}

/** Splits loans into "Active" (pending, approved) and "Past", keeping the given order. */
export function LoanSections<T extends { _id: string; status: LoanStatus }>({
  loans,
  renderLoan,
}: LoanSectionsProps<T>) {
  const active = loans.filter((loan) => isActiveLoan(loan.status));
  const past = loans.filter((loan) => !isActiveLoan(loan.status));

  return (
    <div className="flex flex-col gap-8">
      {[
        { title: "Active", items: active },
        { title: "Past", items: past },
      ]
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <section key={section.title} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {section.title} ({section.items.length})
            </h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((loan) => (
                <li key={loan._id}>{renderLoan(loan)}</li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
