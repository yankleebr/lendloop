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

### F. (Bonus) Automation activity
- Show recent automation activity on each loan, e.g. "Reminder sent 2 days ago"

---

## 🤖 Automation (n8n)

### Workflow 1 — Request notification
- Trigger: a loan request is **created** or its **status changes**
- Convex calls an n8n **Webhook**
- n8n notifies the relevant user (email, Slack, Discord or a logged mock notification) using only the necessary fields

### Workflow 2 — Overdue reminders
- **Scheduled daily**
- Fetches overdue loans from a Convex **HTTP endpoint**
- Sends a reminder to each borrower
- Records the reminder status back into Convex

### Workflow 3 — Error workflow
- Catches failed executions so they are visible and never fail silently

---

## 🔐 Integration Security

Required in **both directions** (Convex → n8n and n8n → Convex):

- **Signed payloads:** HMAC with a shared secret; signatures verified on the receiving side
- **Secrets** in environment variables (Convex) and n8n credentials — never in code or exported workflow JSON
- **Idempotent writes:** retries must not create duplicate records or reminders
- **Failure handling:** retries plus an error workflow (or equivalent) so failed runs are visible

---

## 🗄️ Data Model — Draft

> ⚠️ **DRAFT** — `users` is implemented (see `context/features/schema-rbac.md`); the other tables are decided by their own specs.

```ts
// convex/schema.ts (DRAFT)
users:          { tokenIdentifier, name, email?, role: "user" | "admin", isTrustedLender }  // index by_token
tools:          { ownerId, name, category, condition, description, isActive }
loans:          { toolId, borrowerId, lenderId, startDate, endDate,
                  status: "pending" | "approved" | "rejected" | "returned", returnedAt? }
automationLogs: { loanId, kind: "notification" | "reminder", status, idempotencyKey, createdAt }
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui (base-nova) + lucide-react + Sonner |
| Auth | Clerk |
| Data + backend | Convex (queries, mutations, actions, HTTP actions) |
| Automation | n8n Cloud |
| Validation | Convex validators (`v.*`) + Zod on the client where useful |
| Testing | Vitest + convex-test |
| Hosting | Vercel (`*.vercel.app`) |

---

## 🌎 Environments

See `CLAUDE.md` → *Environments* for the DEV/PROD split and the rules for touching PROD.
