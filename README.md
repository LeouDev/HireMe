# Hire Me!

A marketplace for skilled workers in the Philippines (launching in Cebu). Customers find professionals, request quotations, sign contracts, book and pay. Professionals get a shareable page (`/pro/your-name`) and a dashboard for inquiries, quotations, contracts, availability and bookings.

> **Status:** MVP feature-complete in code, with a deployed and verified database. Online payments run in PayMongo **test mode** once credentials are added. Live payments are locked until the merchant arrangement is approved (see [Payments](#payments-paymongo)).

---

## Contents

- [Architecture](#architecture)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Supabase setup](#supabase-setup)
- [Payments (PayMongo)](#payments-paymongo)
- [Security model](#security-model)
- [Testing](#testing)
- [Deployment (Vercel)](#deployment-vercel)
- [Implementation status](#implementation-status)
- [Known limitations](#known-limitations)
- [Pre-launch checklist](#pre-launch-checklist)

---

## Architecture

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript (strict), Vite 8, Tailwind CSS 4, React Router 8, TanStack Query 5, React Hook Form + Zod |
| Backend | Supabase: Postgres 17, Auth, Storage, Realtime, Row Level Security |
| Server functions | Vercel Functions (`api/`): PayMongo checkout, webhook, refunds, cron, sitemap |
| Payments | PayMongo Checkout Sessions API + signed webhooks |
| Tests | Vitest; database tests run the real migrations in PGlite (Postgres compiled to WASM) |

**Where business rules live.** Workflow rules run in Postgres, not in the browser:

- Every status change goes through a `SECURITY DEFINER` function that checks who the caller is and whether the transition is allowed. This covers requests, quotations, contracts, bookings, payments, reviews, verification and admin actions.
- Clients can only write the columns they're explicitly granted (column-level `GRANT`s). Status, totals, ratings and verification flags are never client-writable.
- Quotation totals are computed by triggers from the line items, in **integer centavos**.
- A Postgres exclusion constraint makes double-booking impossible, even under concurrent requests.
- Accepted quotations, contract versions and signatures are immutable. Updates and deletes are rejected by triggers.

```
src/
  app/            router (every page lazy-loaded), dashboard navigation
  components/ui/  design system: Button, Card, Field/Input, Dialog, Badge, EmptyState…
  features/       data hooks and shared feature components (auth, catalog, bookings, messaging, workflow, payments)
  layouts/        PublicLayout, DashboardShell (icon rail + right rail)
  lib/            supabase client + generated types, money/date formatting, storage helpers, error messages
  pages/          public, auth, customer, pro, shared (role-aware detail pages), admin
shared/money.ts   integer-centavo money helpers (used by browser and server)
api/              Vercel Functions; api/_lib holds PayMongo adapter, payment logic, Supabase store
supabase/migrations/  the schema; the single source of truth
tests/            db (migrations, RLS, workflows), payments (webhooks, idempotency, refunds)
```

**Routes.** Public: `/`, `/explore`, `/categories`, `/category/:slug`, `/pro/:slug`, `/pro/:slug/services/:serviceSlug`, `/pro/:slug/request`, `/pro/:slug/book/:serviceSlug`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/become-a-pro`, `/help`, `/terms`, `/privacy`.
Customer: `/dashboard/*`. Professional: `/pro-dashboard/*`. Admin: `/admin/*`.
Service pages use `/pro/:slug/services/:serviceSlug` instead of `/services/:slug`, because service slugs are only unique per professional. Notification links such as `/bookings/:id` redirect to the right dashboard.

**Design.** Monochrome UI: charcoal dashboard shell, white content cards, black/white primary actions. The only brand color is the orange "!" in the logo (Sora wordmark, navy `#1B2431`). Design tokens live in `src/index.css`.

---

## Local development

Requirements: Node 22+, npm.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API; the publishable key works), then start the app:

```bash
npm run dev
```

The frontend works against the hosted Supabase project. The `api/` functions need the Vercel runtime. To run them locally, link the project and use `vercel dev`:

```bash
vercel link
```

```bash
vercel dev
```

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on :5173 |
| `npm test` | All tests (database, payments, unit) |
| `npm run typecheck` | `tsc -b` for app, server and tests |
| `npm run lint` | ESLint |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run gen:types` | Regenerate `src/lib/database.types.ts` from Supabase |
| `npm run db:fingerprint` | Hash of functions, policies, columns and grants after running the migrations locally |

---

## Environment variables

See `.env.example`. **Never prefix server secrets with `VITE_`**, because Vite bundles every `VITE_` variable into the browser.

| Variable | Where | Required | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | browser | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | yes | Supabase anon/publishable key (safe to expose; RLS protects data) |
| `VITE_PUBLIC_APP_URL` | browser | recommended | Canonical site URL for SEO and share links |
| `SUPABASE_URL` | server | yes | Same project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server | yes | Service role, used only in `api/` for payment state |
| `PUBLIC_APP_URL` | server | yes | Builds PayMongo return URLs, sitemap and robots |
| `PAYMONGO_SECRET_KEY` | server | for payments | `sk_test_…` in development |
| `PAYMONGO_WEBHOOK_SECRET` | server | for payments | `whsk_…` from the webhook you register |
| `PAYMONGO_LIVE_APPROVED` | server | no | Must be `true` before an `sk_live_` key is accepted |
| `PAYMONGO_PAYMENT_METHODS` | server | no | Comma list, default `card,gcash,paymaya` |
| `CRON_SECRET` | server | yes on Vercel | Protects `/api/cron/expire` |

Email provider variables are not used yet. Transactional email is not implemented, and the app doesn't claim to send it.

---

## Supabase setup

Project: `ljzbigcsrosbqwsvgdrh` ("Hire ME!", ap-southeast-1).

### Migrations

`supabase/migrations/` is the schema:

| File | Contents | Remote status |
| --- | --- | --- |
| `20261011233739_foundation.sql` | privileges, accounts, roles, settings, categories, plans, professional profiles, services, portfolio, availability, favorites | applied |
| `20261011233851_requests_messaging.sql` | service requests, attachments, conversations, messages, notifications, audit log | applied |
| `20261011234117_quotes_contracts_bookings.sql` | quotations and items, contracts, versions, signatures, bookings | applied |
| `20261011234301_payments_trust_admin.sql` | payment records, webhook events, refunds, disputes, reviews, reports, verification, admin RPCs, expiry job | applied |
| `20261011234348_storage.sql` | buckets and storage policies | applied |
| `20261011234454_search_availability.sql` | marketplace search, appointment slots, dashboard counters | applied |
| `20261012001830_profile_visibility_dispute_refunds.sql` | booking parties can see each other's name; dispute cancellations queue refund review | applied |
| `20261012030000_rls_performance.sql` | advisor-recommended policy rewrites and FK indexes (no access changes) | **pending — needs approval** |

After applying migrations 1–7, the remote schema was verified against the locally tested one. The hashes of every function body, RLS policy, column and grant matched exactly.

To apply pending migrations with the CLI, using an account that has access to the project:

```bash
supabase link --project-ref ljzbigcsrosbqwsvgdrh
```

```bash
supabase db push
```

### Auth configuration (Dashboard → Authentication)

- **Site URL:** your production URL (for example `https://hire-me-marketplace.vercel.app`).
- **Redirect URLs:** add `http://localhost:5173/**` and `https://<your-domain>/**`. Sign-up confirmation goes to `/login?verified=1…`, password reset to `/reset-password`.
- **Email confirmation:** keep enabled. Supabase's built-in email sender is heavily rate-limited, so configure custom SMTP before launch.
- Roles: every account can hire. Becoming a professional creates a `professional_profiles` row through `become_professional()`. The sign-up "intent" only decides where the person lands next; it never grants anything.

### Make someone an administrator

Admin rights can only be granted with trusted SQL (SQL editor or service role), never from the app:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com';
```

### Storage buckets

| Bucket | Public | Contents | Access |
| --- | --- | --- | --- |
| `public-media` | yes | profile photos, covers, service and portfolio images | owners write under `{user_id}/` |
| `request-files` | no | job photos, videos, PDFs | the request's customer and professional (`{request_id}/`) |
| `message-files` | no | chat attachments | conversation participants (`{conversation_id}/`) |
| `verification-docs` | no | identity and license documents | the professional and admins, via time-limited signed URLs |

Uploads are checked by size and by **file signature (magic bytes)**, not by extension. Buckets also enforce MIME and size limits. Signed contracts are not stored as files: the immutable version lives in `contract_versions` and is rendered on demand (Print / Save as PDF).

### Realtime

`messages` and `notifications` are in the `supabase_realtime` publication. Subscriptions respect RLS.

---

## Payments (PayMongo)

### What is implemented

- **Checkout:** `POST /api/payments/checkout` (`api/payments/checkout.ts`).
  - The server verifies the caller's Supabase token.
  - The SQL function `payment_prepare_checkout` validates the booking, checks that the caller is its customer, and reads the **amount from the database**. The browser never sends an amount.
  - A PayMongo Checkout Session is then created with `Idempotency-Key = payment record id`.
  - Repeated clicks reuse the open session, and expired sessions are replaced.
- **Webhook:** `POST /api/payments/webhook`.
  - Verifies `Paymongo-Signature` (`t`, `te`, `li`) as HMAC-SHA256 of `t.rawBody`, using a constant-time comparison.
  - Requires the payload's `livemode` to match the mode that signed it.
  - Stores each event id once, so duplicate deliveries are acknowledged and skipped.
  - Before recording success, it **re-reads the checkout session from PayMongo** and checks the paid amount.
  - Handles `checkout_session.payment.paid`, `payment.paid`, `payment.failed`, `payment.refunded` and `payment.refund.updated`.
- **Return page:** `/payments/return` never trusts the URL. It calls `POST /api/payments/sync`, which asks PayMongo again.
- **Refunds:** cancelling a paid booking, or resolving a dispute as cancelled, creates a refund in `pending_review`. **No money moves automatically.** An admin approves the refund, then `POST /api/payments/refund` calls PayMongo `POST /v1/refunds` with an idempotency key.
- Booking status and payment status are separate fields. A booking may have several payment attempts (`payment_records`). Card data never touches this system.

### Setup (test mode)

1. In the PayMongo dashboard, copy the **test** secret key into `PAYMONGO_SECRET_KEY`.
2. Register a webhook pointing to `https://<your-domain>/api/payments/webhook` for the five events above. Put the returned `whsk_…` secret in `PAYMONGO_WEBHOOK_SECRET`.
3. Enable the payment methods you want in PayMongo and list them in `PAYMONGO_PAYMENT_METHODS`.
4. Test with PayMongo's test cards and e-wallet simulators. Confirm in Supabase that `payment_webhook_events` rows are processed.

### Blocked pending PayMongo approval

The platform serves many independent professionals. A standard PayMongo merchant account **does not by itself** authorize collecting money on their behalf, splitting payments, escrow, or payouts. PayMongo documents `split_payment` only for "PayMongo Seeds" merchants. Before going live, confirm the model with PayMongo:

- **Model A:** the platform collects and pays out the professional's share (needs PayMongo's platform/split arrangement).
- **Model B:** each professional uses their own merchant account (needs per-professional key management; not built).
- **Model C:** the platform collects a deposit only, and the balance is paid directly as agreed in the contract. The code already supports this through each quotation's "deposit %".

Until then, `sk_live_` keys are refused unless `PAYMONGO_LIVE_APPROVED=true`. Instant bookings can be switched to "pay on site" with the admin setting `instant_booking_payment_mode`.

**Needs sandbox verification:** the refund endpoint path (`/v1/refunds`; PayMongo's reference page omits the version prefix) and the refund response fields.

---

## Security model

- **RLS on every table.** Policies scope rows to their parties: customer, the professional's profile, conversation participants, admins. Supabase's default "grant everything to anon/authenticated" is revoked and replaced by an explicit allow-list, including column-level grants.
- **Function privileges.** `EXECUTE` is revoked from `PUBLIC` by default. Anonymous visitors can call only 7 read-only functions (search, slots, public reviews, three policy helpers). A test asserts this list.
- **Nothing trusted from the browser:** user ids come from `auth.uid()`; prices from quotations and services; statuses from transition functions; payment state only from verified PayMongo data; admin rights from `user_roles`.
- **Bugs found and fixed by the tests:** a NULL comparison that let non-parties pass a party check, and the global `EXECUTE`-to-`PUBLIC` default that per-schema revokes can't remove.
- **Rate limits:** 20 messages per minute and 10 requests per hour per user, enforced in the database. Admin actions are written to `audit_logs`.
- **Private data:** request addresses are visible only to the two parties. Public reviews show a first name and last initial. Admins can't read messages.
- **Headers:** `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and `noindex` on dashboards (`vercel.json`).

---

## Testing

```bash
npm test
```

**47 tests, all passing** on the last run:

- `tests/db/migrations.test.ts`: migrations apply to a fresh Postgres.
- `tests/db/workflow.test.ts` (31 tests): the full MVP journey and its security boundaries. Profile publishing, plan limits and price validation; search; requests and controlled transitions; messaging access, impersonation and rate limits; quotation totals, revisions, expiry and acceptance; contract signing on exact versions and immutability; payments (server-only, idempotent); instant booking and the overlap constraint; reviews; admin authorization and verification; storage isolation; the anonymous function allow-list.
- `tests/payments/payments.test.ts` (9 tests): webhook signatures, forged and mode-mismatched events, "not paid until PayMongo says so", amount mismatch, duplicate deliveries, sync authorization, and the refund approval/execution flow. All run against the real SQL functions with a fake PayMongo.
- `shared/money.test.ts`, `src/pages/pro/helpers.test.ts`: money parsing and formatting, and helper unit tests.

Not automated: browser end-to-end tests of signed-in flows, and live calls to PayMongo's sandbox.

---

## Deployment (Vercel)

Vercel project: `leou-dev/hire-me-marketplace`.

1. Connect the GitHub repository (`LeouDev/HireMe`) to the Vercel project. The framework preset is Vite, configured in `vercel.json`.
2. Add the environment variables above for Production and Preview.
3. Deploy. `vercel.json` sets up the SPA rewrites, `/sitemap.xml` and `/robots.txt`, security headers, and a daily cron (`/api/cron/expire`, 18:00 UTC = 02:00 Manila).
4. Set the Supabase Auth Site URL and redirect URLs to the deployed domain.
5. Register the PayMongo webhook against the deployed URL.

---

## Implementation status

**Fully implemented and tested against the database**
- Accounts with customer and professional capabilities, server-controlled admin role, suspension.
- Professional pages: draft/publish, unique slugs, categories, service areas, FAQs, credentials, photos, sharing (Web Share API with copy fallback), SEO tags.
- Services (4 pricing models, plan limits), portfolio, availability (weekly hours, breaks, time off, notice, booking window).
- Marketplace search: keyword, category, city/service area, date, price, rating, verified, four sort orders, pagination.
- Service requests with private attachments and controlled statuses. Realtime messaging with attachments and unread counts.
- Quotation builder (labor, materials and other items; discount; tax; deposit %), revisions, view tracking, accept/reject/request changes, expiry.
- Contracts generated from accepted quotations, with amendments as new versions, signatures recorded per version with a SHA-256 fingerprint, and printable view.
- Bookings (instant and from quotations), double-booking prevention, rescheduling, cancellation by agreement, disputes, completion, reviews and ratings.
- In-app notifications (realtime, deduplicated), audit history.
- Verification submissions and admin review. Admin dashboard: users, professionals, verifications, categories, bookings, payments and refunds, disputes, reviews and reports, audit log, settings and plans.

**Implemented, awaiting credentials:** PayMongo checkout, webhook, sync and refunds (need test keys and a registered webhook); the cron job (needs `CRON_SECRET` on Vercel).

**Awaiting payment-provider approval:** live payments, and any marketplace collection, split or payout model.

**Partially implemented**
- Subscription plans: data model and display only; no paid upgrade flow.
- Contract PDF: browser "Print / Save as PDF", no server-generated PDF.
- Social previews: tags are set client-side, so crawlers that don't run JavaScript see the default tags.

**Not implemented:** transactional email, team members (Business plan), geospatial search, open requests to multiple professionals (the schema allows `professional_id` to be null for this later), a storage cleanup job for replaced images.

---

## Known limitations

- **Legal:** contract clauses, Terms and the Privacy Policy are clearly labeled drafts. They need review by Philippine counsel, including how typed-name acceptance fits the e-signature requirements of RA 8792.
- **Social previews:** professional pages are client-rendered. For rich link previews on Facebook and Messenger, add prerendering or an edge function that injects OG tags.
- **Scheduling:** times assume `Asia/Manila`. The schema stores a time zone per professional, but the UI does not yet offer others.
- **Media:** images replaced in public media remain in storage, and files in the public bucket are reachable by direct URL even while a profile is in draft.
- **Search:** text matching on city and service area; no maps.

---

## Pre-launch checklist

- [ ] Apply pending migration `20261012030000_rls_performance.sql` (`supabase db push`).
- [ ] Configure Supabase Auth Site URL, redirect URLs and custom SMTP.
- [ ] Create the first admin with the SQL above.
- [ ] Add all Vercel environment variables. Confirm no secret has a `VITE_` prefix.
- [ ] Run the full PayMongo test-mode cycle: pay, fail, retry, refund. Verify webhook delivery and the refund endpoint shape.
- [ ] Confirm the merchant/settlement model with PayMongo in writing before setting `PAYMONGO_LIVE_APPROVED=true`.
- [ ] Legal review of the contract template, Terms and Privacy Policy. Appoint a Data Protection Officer (RA 10173). Define data retention periods.
- [ ] Publish a support contact.
- [ ] Manually test every signed-in flow on a phone: request → message → quote → accept → sign → pay → complete → review.
- [ ] Check the Supabase security and performance advisors after the final migration.
