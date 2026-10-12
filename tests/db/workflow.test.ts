// End-to-end MVP journey and authorization boundaries, executed against the real migrations.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFail, type TestDb } from './harness.js';

let t: TestDb;
let pro: string; // professional user id
let proId: string; // professional_profiles.id
let customer: string;
let stranger: string; // another customer
let pro2: string; // another professional
let admin: string;
let serviceId: string;
let requestId: string;
let quoteId: string;
let contractId: string;
let bookingId: string;

const one = async <T = Record<string, unknown>>(actor: string, sql: string, params?: unknown[]): Promise<T> => {
  const [row] = await t.q<T>(actor, sql, params);
  if (!row) throw new Error(`Expected a row from: ${sql}`);
  return row;
};

beforeAll(async () => {
  t = await createTestDb();
  pro = await t.createUser('juan@example.test', 'Juan Dela Cruz');
  customer = await t.createUser('maria@example.test', 'Maria Santos');
  stranger = await t.createUser('eve@example.test', 'Eve Stranger');
  pro2 = await t.createUser('pedro@example.test', 'Pedro Reyes');
  admin = await t.createUser('admin@example.test', 'Ada Admin');
  await t.makeAdmin(admin);
});

describe('professional onboarding and publishing', () => {
  it('creates a profile with a unique slug and handles collisions', async () => {
    const p = await one<{ id: string; slug: string; status: string }>(pro,
      `select * from public.become_professional('Juan Plumbing', 'Cebu City', 'juan-plumbing')`);
    proId = p.id;
    expect(p.slug).toBe('juan-plumbing');
    expect(p.status).toBe('draft');
    const p2 = await one<{ slug: string }>(pro2,
      `select * from public.become_professional('Juan Plumbing', 'Cebu City', 'juan-plumbing')`);
    expect(p2.slug).toBe('juan-plumbing-2');
  });

  it('hides draft profiles from the public', async () => {
    expect(await t.q('anon', `select id from public.professional_profiles where id = $1`, [proId])).toHaveLength(0);
    expect(await t.q(customer, `select id from public.professional_profiles where id = $1`, [proId])).toHaveLength(0);
  });

  it('blocks clients from writing trusted columns', async () => {
    await expectFail(t.q(pro, `update public.professional_profiles set verification_status = 'verified' where id = $1`, [proId]), /permission denied/);
    await expectFail(t.q(pro, `update public.professional_profiles set rating_avg = 5 where id = $1`, [proId]), /permission denied/);
    await expectFail(t.q(pro, `update public.professional_profiles set status = 'published' where id = $1`, [proId]), /permission denied/);
    await expectFail(t.q(pro, `insert into public.user_roles (user_id, role) values ($1, 'admin')`, [pro]), /permission denied/);
  });

  it('refuses to publish an incomplete profile, then publishes', async () => {
    await expectFail(t.q(pro, `select public.set_profile_published(true)`), /introduction|category|service/);
    await t.q(pro, `update public.professional_profiles set headline = 'Licensed plumber, 10 years in Cebu' where id = $1`, [proId]);
    await t.q(pro, `insert into public.professional_categories (professional_id, category_id)
                    select $1, id from public.service_categories where slug = 'plumbing'`, [proId]);
    await t.q(pro, `insert into public.professional_service_areas (professional_id, city, area) values ($1, 'Mandaue City', null)`, [proId]);
    await expectFail(t.q(pro, `insert into public.services (professional_id, name, slug, pricing_model, price_cents, status)
      values ($1, 'Bad', 'bad', 'fixed', -100, 'active')`, [proId]), /check constraint/);
    await expectFail(t.q(pro, `insert into public.services (professional_id, name, slug, pricing_model, price_cents, status)
      values ($1, 'Bad', 'bad', 'quote', 5000, 'active')`, [proId]), /services_price_matches_model/);
    // Cannot create services for someone else.
    await expectFail(t.q(stranger, `insert into public.services (professional_id, name, slug, pricing_model, price_cents)
      values ($1, 'Hijack', 'hijack', 'fixed', 100)`, [proId]), /row-level security/);
    const s = await one<{ id: string }>(pro, `insert into public.services
      (professional_id, name, slug, pricing_model, price_cents, duration_minutes, instant_booking, status)
      values ($1, 'Faucet installation', 'faucet-installation', 'fixed', 150050, 60, true, 'active') returning id`, [proId]);
    serviceId = s.id;
    await t.q(pro, `insert into public.availability_rules (professional_id, weekday, start_time, end_time)
                    select $1, d, '08:00', '12:00' from generate_series(0, 6) d`, [proId]);
    await t.q(pro, `insert into public.availability_rules (professional_id, weekday, start_time, end_time)
                    select $1, d, '13:00', '17:00' from generate_series(0, 6) d`, [proId]);
    const published = await one<{ status: string }>(pro, `select * from public.set_profile_published(true)`);
    expect(published.status).toBe('published');
  });

  it('enforces the free plan service limit', async () => {
    for (const n of [2, 3]) {
      await t.q(pro, `insert into public.services (professional_id, name, slug, pricing_model, status)
        values ($1, 'Repair ' || $2::text, 'repair-' || $2::text, 'quote', 'active')`, [proId, n]);
    }
    await expectFail(t.q(pro, `insert into public.services (professional_id, name, slug, pricing_model, status)
      values ($1, 'Repair 4', 'repair-4', 'quote', 'active')`, [proId]), /plan allows 3/);
  });
});

describe('marketplace search', () => {
  it('finds published professionals by keyword, category and service area', async () => {
    const byKeyword = await t.q<{ slug: string; starting_price_cents: string; total_count: string }>('anon',
      `select * from public.search_professionals(p_query => 'faucet')`);
    expect(byKeyword.map((r: { slug: string }) => r.slug)).toEqual(['juan-plumbing']);
    expect(Number(byKeyword[0]!.starting_price_cents)).toBe(150050);
    const byArea = await t.q('anon', `select * from public.search_professionals(p_category => 'plumbing', p_city => 'mandaue')`);
    expect(byArea).toHaveLength(1);
    const none = await t.q('anon', `select * from public.search_professionals(p_category => 'welding')`);
    expect(none).toHaveLength(0);
    // pro2 is unpublished and never appears.
    const all = await t.q<{ slug: string }>('anon', `select * from public.search_professionals()`);
    expect(all.map((r: { slug: string }) => r.slug)).not.toContain('juan-plumbing-2');
  });
});

describe('request, messaging, quotation, contract, booking, payment, review', () => {
  it('customer submits a request to the professional', async () => {
    const r = await one<{ id: string }>(customer, `select public.create_service_request(
      p_professional_id => $1, p_title => 'Kitchen sink leaking', p_description => 'Water drips under the sink cabinet.',
      p_location_city => 'Cebu City', p_location_address => '123 Private St') as id`, [proId]);
    requestId = r.id;
    const seen = await t.q(pro, `select id, location_address from public.service_requests where id = $1`, [requestId]);
    expect(seen).toHaveLength(1);
    const notif = await t.q(pro, `select type from public.notifications where type = 'request_new'`);
    expect(notif).toHaveLength(1);
  });

  it('keeps requests private from other accounts', async () => {
    expect(await t.q(stranger, `select id from public.service_requests where id = $1`, [requestId])).toHaveLength(0);
    expect(await t.q(pro2, `select id from public.service_requests where id = $1`, [requestId])).toHaveLength(0);
    expect(await t.q('anon', `select id from public.service_requests`).catch(() => [])).toHaveLength(0);
    await expectFail(t.q(stranger, `select public.transition_service_request($1, 'cancelled')`, [requestId]), /not found/);
    // Clients cannot set status directly.
    await expectFail(t.q(customer, `update public.service_requests set status = 'accepted' where id = $1`, [requestId]), /permission denied/);
  });

  it('applies controlled request transitions', async () => {
    await expectFail(t.q(customer, `select public.transition_service_request($1, 'accepted')`, [requestId]), /cannot move/);
    await t.q(pro, `select public.transition_service_request($1, 'viewed')`, [requestId]);
    await t.q(pro, `select public.transition_service_request($1, 'accepted')`, [requestId]);
    const hist = await t.q<{ to_status: string }>(customer,
      `select to_status from public.audit_logs where entity_type = 'service_request' and entity_id = $1 order by id`, [requestId]);
    expect(hist.map((h: { to_status: string }) => h.to_status)).toEqual(['submitted', 'viewed', 'accepted']);
  });

  it('lets only participants read and send messages', async () => {
    const conv = await one<{ id: string }>(customer, `select id from public.conversations where request_id = $1`, [requestId]);
    await t.q(customer, `insert into public.messages (conversation_id, body) values ($1, 'Hello, when can you come?')`, [conv.id]);
    await t.q(pro, `insert into public.messages (conversation_id, body) values ($1, 'Tomorrow morning works.')`, [conv.id]);
    expect(await t.q(stranger, `select id from public.messages where conversation_id = $1`, [conv.id])).toHaveLength(0);
    await expectFail(t.q(stranger, `insert into public.messages (conversation_id, body) values ($1, 'spam')`, [conv.id]), /row-level security/);
    // Cannot impersonate a sender.
    await expectFail(t.q(customer, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'fake')`, [conv.id, pro]), /row-level security/);
    // Attachment paths must live under the conversation folder.
    await expectFail(t.q(customer, `insert into public.messages (conversation_id, attachments)
      values ($1, '[{"path":"someone-else/file.pdf"}]')`, [conv.id]), /Invalid attachment/);
    const list = await t.q<{ unread_count: string }>(pro, `select * from public.my_conversations()`);
    expect(Number(list[0]!.unread_count)).toBe(0); // pro replied after the customer's message
    const custList = await t.q<{ unread_count: string; counterpart_name: string }>(customer, `select * from public.my_conversations()`);
    expect(Number(custList[0]!.unread_count)).toBe(1);
    expect(custList[0]!.counterpart_name).toBe('Juan Plumbing');
  });

  it('rate-limits message floods', async () => {
    const conv = await one<{ id: string }>(customer, `select id from public.conversations where request_id = $1`, [requestId]);
    await expectFail(t.as(customer, async (tx: import('@electric-sql/pglite').Transaction) => {
      for (let i = 0; i < 25; i++) {
        await tx.query(`insert into public.messages (conversation_id, body) values ($1, 'flood')`, [conv.id]);
      }
    }), /too quickly/);
  });

  it('computes quotation totals on the server in integer centavos', async () => {
    const q = await one<{ id: string }>(pro, `select public.create_quotation($1) as id`, [requestId]);
    quoteId = q.id;
    await t.q(pro, `insert into public.quotation_items (quotation_id, kind, description, quantity, unit_price_cents)
      values ($1, 'labor', 'Labor', 2.5, 33333), ($1, 'material', 'P-trap', 1, 45000), ($1, 'other', 'Transport', 1, 10000)`, [quoteId]);
    await t.q(pro, `update public.quotations set discount_cents = 5000, tax_rate_bp = 1200, deposit_percent = 30,
      estimated_duration_minutes = 120, proposed_start = now() + interval '3 days' where id = $1`, [quoteId]);
    const row = await one<{ subtotal_cents: string; tax_cents: string; total_cents: string }>(pro,
      `select subtotal_cents, tax_cents, total_cents from public.quotations where id = $1`, [quoteId]);
    // 2.5 * 33333 = 83332.5 -> 83333; subtotal 138333; taxable 133333; tax 16000 (15999.96); total 149333
    expect(Number(row.subtotal_cents)).toBe(138333);
    expect(Number(row.tax_cents)).toBe(16000);
    expect(Number(row.total_cents)).toBe(149333);
    await expectFail(t.q(pro, `update public.quotations set total_cents = 1 where id = $1`, [quoteId]), /permission denied/);
    // Customer cannot see the draft.
    expect(await t.q(customer, `select id from public.quotations where id = $1`, [quoteId])).toHaveLength(0);
  });

  it('sends, locks and lets the customer request a revision', async () => {
    await expectFail(t.q(stranger, `select public.send_quotation($1)`, [quoteId]), /not found/);
    await t.q(pro, `select public.send_quotation($1)`, [quoteId]);
    await expectFail(t.q(pro, `insert into public.quotation_items (quotation_id, kind, description, quantity, unit_price_cents)
      values ($1, 'labor', 'Sneaky', 1, 1)`, [quoteId]), /row-level security|Only draft/);
    expect(await t.q(stranger, `select id from public.quotations where id = $1`, [quoteId])).toHaveLength(0);
    await t.q(customer, `select public.mark_quotation_viewed($1)`, [quoteId]);
    await t.q(customer, `select public.customer_quotation_decision($1, 'revision_requested', 'Can you lower transport?')`, [quoteId]);
    await expectFail(t.q(customer, `select public.accept_quotation($1)`, [quoteId]), /revision_requested/);
  });

  it('creates a revision that supersedes the original', async () => {
    const r = await one<{ id: string }>(pro, `select public.revise_quotation($1) as id`, [quoteId]);
    await t.q(pro, `update public.quotation_items set unit_price_cents = 5000 where quotation_id = $1 and kind = 'other'`, [r.id]);
    await t.q(pro, `select public.send_quotation($1)`, [r.id]);
    const old = await one<{ status: string }>(customer, `select status from public.quotations where id = $1`, [quoteId]);
    expect(old.status).toBe('superseded');
    await expectFail(t.q(customer, `select public.accept_quotation($1)`, [quoteId]), /superseded/);
    const rev = await one<{ revision: number; total_cents: string }>(customer, `select revision, total_cents from public.quotations where id = $1`, [r.id]);
    expect(rev.revision).toBe(2);
    expect(Number(rev.total_cents)).toBe(143733); // taxable 128333, tax 15400 (15399.96)
    quoteId = r.id;
  });

  it('only the customer can accept; acceptance freezes the quote and creates contract + booking', async () => {
    await expectFail(t.q(stranger, `select public.accept_quotation($1)`, [quoteId]), /not found/);
    await expectFail(t.q(pro, `select public.accept_quotation($1)`, [quoteId]), /not found/);
    const res = await one<{ r: { booking_id: string; contract_id: string } }>(customer, `select public.accept_quotation($1) as r`, [quoteId]);
    bookingId = res.r.booking_id;
    contractId = res.r.contract_id;
    const b = await one<{ status: string; amount_total_cents: string; amount_due_now_cents: string }>(customer,
      `select status, amount_total_cents, amount_due_now_cents from public.bookings where id = $1`, [bookingId]);
    expect(b.status).toBe('awaiting_contract');
    expect(Number(b.amount_total_cents)).toBe(143733);
    expect(Number(b.amount_due_now_cents)).toBe(43120); // 30% of 143733 = 43119.9
    await expectFail(t.q('service', `update public.quotations set title = 'changed' where id = $1`, [quoteId]), /cannot be changed/);
    expect(await t.q(stranger, `select id from public.contracts where id = $1`, [contractId])).toHaveLength(0);
    expect(await t.q(stranger, `select id from public.contract_versions where contract_id = $1`, [contractId])).toHaveLength(0);
  });

  it('records signatures on an exact version and keeps versions immutable', async () => {
    await expectFail(t.q(customer, `select public.sign_contract($1, 1, 'Maria Santos', false)`, [contractId]), /agree/);
    await expectFail(t.q(stranger, `select public.sign_contract($1, 1, 'Eve', true)`, [contractId]), /not found/);
    await t.q(customer, `select public.sign_contract($1, 1, 'Maria Santos', true)`, [contractId]);
    await expectFail(t.q(customer, `select public.sign_contract($1, 1, 'Maria Santos', true)`, [contractId]), /already signed/);
    // An amendment creates version 2; the customer's v1 signature no longer completes the contract.
    await t.q(pro, `select public.amend_contract($1, '{"additional":"Customer provides parking."}'::jsonb)`, [contractId]);
    await expectFail(t.q(pro, `select public.sign_contract($1, 1, 'Juan Dela Cruz', true)`, [contractId]), /newer version/);
    await t.q(pro, `select public.sign_contract($1, 2, 'Juan Dela Cruz', true)`, [contractId]);
    let c = await one<{ status: string }>(customer, `select status from public.contracts where id = $1`, [contractId]);
    expect(c.status).toBe('partially_signed');
    await t.q(customer, `select public.sign_contract($1, 2, 'Maria Santos', true)`, [contractId]);
    c = await one<{ status: string }>(customer, `select status from public.contracts where id = $1`, [contractId]);
    expect(c.status).toBe('signed');
    await expectFail(t.q('service', `update public.contract_versions set content = '{}' where contract_id = $1`, [contractId]), /immutable/);
    await expectFail(t.q('service', `delete from public.contract_signatures`), /immutable/);
    const b = await one<{ status: string }>(customer, `select status from public.bookings where id = $1`, [bookingId]);
    expect(b.status).toBe('awaiting_payment');
  });

  it('keeps payment state server-only and applies verified payments idempotently', async () => {
    await expectFail(t.q(customer, `select public.payment_mark_paid(gen_random_uuid(), 'pay_x', 1, now())`), /permission denied/);
    await expectFail(t.q(customer, `update public.bookings set status = 'confirmed' where id = $1`, [bookingId]), /permission denied/);
    await expectFail(t.q('service', `select * from public.payment_prepare_checkout($1, $2)`, [bookingId, stranger]), /not found/);
    const rec = await one<{ id: string; amount_cents: string }>('service',
      `select * from public.payment_prepare_checkout($1, $2)`, [bookingId, customer]);
    expect(Number(rec.amount_cents)).toBe(43120);
    // A second attempt reuses the pending record instead of duplicating it.
    const again = await one<{ id: string }>('service', `select * from public.payment_prepare_checkout($1, $2)`, [bookingId, customer]);
    expect(again.id).toBe(rec.id);
    await t.q('service', `select public.payment_attach_checkout($1, 'cs_test_1', 'pi_test_1', 'https://checkout.example/cs_test_1', false)`, [rec.id]);
    await expectFail(t.q('service', `select public.payment_mark_paid($1, 'pay_1', 100, now())`, [rec.id]), /does not match/);
    await t.q('service', `select public.payment_mark_paid($1, 'pay_1', 43120, now())`, [rec.id]);
    await t.q('service', `select public.payment_mark_paid($1, 'pay_1', 43120, now())`, [rec.id]); // duplicate webhook
    const b = await one<{ status: string; payment_status: string; amount_paid_cents: string }>(customer,
      `select status, payment_status, amount_paid_cents from public.bookings where id = $1`, [bookingId]);
    expect(b).toMatchObject({ status: 'confirmed', payment_status: 'deposit_paid' });
    expect(Number(b.amount_paid_cents)).toBe(43120);
    expect(await t.q(stranger, `select id from public.payment_records where booking_id = $1`, [bookingId])).toHaveLength(0);
    const notes = await t.q(customer, `select id from public.notifications where type = 'payment_paid'`);
    expect(notes).toHaveLength(1);
  });

  it('records webhook deliveries once', async () => {
    const first = await one<{ r: string }>('service', `select public.webhook_event_begin('evt_1', 'checkout_session.payment.paid', false, '{}') as r`);
    expect(first.r).toBe('new');
    expect((await one<{ r: string }>('service', `select public.webhook_event_begin('evt_1', 'x', false, '{}') as r`)).r).toBe('retry');
    await t.q('service', `select public.webhook_event_finish('evt_1', null)`);
    expect((await one<{ r: string }>('service', `select public.webhook_event_begin('evt_1', 'x', false, '{}') as r`)).r).toBe('duplicate');
    await expectFail(t.q(customer, `select * from public.payment_webhook_events`), /permission denied/);
  });

  it('runs the job through an authorized workflow and accepts one review', async () => {
    await expectFail(t.q(customer, `select public.submit_review($1, 5, 'Great')`, [bookingId]), /after the job is completed/);
    await expectFail(t.q(customer, `select public.booking_action($1, 'complete')`, [bookingId]), /professional/);
    await t.q(pro, `select public.booking_action($1, 'start')`, [bookingId]);
    await t.q(pro, `select public.booking_action($1, 'complete')`, [bookingId]);
    await expectFail(t.q(stranger, `select public.submit_review($1, 1, 'Fake')`, [bookingId]), /not found/);
    await t.q(customer, `select public.submit_review($1, 4, 'Fixed quickly and explained everything.')`, [bookingId]);
    await expectFail(t.q(customer, `select public.submit_review($1, 5, 'Again')`, [bookingId]), /already reviewed/);
    const p = await one<{ rating_avg: string; review_count: number }>('anon',
      `select rating_avg, review_count from public.professional_profiles where id = $1`, [proId]);
    expect(Number(p.rating_avg)).toBe(4);
    expect(p.review_count).toBe(1);
    const reviews = await t.q<{ reviewer_name: string }>('anon', `select * from public.get_professional_reviews($1)`, [proId]);
    expect(reviews[0]!.reviewer_name).toBe('Maria S.');
  });
});

describe('instant booking and double-booking protection', () => {
  it('books an available slot and rejects a conflicting one', async () => {
    const slots = await t.q<{ s: string }>(customer, `select s from public.get_available_slots($1, public.today_manila() + 5, public.today_manila() + 5, 60) s`, [proId]);
    expect(slots.length).toBeGreaterThan(0);
    const start = slots[0]!.s;
    const id = await one<{ id: string }>(customer,
      `select public.create_instant_booking($1, $2, 'Cebu City', '45 Mango Ave') as id`, [serviceId, start]);
    const b = await one<{ status: string; amount_due_now_cents: string }>(customer,
      `select status, amount_due_now_cents from public.bookings where id = $1`, [id.id]);
    expect(b.status).toBe('awaiting_payment');
    expect(Number(b.amount_due_now_cents)).toBe(150050);
    await expectFail(t.q(stranger, `select public.create_instant_booking($1, $2, 'Cebu City', '1 Other St')`, [serviceId, start]), /no longer available/);
    const after = await t.q<{ s: string }>(customer, `select s from public.get_available_slots($1, public.today_manila() + 5, public.today_manila() + 5, 60) s`, [proId]);
    expect(after.map((r: { s: string }) => r.s)).not.toContain(start);
  });

  it('the exclusion constraint blocks overlaps even when inserted directly', async () => {
    await expectFail(t.q('service', `insert into public.bookings (booking_type, customer_id, professional_id, scheduled_start, scheduled_end,
        status, amount_total_cents, amount_due_now_cents)
      select 'instant', $2, $1, scheduled_start + interval '10 minutes', scheduled_end + interval '10 minutes', 'confirmed', 100, 0
        from public.bookings where professional_id = $1 and status = 'awaiting_payment' limit 1`, [proId, stranger]), /bookings_no_overlap/);
  });
});

describe('expiry and cancellation', () => {
  it('will not accept an expired quotation', async () => {
    const r = await one<{ id: string }>(customer, `select public.create_service_request(p_professional_id => $1,
      p_title => 'Water heater', p_description => 'Heater does not turn on.', p_location_city => 'Cebu City') as id`, [proId]);
    const q = await one<{ id: string }>(pro, `select public.create_quotation($1) as id`, [r.id]);
    await t.q(pro, `insert into public.quotation_items (quotation_id, kind, description, quantity, unit_price_cents) values ($1, 'labor', 'Diagnose', 1, 50000)`, [q.id]);
    await t.q(pro, `update public.quotations set estimated_duration_minutes = 60, proposed_start = now() + interval '10 days' where id = $1`, [q.id]);
    await t.q(pro, `select public.send_quotation($1)`, [q.id]);
    await t.db.query(`update public.quotations set valid_until = public.today_manila() - 1 where id = $1`, [q.id]);
    await expectFail(t.q(customer, `select public.accept_quotation($1)`, [q.id]), /expired/);
    const res = await one<{ r: { quotations: number } }>('service', `select public.expire_stale_records() as r`);
    expect(res.r.quotations).toBeGreaterThanOrEqual(1);
  });

  it('cancels unpaid bookings directly and confirmed ones by mutual agreement', async () => {
    const pending = await one<{ id: string }>(customer,
      `select id from public.bookings where customer_id = $1 and status = 'awaiting_payment'`, [customer]);
    await expectFail(t.q(customer, `select public.booking_action($1, 'cancel')`, [pending.id]), /reason/);
    const b = await one<{ status: string }>(customer, `select (public.booking_action($1, 'cancel', 'Changed my mind')).status`, [pending.id]);
    expect(b.status).toBe('cancelled');
  });
});

describe('administration', () => {
  it('rejects non-admins on every admin entry point', async () => {
    await expectFail(t.q(customer, `select public.admin_overview()`), /Administrator/);
    await expectFail(t.q(pro, `select * from public.admin_list_users()`), /Administrator/);
    await expectFail(t.q(pro, `select public.admin_set_user_suspended($1, true, 'x')`, [customer]), /Administrator/);
  });

  it('lets an admin review verification without exposing documents to others', async () => {
    await t.q(pro, `insert into storage.objects (bucket_id, name) values ('verification-docs', $1 || '/id-front.jpg')`, [pro]);
    await expectFail(t.q(stranger, `insert into storage.objects (bucket_id, name) values ('verification-docs', $1 || '/x.jpg')`, [pro]), /row-level security/);
    expect(await t.q(stranger, `select name from storage.objects where bucket_id = 'verification-docs'`)).toHaveLength(0);
    expect(await t.q(admin, `select name from storage.objects where bucket_id = 'verification-docs'`)).toHaveLength(1);
    await expectFail(t.q(pro, `select public.submit_verification('identity', array[$1 || '/x.jpg'], null)`, [stranger]), /Invalid document/);
    const v = await one<{ id: string }>(pro, `select public.submit_verification('identity', array[$1 || '/id-front.jpg'], 'PhilSys ID') as id`, [pro]);
    let p = await one<{ verification_status: string }>(pro, `select verification_status from public.professional_profiles where id = $1`, [proId]);
    expect(p.verification_status).toBe('pending');
    await t.q(admin, `select public.admin_review_verification($1, true, null)`, [v.id]);
    p = await one<{ verification_status: string; verified_kinds: string[] }>('anon',
      `select verification_status, verified_kinds from public.professional_profiles where id = $1`, [proId]);
    expect(p).toMatchObject({ verification_status: 'verified', verified_kinds: ['identity'] });
    const users = await t.q<{ email: string }>(admin, `select * from public.admin_list_users('maria')`);
    expect(users[0]!.email).toBe('maria@example.test');
  });

  it('suspended users cannot act', async () => {
    await t.q(admin, `select public.admin_set_user_suspended($1, true, 'Spam')`, [stranger]);
    await expectFail(t.q(stranger, `select public.start_conversation($1)`, [proId]), /suspended/);
  });
});

describe('disputes and profile visibility', () => {
  it('lets booking parties see each other and queues a refund review when a dispute cancels a paid booking', async () => {
    // pro sees the instant-booking customer's name without having a conversation with them
    const custName = await t.q<{ full_name: string }>(pro, `select full_name from public.profiles where id = $1`, [customer]);
    expect(custName[0]!.full_name).toBe('Maria Santos');
    expect(await t.q(pro2, `select full_name from public.profiles where id = $1`, [customer])).toHaveLength(0);

    await t.q(customer, `select public.booking_action($1, 'dispute', 'Leak came back the next day')`, [bookingId]);
    const d = await one<{ id: string }>(admin, `select id from public.disputes where booking_id = $1`, [bookingId]);
    await expectFail(t.q(customer, `select public.admin_resolve_dispute($1, 'resolved', 'x', 'cancelled')`, [d.id]), /Administrator/);
    await t.q(admin, `select public.admin_resolve_dispute($1, 'resolved', 'Work not completed as agreed', 'cancelled')`, [d.id]);
    const b = await one<{ status: string }>(customer, `select status from public.bookings where id = $1`, [bookingId]);
    expect(b.status).toBe('cancelled');
    const refunds = await t.q<{ amount_cents: string; status: string }>(customer, `select amount_cents, status from public.refunds where booking_id = $1`, [bookingId]);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ status: 'pending_review' });
    expect(Number(refunds[0]!.amount_cents)).toBe(43120);
  });
});

describe('function privileges', () => {
  it('keeps service-only functions away from anon and authenticated users', async () => {
    const serviceOnly = ['payment_prepare_checkout', 'payment_attach_checkout', 'payment_mark_paid', 'payment_mark_failed',
      'webhook_event_begin', 'webhook_event_finish', 'refund_mark_result', 'expire_stale_records', 'notify', 'log_event',
      'add_contract_version', 'handle_new_user'];
    const rows = await t.q<{ proname: string }>('service', `
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any($1)
         and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))`,
      [serviceOnly]);
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it('only exposes an explicit allow-list of functions to anonymous visitors', async () => {
    const rows = await t.q<{ proname: string }>('service', `
      select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`);
    expect(rows.map((r) => r.proname)).toEqual([
      'get_available_slots', 'get_professional_reviews', 'is_admin', 'is_published_professional',
      'my_professional_id', 'search_professionals', 'today_manila']);
  });
});

describe('storage isolation', () => {
  it('limits private request files to the request parties', async () => {
    await t.q(customer, `insert into storage.objects (bucket_id, name) values ('request-files', $1 || '/photo.jpg')`, [requestId]);
    expect(await t.q(pro, `select name from storage.objects where bucket_id = 'request-files'`)).toHaveLength(1);
    expect(await t.q(pro2, `select name from storage.objects where bucket_id = 'request-files'`)).toHaveLength(0);
    await expectFail(t.q(pro2, `insert into storage.objects (bucket_id, name) values ('request-files', $1 || '/evil.jpg')`, [requestId]), /row-level security/);
    await expectFail(t.q(customer, `insert into storage.objects (bucket_id, name) values ('public-media', $1 || '/avatar.jpg')`, [pro]), /row-level security/);
  });
});
