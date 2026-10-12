-- Hire Me! — payments, refunds, disputes, reviews, reports, verification, administration.
-- Payment state is written only by the service role (server functions that verified PayMongo data).

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  customer_id uuid not null references public.profiles (id),
  professional_id uuid not null references public.professional_profiles (id),
  purpose text not null check (purpose in ('booking_deposit', 'booking_full', 'booking_balance')),
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'PHP' check (currency = 'PHP'),
  status text not null default 'pending' check (status in (
    'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'partially_refunded')),
  provider text not null default 'paymongo',
  provider_checkout_id text unique,
  provider_payment_intent_id text,
  provider_payment_id text unique,
  checkout_url text,
  livemode boolean,
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_records_booking_idx on public.payment_records (booking_id, created_at desc);
create index payment_records_intent_idx on public.payment_records (provider_payment_intent_id);
create trigger payment_records_touch before update on public.payment_records
  for each row execute function public.touch_updated_at();

create table public.payment_webhook_events (
  id text primary key, -- provider event id (evt_...), the idempotency key for deliveries
  provider text not null default 'paymongo',
  type text not null,
  livemode boolean not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 1,
  processing_error text
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_record_id uuid not null references public.payment_records (id),
  booking_id uuid not null references public.bookings (id),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'pending_review' check (status in (
    'pending_review', 'approved', 'processing', 'succeeded', 'failed', 'rejected')),
  reason text check (char_length(reason) <= 1000),
  requested_by uuid references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  provider_refund_id text unique,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_booking_idx on public.refunds (booking_id);
create trigger refunds_touch before update on public.refunds
  for each row execute function public.touch_updated_at();

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  opened_by uuid not null references public.profiles (id),
  reason text not null check (char_length(reason) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'dismissed')),
  resolution text check (char_length(resolution) <= 4000),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index disputes_one_open on public.disputes (booking_id) where status in ('open', 'under_review');
create trigger disputes_touch before update on public.disputes
  for each row execute function public.touch_updated_at();

-- Service-role: validate a booking for checkout and return (or create) the pending payment record.
-- The amount always comes from the booking, which came from the accepted quotation or service price.
create or replace function public.payment_prepare_checkout(p_booking_id uuid, p_user_id uuid)
returns public.payment_records language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_b public.bookings;
  v_rec public.payment_records;
  v_amount bigint;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found or v_b.customer_id <> p_user_id then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and is_suspended) then
    raise exception 'Your account is suspended.' using errcode = '42501';
  end if;
  if v_b.status <> 'awaiting_payment' then
    raise exception 'This booking is not awaiting payment.' using errcode = '22023';
  end if;
  if v_b.payment_due_by is not null and v_b.payment_due_by < now() then
    raise exception 'The payment window for this booking has closed.' using errcode = '22023';
  end if;
  v_amount := v_b.amount_due_now_cents - v_b.amount_paid_cents;
  if v_amount <= 0 then
    raise exception 'Nothing is due for this booking.' using errcode = '22023';
  end if;
  if v_amount < 2000 then
    raise exception 'Online payments must be at least PHP 20.00.' using errcode = '22023';
  end if;
  -- Reuse an existing pending attempt for the same amount instead of creating duplicates.
  select * into v_rec from public.payment_records
   where booking_id = v_b.id and status = 'pending' and amount_cents = v_amount
   order by created_at desc limit 1;
  if found then
    return v_rec;
  end if;
  update public.payment_records set status = 'cancelled', failure_reason = 'superseded'
   where booking_id = v_b.id and status = 'pending';
  insert into public.payment_records (booking_id, customer_id, professional_id, purpose, amount_cents)
  values (v_b.id, v_b.customer_id, v_b.professional_id,
          case when v_b.amount_due_now_cents < v_b.amount_total_cents then 'booking_deposit' else 'booking_full' end,
          v_amount)
  returning * into v_rec;
  update public.bookings set payment_status = 'pending' where id = v_b.id and payment_status in ('unpaid', 'failed');
  return v_rec;
end $$;

create or replace function public.payment_attach_checkout(
  p_record_id uuid, p_checkout_id text, p_payment_intent_id text, p_checkout_url text, p_livemode boolean)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.payment_records
     set provider_checkout_id = p_checkout_id, provider_payment_intent_id = p_payment_intent_id,
         checkout_url = p_checkout_url, livemode = p_livemode
   where id = p_record_id and status = 'pending'
$$;

-- Service-role: apply a provider-verified successful payment. Idempotent.
create or replace function public.payment_mark_paid(
  p_record_id uuid, p_provider_payment_id text, p_amount_cents bigint, p_paid_at timestamptz)
returns public.payment_records language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rec public.payment_records;
  v_b public.bookings;
begin
  select * into v_rec from public.payment_records where id = p_record_id for update;
  if not found then
    raise exception 'Payment record not found.' using errcode = 'P0002';
  end if;
  if v_rec.status in ('paid', 'refunded', 'partially_refunded') then
    return v_rec; -- duplicate delivery
  end if;
  if p_amount_cents is distinct from v_rec.amount_cents then
    update public.payment_records set failure_reason = 'amount_mismatch: received ' || p_amount_cents
     where id = v_rec.id;
    perform public.log_event('payment', v_rec.id, 'amount_mismatch', v_rec.status, v_rec.status,
      jsonb_build_object('expected', v_rec.amount_cents, 'received', p_amount_cents));
    raise exception 'Paid amount does not match the expected amount.' using errcode = '22023';
  end if;

  update public.payment_records
     set status = 'paid', provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
         paid_at = coalesce(p_paid_at, now()), failure_reason = null
   where id = v_rec.id returning * into v_rec;

  select * into v_b from public.bookings where id = v_rec.booking_id for update;
  update public.bookings
     set amount_paid_cents = amount_paid_cents + v_rec.amount_cents,
         payment_status = case when amount_paid_cents + v_rec.amount_cents >= amount_total_cents then 'paid'
                               else 'deposit_paid' end,
         status = case when status = 'awaiting_payment' then 'confirmed' else status end
   where id = v_b.id returning * into v_b;

  if v_b.status in ('cancelled', 'expired') then
    -- Money arrived after the booking ended: flag for administrator review rather than keep it silently.
    insert into public.refunds (payment_record_id, booking_id, amount_cents, status, reason)
    values (v_rec.id, v_b.id, v_rec.amount_cents, 'pending_review', 'Payment received after booking was ' || v_b.status);
  end if;

  perform public.log_event('payment', v_rec.id, 'paid', 'pending', 'paid',
    jsonb_build_object('amount_cents', v_rec.amount_cents, 'provider_payment_id', p_provider_payment_id));
  perform public.log_event('booking', v_b.id, 'payment_received', null, v_b.status,
    jsonb_build_object('payment_record_id', v_rec.id));
  perform public.notify(v_b.customer_id, 'payment_paid', 'Payment received',
    'Your booking ' || v_b.booking_number || ' is ' || replace(v_b.status, '_', ' ') || '.',
    '/dashboard/bookings/' || v_b.id::text, 'payment_paid_c:' || v_rec.id::text);
  perform public.notify(public.professional_user_id(v_b.professional_id), 'payment_paid', 'Booking payment received',
    v_b.booking_number, '/pro-dashboard/bookings/' || v_b.id::text, 'payment_paid_p:' || v_rec.id::text);
  return v_rec;
end $$;

create or replace function public.payment_mark_failed(p_record_id uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rec public.payment_records;
begin
  if p_status not in ('failed', 'expired', 'cancelled') then
    raise exception 'Invalid failure status.' using errcode = '22023';
  end if;
  select * into v_rec from public.payment_records where id = p_record_id for update;
  if not found or v_rec.status <> 'pending' then
    return;
  end if;
  update public.payment_records set status = p_status, failure_reason = left(p_reason, 500) where id = v_rec.id;
  update public.bookings set payment_status = 'failed'
   where id = v_rec.booking_id and payment_status = 'pending'
     and not exists (select 1 from public.payment_records where booking_id = v_rec.booking_id and status = 'pending');
  perform public.log_event('payment', v_rec.id, p_status, 'pending', p_status, jsonb_build_object('reason', p_reason));
  if p_status = 'failed' then
    perform public.notify(v_rec.customer_id, 'payment_failed', 'Payment failed',
      'Your payment did not go through. You can try again.', '/dashboard/bookings/' || v_rec.booking_id::text,
      'payment_failed:' || v_rec.id::text);
  end if;
end $$;

create or replace function public.webhook_event_begin(p_event_id text, p_type text, p_livemode boolean, p_payload jsonb)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_processed timestamptz;
begin
  insert into public.payment_webhook_events (id, type, livemode, payload)
  values (p_event_id, p_type, p_livemode, p_payload)
  on conflict (id) do nothing;
  if found then
    return 'new';
  end if;
  update public.payment_webhook_events set attempts = attempts + 1 where id = p_event_id
  returning processed_at into v_processed;
  return case when v_processed is null then 'retry' else 'duplicate' end;
end $$;

create or replace function public.webhook_event_finish(p_event_id text, p_error text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.payment_webhook_events
     set processed_at = case when p_error is null then now() else null end, processing_error = p_error
   where id = p_event_id
$$;

create or replace function public.refund_mark_result(
  p_refund_id uuid, p_status text, p_provider_refund_id text, p_failure text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_r public.refunds;
  v_total_refunded bigint;
  v_rec public.payment_records;
begin
  if p_status not in ('processing', 'succeeded', 'failed') then
    raise exception 'Invalid refund status.' using errcode = '22023';
  end if;
  update public.refunds set status = p_status, provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
         failure_reason = p_failure
   where id = p_refund_id and status not in ('succeeded', 'rejected') returning * into v_r;
  if not found then
    return;
  end if;
  if p_status = 'succeeded' then
    select * into v_rec from public.payment_records where id = v_r.payment_record_id;
    select coalesce(sum(amount_cents), 0) into v_total_refunded from public.refunds
     where payment_record_id = v_r.payment_record_id and status = 'succeeded';
    update public.payment_records
       set status = case when v_total_refunded >= amount_cents then 'refunded' else 'partially_refunded' end
     where id = v_r.payment_record_id;
    update public.bookings
       set payment_status = case when v_total_refunded >= amount_paid_cents then 'refunded' else 'partially_refunded' end
     where id = v_r.booking_id;
    perform public.notify(v_rec.customer_id, 'refund_succeeded', 'Refund processed',
      'A refund was issued for your booking.', '/dashboard/payments', 'refund_succeeded:' || v_r.id::text);
  end if;
  perform public.log_event('refund', v_r.id, 'provider_' || p_status, null, p_status,
    jsonb_strip_nulls(jsonb_build_object('provider_refund_id', p_provider_refund_id, 'failure', p_failure)));
end $$;

-- ---------------------------------------------------------------------------
-- Reviews and reports
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id),
  professional_id uuid not null references public.professional_profiles (id),
  customer_id uuid not null references public.profiles (id),
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 3000),
  status text not null default 'published' check (status in ('published', 'hidden')),
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_professional_idx on public.reviews (professional_id, created_at desc) where status = 'published';
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

create or replace function public.refresh_professional_rating()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pro uuid := coalesce(new.professional_id, old.professional_id);
begin
  update public.professional_profiles p
     set rating_avg = s.avg_rating, review_count = s.n
    from (select round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as n
            from public.reviews where professional_id = v_pro and status = 'published') s
   where p.id = v_pro;
  return null;
end $$;
create trigger reviews_refresh_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_professional_rating();

create or replace function public.submit_review(p_booking_id uuid, p_rating int, p_body text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_b public.bookings;
  v_id uuid;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.customer_id <> v_uid then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if v_b.status <> 'completed' then
    raise exception 'You can review a booking after the job is completed.' using errcode = '22023';
  end if;
  if exists (select 1 from public.reviews where booking_id = p_booking_id) then
    raise exception 'You have already reviewed this booking.' using errcode = '23505';
  end if;
  insert into public.reviews (booking_id, professional_id, customer_id, rating, body)
  values (p_booking_id, v_b.professional_id, v_uid, p_rating, nullif(btrim(p_body), ''))
  returning id into v_id;
  perform public.notify(public.professional_user_id(v_b.professional_id), 'review_new', 'New review',
    p_rating || ' out of 5 stars', '/pro-dashboard/reviews', 'review_new:' || v_id::text);
  return v_id;
end $$;

-- Public review list without exposing reviewer accounts: first name and last initial only.
create or replace function public.get_professional_reviews(p_professional_id uuid, p_limit int default 10, p_offset int default 0)
returns table (id uuid, rating smallint, body text, created_at timestamptz, reviewer_name text, service_name text, total_count bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, r.rating, r.body, r.created_at,
         coalesce(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 'Customer') ||
           case when position(' ' in btrim(p.full_name)) > 0
                then ' ' || left(split_part(btrim(p.full_name), ' ', array_length(regexp_split_to_array(btrim(p.full_name), '\s+'), 1)), 1) || '.'
                else '' end,
         s.name,
         count(*) over ()
    from public.reviews r
    join public.profiles p on p.id = r.customer_id
    join public.bookings b on b.id = r.booking_id
    left join public.services s on s.id = b.service_id
   where r.professional_id = p_professional_id and r.status = 'published'
     and public.is_published_professional(p_professional_id)
   order by r.created_at desc
   limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id),
  entity_type text not null check (entity_type in ('review', 'professional', 'service', 'portfolio', 'message')),
  entity_id uuid not null,
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reporter_id, entity_type, entity_id)
);
create trigger reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------

create table public.verification_submissions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  kind text not null check (kind in ('identity', 'business', 'qualification', 'license')),
  document_paths text[] not null check (cardinality(document_paths) between 1 and 5),
  details text check (char_length(details) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  decision_reason text check (char_length(decision_reason) <= 1000)
);
create unique index verification_one_pending on public.verification_submissions (professional_id, kind) where status = 'pending';

create or replace function public.submit_verification(p_kind text, p_document_paths text[], p_details text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_pro uuid := public.my_professional_id();
  v_path text;
  v_id uuid;
begin
  if v_pro is null then
    raise exception 'Create your professional profile first.' using errcode = 'P0002';
  end if;
  foreach v_path in array coalesce(p_document_paths, '{}') loop
    if v_path not like v_uid::text || '/%' or v_path like '%..%' then
      raise exception 'Invalid document reference.' using errcode = '22023';
    end if;
  end loop;
  insert into public.verification_submissions (professional_id, kind, document_paths, details)
  values (v_pro, p_kind, p_document_paths, nullif(btrim(p_details), ''))
  returning id into v_id;
  update public.professional_profiles set verification_status = 'pending'
   where id = v_pro and verification_status in ('unverified', 'rejected');
  perform public.log_event('verification', v_id, 'submitted', null, 'pending', jsonb_build_object('kind', p_kind));
  perform public.notify(ur.user_id, 'verification_submitted', 'Verification submitted for review', p_kind,
    '/admin/verifications', 'verification_submitted:' || v_id::text || ':' || ur.user_id::text)
    from public.user_roles ur where ur.role = 'admin';
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Administration (every function re-checks the server-side admin role)
-- ---------------------------------------------------------------------------

create or replace function public.require_admin()
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create or replace function public.admin_review_verification(p_submission_id uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.require_admin();
  v_s public.verification_submissions;
  v_kinds text[];
begin
  select * into v_s from public.verification_submissions where id = p_submission_id for update;
  if not found or v_s.status <> 'pending' then
    raise exception 'Submission not found or already reviewed.' using errcode = 'P0002';
  end if;
  if not p_approve and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give a reason for rejecting.' using errcode = '22023';
  end if;
  update public.verification_submissions
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = v_admin, reviewed_at = now(), decision_reason = nullif(btrim(p_reason), '')
   where id = v_s.id;
  select verified_kinds into v_kinds from public.professional_profiles where id = v_s.professional_id;
  if p_approve and not (v_s.kind = any (v_kinds)) then
    v_kinds := array_append(v_kinds, v_s.kind);
  end if;
  update public.professional_profiles
     set verified_kinds = v_kinds,
         verification_status = case
           when verification_status = 'suspended' then 'suspended'
           when 'identity' = any (v_kinds) then 'verified'
           when exists (select 1 from public.verification_submissions
                         where professional_id = v_s.professional_id and status = 'pending') then 'pending'
           when not p_approve and cardinality(v_kinds) = 0 then 'rejected'
           else verification_status end
   where id = v_s.professional_id;
  perform public.log_event('verification', v_s.id, case when p_approve then 'approved' else 'rejected' end,
    'pending', case when p_approve then 'approved' else 'rejected' end,
    jsonb_build_object('kind', v_s.kind, 'reason', p_reason));
  perform public.notify(public.professional_user_id(v_s.professional_id), 'verification_decided',
    case when p_approve then 'Verification approved' else 'Verification not approved' end,
    initcap(v_s.kind) || coalesce(': ' || nullif(btrim(p_reason), ''), ''), '/pro-dashboard/verification');
end $$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (id uuid, email text, full_name text, created_at timestamptz, is_suspended boolean,
               is_admin boolean, professional_id uuid, professional_slug text, professional_status text, total_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  return query
  select p.id, u.email::text, p.full_name, p.created_at, p.is_suspended,
         exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin'),
         pp.id, pp.slug, pp.status, count(*) over ()
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.professional_profiles pp on pp.user_id = p.id
   where p_search is null or p_search = ''
      or p.full_name ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%'
      or pp.display_name ilike '%' || p_search || '%'
   order by p.created_at desc
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_set_user_suspended(p_user_id uuid, p_suspended boolean, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.require_admin();
begin
  if p_user_id = v_admin then
    raise exception 'You cannot suspend your own account.' using errcode = '22023';
  end if;
  if p_suspended and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give a reason for the suspension.' using errcode = '22023';
  end if;
  update public.profiles set is_suspended = p_suspended,
         suspended_reason = case when p_suspended then btrim(p_reason) end
   where id = p_user_id;
  update public.professional_profiles
     set status = case when p_suspended then 'suspended' else 'draft' end
   where user_id = p_user_id and (p_suspended or status = 'suspended');
  perform public.log_event('user', p_user_id, case when p_suspended then 'suspended' else 'unsuspended' end,
    null, null, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_moderate(p_entity_type text, p_entity_id uuid, p_action text, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.require_admin();
begin
  if p_entity_type = 'review' and p_action in ('hide', 'publish') then
    update public.reviews set status = case when p_action = 'hide' then 'hidden' else 'published' end,
           hidden_reason = case when p_action = 'hide' then p_note end
     where id = p_entity_id;
  elsif p_entity_type = 'report' and p_action in ('resolve', 'dismiss') then
    update public.reports set status = case when p_action = 'resolve' then 'resolved' else 'dismissed' end,
           resolution_note = p_note, resolved_by = v_admin
     where id = p_entity_id;
  elsif p_entity_type = 'professional' and p_action in ('suspend', 'unsuspend') then
    update public.professional_profiles
       set status = case when p_action = 'suspend' then 'suspended' else 'draft' end
     where id = p_entity_id;
  elsif p_entity_type = 'service' and p_action = 'deactivate' then
    update public.services set status = 'inactive' where id = p_entity_id;
  else
    raise exception 'Unsupported moderation action.' using errcode = '22023';
  end if;
  if not found then
    raise exception 'Record not found.' using errcode = 'P0002';
  end if;
  perform public.log_event(p_entity_type, p_entity_id, 'admin_' || p_action, null, null, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_resolve_dispute(p_dispute_id uuid, p_outcome text, p_resolution text, p_booking_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.require_admin();
  v_d public.disputes;
  v_b public.bookings;
begin
  if p_outcome not in ('under_review', 'resolved', 'dismissed') then
    raise exception 'Invalid outcome.' using errcode = '22023';
  end if;
  select * into v_d from public.disputes where id = p_dispute_id for update;
  if not found or v_d.status not in ('open', 'under_review') then
    raise exception 'Dispute not found or already closed.' using errcode = 'P0002';
  end if;
  update public.disputes set status = p_outcome, resolution = nullif(btrim(p_resolution), ''),
         resolved_by = case when p_outcome <> 'under_review' then v_admin end,
         resolved_at = case when p_outcome <> 'under_review' then now() end
   where id = v_d.id;
  if p_outcome <> 'under_review' then
    if p_booking_status not in ('previous', 'completed', 'cancelled') then
      raise exception 'Choose the booking outcome.' using errcode = '22023';
    end if;
    update public.bookings
       set status = case when p_booking_status = 'previous' then coalesce(previous_status, 'confirmed') else p_booking_status end,
           previous_status = null,
           cancelled_at = case when p_booking_status = 'cancelled' then now() else cancelled_at end
     where id = v_d.booking_id and status = 'disputed' returning * into v_b;
    perform public.notify(x.uid, 'dispute_' || p_outcome, 'Dispute ' || p_outcome,
      coalesce(left(p_resolution, 140), ''), '/bookings/' || v_d.booking_id::text)
      from (select v_b.customer_id as uid union select public.professional_user_id(v_b.professional_id)) x;
  end if;
  perform public.log_event('dispute', v_d.id, 'admin_' || p_outcome, v_d.status, p_outcome,
    jsonb_build_object('resolution', p_resolution, 'booking_status', p_booking_status));
end $$;

create or replace function public.admin_decide_refund(p_refund_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.require_admin();
  v_r public.refunds;
begin
  select * into v_r from public.refunds where id = p_refund_id for update;
  if not found or v_r.status <> 'pending_review' then
    raise exception 'Refund not found or already decided.' using errcode = 'P0002';
  end if;
  update public.refunds set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = v_admin, decided_at = now(), decision_note = nullif(btrim(p_note), '')
   where id = v_r.id;
  perform public.log_event('refund', v_r.id, case when p_approve then 'approved' else 'rejected' end,
    'pending_review', case when p_approve then 'approved' else 'rejected' end, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.require_admin();
begin
  update public.platform_settings set value = p_value, updated_at = now(), updated_by = v_admin where key = p_key;
  if not found then
    raise exception 'Unknown setting.' using errcode = 'P0002';
  end if;
  perform public.log_event('setting', null, 'updated', null, null, jsonb_build_object('key', p_key, 'value', p_value));
end $$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'professionals_published', (select count(*) from public.professional_profiles where status = 'published'),
    'verifications_pending', (select count(*) from public.verification_submissions where status = 'pending'),
    'requests_open', (select count(*) from public.service_requests where status in ('submitted', 'viewed', 'awaiting_info')),
    'bookings_active', (select count(*) from public.bookings where status in ('awaiting_payment', 'confirmed', 'in_progress')),
    'bookings_completed', (select count(*) from public.bookings where status = 'completed'),
    'disputes_open', (select count(*) from public.disputes where status in ('open', 'under_review')),
    'refunds_pending', (select count(*) from public.refunds where status in ('pending_review', 'approved')),
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'payments_paid_cents', (select coalesce(sum(amount_cents), 0) from public.payment_records where status in ('paid', 'partially_refunded')));
end $$;

-- Scheduled housekeeping (called by the cron endpoint with the service role).
create or replace function public.expire_stale_records()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_quotes int;
  v_bookings int;
  v_requests int;
  v_days int;
begin
  update public.quotations set status = 'expired'
   where status in ('sent', 'viewed', 'revision_requested') and valid_until < public.today_manila();
  get diagnostics v_quotes = row_count;

  with expired as (
    update public.bookings set status = 'expired', payment_status = case when payment_status = 'pending' then 'unpaid' else payment_status end
     where status = 'awaiting_payment' and payment_due_by < now() and amount_paid_cents = 0
    returning id)
  select count(*) into v_bookings from expired;
  update public.payment_records set status = 'expired', failure_reason = 'booking payment window closed'
   where status = 'pending' and booking_id in (select id from public.bookings where status = 'expired');

  select coalesce((value #>> '{}')::int, 30) into v_days from public.platform_settings where key = 'request_expiry_days';
  update public.service_requests set status = 'expired'
   where status in ('submitted', 'viewed', 'awaiting_info')
     and coalesce(submitted_at, created_at) < now() - make_interval(days => coalesce(v_days, 30));
  get diagnostics v_requests = row_count;

  return jsonb_build_object('quotations', v_quotes, 'bookings', v_bookings, 'requests', v_requests);
end $$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.payment_records enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.refunds enable row level security;
alter table public.disputes enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.verification_submissions enable row level security;

create policy payment_records_select on public.payment_records for select to authenticated
  using (customer_id = auth.uid() or professional_id = public.my_professional_id() or public.is_admin());
-- payment_webhook_events: no client policies at all (service role only).
create policy refunds_select on public.refunds for select to authenticated
  using (public.is_booking_party(booking_id) or public.is_admin());
create policy disputes_select on public.disputes for select to authenticated
  using (public.is_booking_party(booking_id) or public.is_admin());
create policy reviews_select on public.reviews for select to anon, authenticated
  using ((status = 'published' and public.is_published_professional(professional_id))
         or customer_id = auth.uid() or professional_id = public.my_professional_id() or public.is_admin());
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and not exists (select 1 from public.profiles where id = auth.uid() and is_suspended));
create policy verification_select on public.verification_submissions for select to authenticated
  using (professional_id = public.my_professional_id() or public.is_admin());

grant select on public.payment_records, public.refunds, public.disputes, public.verification_submissions to authenticated;
grant select on public.reviews to anon, authenticated;
grant select on public.reports to authenticated;
grant insert (entity_type, entity_id, reason) on public.reports to authenticated;

grant execute on function public.submit_review(uuid, int, text) to authenticated;
grant execute on function public.get_professional_reviews(uuid, int, int) to anon, authenticated;
grant execute on function public.submit_verification(text, text[], text) to authenticated;
grant execute on function public.admin_review_verification(uuid, boolean, text) to authenticated;
grant execute on function public.admin_list_users(text, int, int) to authenticated;
grant execute on function public.admin_set_user_suspended(uuid, boolean, text) to authenticated;
grant execute on function public.admin_moderate(text, uuid, text, text) to authenticated;
grant execute on function public.admin_resolve_dispute(uuid, text, text, text) to authenticated;
grant execute on function public.admin_decide_refund(uuid, boolean, text) to authenticated;
grant execute on function public.admin_update_setting(text, jsonb) to authenticated;
grant execute on function public.admin_overview() to authenticated;
-- payment_*, webhook_*, refund_mark_result and expire_stale_records stay service-role only.
