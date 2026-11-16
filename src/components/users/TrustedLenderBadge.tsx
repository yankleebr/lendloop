import { StyledBadge } from "@/components/status/StyledBadge";
import { TRUSTED_LENDER_STYLE } from "@/lib/status-styles";

/** Public badge for lenders an admin marked as trusted. */
export function TrustedLenderBadge() {
  return <StyledBadge style={TRUSTED_LENDER_STYLE}>Trusted Lender</StyledBadge>;
}
