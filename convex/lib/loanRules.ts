// Plain constants shared by Convex functions and the client form (safe to import anywhere).

/** Max inclusive length of a loan, in days. */
export const MAX_LOAN_DAYS = 30;
/** Latest allowed startDate, in days from (server UTC) today. */
export const MAX_ADVANCE_DAYS = 180;
/** Max pending requests one borrower may have at a time (all tools). */
export const MAX_PENDING_PER_BORROWER = 10;
/** Newest loans returned by listMyRequests / listIncoming. */
export const MAX_LOAN_LIST = 100;
/** Max periods returned by bookedPeriods. */
export const MAX_BOOKED_PERIODS = 50;
