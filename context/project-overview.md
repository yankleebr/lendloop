# 🔁 LendLoop — Project Overview

> Borrow what you need. Lend what you don't.

---

## 🧭 Table of Contents

1. [Problem and Solution](#-problem-and-solution)
2. [Users and Roles](#-users-and-roles)
3. [Features](#-features)
4. [Automation (n8n)](#-automation-n8n)
5. [Integration Security](#-integration-security)
6. [Data Model — Draft](#-data-model--draft)
7. [Tech Stack](#-tech-stack)
8. [Environments](#-environments)

---

## 🎯 Problem and Solution

**Problem:** Neighbors own tools they rarely use, while others buy tools they need only once. There is no simple, trusted place to lend and borrow them.

**Solution:** LendLoop is a simple neighborhood board where neighbors list tools they are willing to lend, request loans from each other, and receive automated notifications and reminders managed by n8n.

---

## 👥 Users and Roles

| Role | Can do |
|---|---|
| 🌐 **Visitor** (not signed in) | See the public page: tagline and a read-only list of available tools (name and category only, no owner details) |
| 🙋 **user** | Create, edit and delete **only their own** listings; request loans; approve/reject requests **only on their own tools**; act only on loans they are part of (as lender or borrower) |
| 🛠️ **admin** | Remove any listing, view all loans, mark a lender as **"Trusted Lender"** |

> Role-based access control is enforced **inside Convex functions**, not only in the UI.

---

## 🧩 Features

### A. Public page
- Company name **LendLoop** and tagline: *"Borrow what you need. Lend what you don't."*
- Read-only list of available tools (name + category only), loaded from Convex
- "Sign in to lend or borrow" button wired to Clerk

### B. Tool listings (authenticated)
Create a listing with:
- name
- category (power tools, garden, kitchen, camping, etc.)
- condition
- short description

### C. Loans (authenticated)
- Request to borrow a tool for a specific period (start/end dates)
- Owner approves or rejects requests on their own tools
- Mark a loan as returned

### D. Views (authenticated)
- All tools with availability status, filterable by category
- **My listings**, **My requests**, **Incoming requests**
- Simple, pleasant layout

### E. Admin
- Remove any listing
- View all loans
- Mark a lender as "Trusted Lender"

### F. (Bonus) Automation activity ✅
- Show recent automation activity on each loan, e.g. "Reminder sent 2 days ago"
- Implemented on *My requests*, *Incoming requests* and `/admin/loans` (latest entry inline, full history expandable; admins also see attempts and failure categories)

---

## 🤖 Automation (n8n)

### Workflow 1 — Request notification
- Trigger: a loan request is **created** or its **status changes**
- Convex calls an n8n **Webhook**
- n8n notifies the relevant user (email, Slack, Discord or a logged mock notification) using only the necessary fields

### Workflow 2 — Overdue reminders
- **Scheduled daily** at 09:00 `America/Sao_Paulo` (workflow timezone set explicitly)
- Fetches overdue loans from a Convex **HTTP endpoint**: signed `POST /n8n/v1/overdue-loans` (Convex computes "today" in UTC; ≤ 50 loans per run; skips loans already reminded today and loans with 7 reminder days)
- Sends a reminder to each borrower (Gmail); one failed email does not stop the others
- Records the reminder status back into Convex: signed, idempotent `POST /n8n/v1/reminders` (one row per loan per UTC day)
- Signed with a dedicated inbound secret (`N8N_INBOUND_SECRET` ↔ `HMAC INBOUND DEV` / `HMAC INBOUND PROD`)

### Workflow 3 — Error workflow
- Catches failed executions of Workflows 1 and 2 (Error Trigger) and emails the operator (the dedicated LendLoop Gmail account), so they are visible and never fail silently

---

## 🔐 Integration Security

Required in **both directions** (Convex → n8n and n8n → Convex):

- **Signed payloads:** HMAC with a shared secret; signatures verified on the receiving side
- **Secrets** in environment variables (Convex) and n8n credentials — never in code or exported workflow JSON
- **Idempotent writes:** retries must not create duplicate records or reminders
- **Failure handling:** retries plus an error workflow (or equivalent) so failed runs are visible

---

## 🗄️ Data Model — Draft

> ⚠️ **DRAFT** — `users`, `tools`, `loans` and `automationLogs` are implemented (see `context/features/schema-rbac.md`, `context/features/tools-public-page.md`, `context/features/loans.md`, `context/features/admin.md`, `context/features/loan-notifications.md`, `context/features/overdue-reminders.md` and `context/features/automation-activity.md`); the other tables are decided by their own specs.

```ts
// convex/schema.ts (DRAFT)
users:          { tokenIdentifier, name, email?, role: "user" | "admin", isTrustedLender }  // index by_token
                // other users see only publicUser = { _id, name, isTrustedLender }
                // isTrustedLender written only by admin.setTrustedLender
tools:          { ownerId, name, category, condition, description, isActive, removedAt?, removedBy? }
                // category/condition: fixed enums in convex/lib/validators.ts
                // isActive: false = removed (soft delete, keeps loan history intact)
                // removedAt/removedBy: set by deactivateTool (owner or admin removal)
                // indexes by_active_category, by_owner_active
                // availability is NOT stored: derived from loans at read time (getAvailability in convex/lib/tools.ts)
loans:          { toolId, borrowerId, lenderId, startDate, endDate,
                  status: "pending" | "approved" | "rejected" | "cancelled" | "returned",
                  decidedAt?, cancelledAt?, returnedAt?, closeReason?: "period_taken" | "tool_removed" }
                // startDate/endDate: "YYYY-MM-DD" strings, inclusive whole days; requested at = _creationTime
                // lenderId = tool.ownerId at request time; status changes only via transitionLoan
                // indexes by_tool_status_start, by_borrower, by_borrower_status, by_lender, by_status_end, by_status
automationLogs: { loanId, kind: "notification" | "reminder", event, recipientId, idempotencyKey,
                  reminderDate?, status: "pending" | "sent" | "failed", attempts, lastError?,
                  lastStatusCode?, occurredAt, updatedAt, nextAttemptAt?, sentAt? }
                // event: notification "loan.requested" | "loan.approved" | "loan.rejected" | "loan.cancelled"
                //        | "loan.returned"; reminder "loan.overdue"
                // idempotencyKey (unique, checked on insert): `notification:<loanId>:<event>`
                //                                             | `reminder:<loanId>:<reminderDate>`
                // reminder rows: recipient = borrower, reminderDate = UTC day, never "pending"
                // written only by emitLoanEvent (inside loan mutations), notifications.recordAttempt
                // and reminders.recordReminder
                // lastError: short code only (http_<code>, timeout, network, not_configured, event_budget,
                //            internal, loan_missing, email_failed, no_email)
                // indexes by_idempotency_key, by_loan, by_kind_status
                // read by clients ONLY through activity.forLoan (loan parties) and admin.loanActivity
                // (admins): projected DTO { key, kind, event, audience, status, at, reason (+ attempts) },
                // never raw rows (see context/features/automation-activity.md)
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui (base-nova) + lucide-react + Sonner; indigo brand palette (OKLCH tokens in `globals.css`, status map in `src/lib/status-styles.ts`), System / Light / Dark theme toggle (`data-theme`, no package) |
| Auth | Clerk |
| Data + backend | Convex (queries, mutations, actions, HTTP actions) |
| Automation | n8n Cloud |
| Validation | Convex validators (`v.*`) + Zod on the client where useful |
| Testing | Vitest + convex-test |
| Hosting | Vercel (`*.vercel.app`) |

---

## 🌎 Environments

See `CLAUDE.md` → *Environments* for the DEV/PROD split and the rules for touching PROD.
