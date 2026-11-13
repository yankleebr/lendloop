import { ShieldCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Public badge for lenders an admin marked as trusted. */
export function TrustedLenderBadge() {
  return (
    <Badge variant="secondary">
      <ShieldCheckIcon data-icon="inline-start" />
      Trusted Lender
    </Badge>
  );
}
