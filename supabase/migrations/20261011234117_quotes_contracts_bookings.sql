-- Hire Me! — quotations, contracts, bookings.
-- Financial totals are computed here, from line items, in integer centavos. Clients can never write totals.

-- ---------------------------------------------------------------------------
-- Quotations
-- ---------------------------------------------------------------------------

create sequence public.quote_number_seq;

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null,
  revision int not null default 1 check (revision between 1 and 100),
  request_id uuid not null references public.service_requests (id),
  professional_id uuid not null references public.professional_profiles (id),
  customer_id uuid not null references public.profiles (id),
  previous_quote_id uuid references public.quotations (id),
  title text not null check (char_length(title) between 3 and 140),
  scope_of_work text not null default '' check (char_length(scope_of_work) <= 10000),
  notes text check (char_length(notes) <= 4000),
  estimated_duration_minutes int check (estimated_duration_minutes between 15 and 100800),
  proposed_start timestamptz,
  payment_terms text check (char_length(payment_terms) <= 4000),
  exclusions text check (char_length(exclusions) <= 4000),
  warranty_terms text check (char_length(warranty_terms) <= 4000),
  valid_until date not null default ((now() at time zone 'Asia/Manila')::date + 14),
  discount_cents bigint not null default 0 check (discount_cents between 0 and 100000000000),
  tax_rate_bp int not null default 0 check (tax_rate_bp between 0 and 5000), -- basis points, 1200 = 12%
  deposit_percent int not null default 0 check (deposit_percent between 0 and 100),
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  currency char(3) not null default 'PHP' check (currency = 'PHP'),
  status text not null default 'draft' check (status in (
    'draft', 'sent', 'viewed', 'revision_requested', 'accepted', 'rejected', 'expired', 'withdrawn', 'superseded')),
  customer_note text check (char_length(customer_note) <= 2000),
  accepted_snapshot jsonb,
  sent_at timestamptz,
  viewed_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_number, revision)
);
create index quotations_request_idx on public.quotations (request_id);
create index quotations_professional_idx on public.quotations (professional_id, status, created_at desc);
create index quotations_customer_idx on public.quotations (customer_id, status, created_at desc);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  kind text not null check (kind in ('labor', 'material', 'other')),
  description text not null check (char_length(description) between 1 and 300),
  quantity numeric(12, 2) not null check (quantity > 0 and quantity <= 100000),
  unit_price_cents bigint not null check (unit_price_cents between 0 and 100000000000),
  line_total_cents bigint not null default 0,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);
create index quotation_items_quotation_idx on public.quotation_items (quotation_id, sort_order);

create or replace function public.quotation_items_before()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status text;
begin
  select status into v_status from public.quotations
   where id = case when tg_op = 'DELETE' then old.quotation_id else new.quotation_id end;
  if v_status is distinct from 'draft' and v_status is not null then
    raise exception 'Only draft quotations can be edited. Create a revision instead.' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.line_total_cents := round(new.quantity * new.unit_price_cents)::bigint;
  return new;
end $$;
create trigger quotation_items_before before insert or update or delete on public.quotation_items
  for each row execute function public.quotation_items_before();

create or replace function public.quotation_items_after()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Touching the parent fires quotations_before_update, which recomputes the totals.
  update public.quotations set updated_at = now()
   where id = case when tg_op = 'DELETE' then old.quotation_id else new.quotation_id end
     and status = 'draft';
  return null;
end $$;
create trigger quotation_items_after after insert or update or delete on public.quotation_items
  for each row execute function public.quotation_items_after();

create or replace function public.quotations_before_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_taxable bigint;
begin
  if old.status = 'accepted' then
    raise exception 'Accepted quotations cannot be changed.' using errcode = '22023';
  end if;
  if new.status = 'draft' then
    select coalesce(sum(line_total_cents), 0) into new.subtotal_cents
      from public.quotation_items where quotation_id = new.id;
    v_taxable := greatest(new.subtotal_cents - new.discount_cents, 0);
    new.tax_cents := round(v_taxable * new.tax_rate_bp / 10000.0)::bigint;
    new.total_cents := v_taxable + new.tax_cents;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger quotations_before_update before update on public.quotations
  for each row execute function public.quotations_before_update();

create or replace function public.can_view_quotation(p_quotation_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.quotations q
                  where q.id = p_quotation_id
                    and (q.professional_id = public.my_professional_id()
                         or (q.customer_id = auth.uid() and q.status <> 'draft')
                         or public.is_admin()))
$$;

create or replace function public.can_edit_quotation(p_quotation_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.quotations q
                  where q.id = p_quotation_id and q.status = 'draft'
                    and q.professional_id = public.my_professional_id())
$$;

create or replace function public.create_quotation(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_req public.service_requests;
  v_id uuid;
begin
  select * into v_req from public.service_requests where id = p_request_id;
  if not found or v_req.professional_id is distinct from public.my_professional_id() then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_req.status not in ('submitted', 'viewed', 'awaiting_info', 'accepted', 'quoted') then
    raise exception 'You cannot quote a request that is %.', v_req.status using errcode = '22023';
  end if;
  insert into public.quotations (quote_number, request_id, professional_id, customer_id, title)
  values ('Q-' || lpad(nextval('public.quote_number_seq')::text, 6, '0'), v_req.id, v_req.professional_id,
          v_req.customer_id, v_req.title)
  returning id into v_id;
  perform public.log_event('quotation', v_id, 'created', null, 'draft');
  return v_id;
end $$;

create or replace function public.send_quotation(p_quotation_id uuid)
returns public.quotations language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_q public.quotations;
begin
  select * into v_q from public.quotations where id = p_quotation_id for update;
  if not found or v_q.professional_id is distinct from public.my_professional_id() then
    raise exception 'Quotation not found.' using errcode = 'P0002';
  end if;
  if v_q.status <> 'draft' then
    raise exception 'This quotation has already been sent.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.quotation_items where quotation_id = v_q.id) then
    raise exception 'Add at least one line item.' using errcode = '22023';
  end if;
  if v_q.discount_cents > v_q.subtotal_cents then
    raise exception 'The discount cannot exceed the subtotal.' using errcode = '22023';
  end if;
  if v_q.total_cents <= 0 then
    raise exception 'The quotation total must be greater than zero.' using errcode = '22023';
  end if;
  if v_q.valid_until < public.today_manila() then
    raise exception 'The expiration date has already passed.' using errcode = '22023';
  end if;
  if v_q.proposed_start is null or v_q.proposed_start <= now() then
    raise exception 'Set a proposed schedule in the future.' using errcode = '22023';
  end if;
  if v_q.estimated_duration_minutes is null then
    raise exception 'Set an estimated duration.' using errcode = '22023';
  end if;

  update public.quotations set status = 'superseded'
   where quote_number = v_q.quote_number and id <> v_q.id and status in ('sent', 'viewed', 'revision_requested');

  update public.quotations set status = 'sent', sent_at = now(), customer_note = null
   where id = v_q.id returning * into v_q;
  update public.service_requests set status = 'quoted'
   where id = v_q.request_id and status in ('submitted', 'viewed', 'awaiting_info', 'accepted');

  perform public.log_event('quotation', v_q.id, 'sent', 'draft', 'sent',
    jsonb_build_object('total_cents', v_q.total_cents, 'revision', v_q.revision));
  perform public.notify(v_q.customer_id, 'quote_sent',
    case when v_q.revision > 1 then 'Revised quotation received' else 'New quotation received' end,
    v_q.title, '/dashboard/quotes/' || v_q.id::text, 'quote_sent:' || v_q.id::text);
  return v_q;
end $$;

create or replace function public.mark_quotation_viewed(p_quotation_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.quotations set status = 'viewed', viewed_at = now()
   where id = p_quotation_id and customer_id = auth.uid() and status = 'sent';
  if found then
    perform public.log_event('quotation', p_quotation_id, 'viewed', 'sent', 'viewed');
  end if;
end $$;

create or replace function public.customer_quotation_decision(p_quotation_id uuid, p_decision text, p_note text default null)
returns public.quotations language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_q public.quotations;
  v_from text;
begin
  select * into v_q from public.quotations where id = p_quotation_id for update;
  if not found or v_q.customer_id <> v_uid or v_q.status = 'draft' then
    raise exception 'Quotation not found.' using errcode = 'P0002';
  end if;
  v_from := v_q.status;
  if p_decision = 'revision_requested' then
    if v_q.status not in ('sent', 'viewed') then
      raise exception 'You cannot request a revision of a quotation that is %.', v_q.status using errcode = '22023';
    end if;
    if coalesce(btrim(p_note), '') = '' then
      raise exception 'Describe the changes you need.' using errcode = '22023';
    end if;
  elsif p_decision = 'rejected' then
    if v_q.status not in ('sent', 'viewed', 'revision_requested') then
      raise exception 'You cannot reject a quotation that is %.', v_q.status using errcode = '22023';
    end if;
  else
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;
  update public.quotations set status = p_decision, customer_note = nullif(btrim(p_note), ''), decided_at = now()
   where id = v_q.id returning * into v_q;
  perform public.log_event('quotation', v_q.id, p_decision, v_from, p_decision, jsonb_build_object('note', p_note));
  perform public.notify(public.professional_user_id(v_q.professional_id), 'quote_' || p_decision,
    case p_decision when 'rejected' then 'Quotation rejected' else 'Revision requested' end,
    v_q.title, '/pro-dashboard/quotes/' || v_q.id::text);
  return v_q;
end $$;

create or replace function public.withdraw_quotation(p_quotation_id uuid)
returns public.quotations language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_q public.quotations;
  v_from text;
begin
  select * into v_q from public.quotations where id = p_quotation_id for update;
  if not found or v_q.professional_id is distinct from public.my_professional_id() then
    raise exception 'Quotation not found.' using errcode = 'P0002';
  end if;
  if v_q.status not in ('sent', 'viewed', 'revision_requested') then
    raise exception 'You cannot withdraw a quotation that is %.', v_q.status using errcode = '22023';
  end if;
  v_from := v_q.status;
  update public.quotations set status = 'withdrawn', decided_at = now() where id = v_q.id returning * into v_q;
  perform public.log_event('quotation', v_q.id, 'withdrawn', v_from, 'withdrawn');
  perform public.notify(v_q.customer_id, 'quote_withdrawn', 'Quotation withdrawn', v_q.title,
    '/dashboard/quotes/' || v_q.id::text);
  return v_q;
end $$;

-- Copies a quotation into a new draft revision. The old one is superseded when the new one is sent.
create or replace function public.revise_quotation(p_quotation_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_q public.quotations;
  v_id uuid;
begin
  select * into v_q from public.quotations where id = p_quotation_id for update;
  if not found or v_q.professional_id is distinct from public.my_professional_id() then
    raise exception 'Quotation not found.' using errcode = 'P0002';
  end if;
  if v_q.status not in ('sent', 'viewed', 'revision_requested', 'rejected', 'expired', 'withdrawn') then
    raise exception 'You cannot revise a quotation that is %.', v_q.status using errcode = '22023';
  end if;
  if exists (select 1 from public.quotations where quote_number = v_q.quote_number and revision > v_q.revision) then
    raise exception 'A newer revision already exists.' using errcode = '22023';
  end if;
  insert into public.quotations (quote_number, revision, request_id, professional_id, customer_id, previous_quote_id,
    title, scope_of_work, notes, estimated_duration_minutes, proposed_start, payment_terms, exclusions,
    warranty_terms, valid_until, discount_cents, tax_rate_bp, deposit_percent)
  values (v_q.quote_number, v_q.revision + 1, v_q.request_id, v_q.professional_id, v_q.customer_id, v_q.id,
    v_q.title, v_q.scope_of_work, v_q.notes, v_q.estimated_duration_minutes, v_q.proposed_start, v_q.payment_terms,
    v_q.exclusions, v_q.warranty_terms, greatest(v_q.valid_until, public.today_manila() + 14), v_q.discount_cents,
    v_q.tax_rate_bp, v_q.deposit_percent)
  returning id into v_id;
  insert into public.quotation_items (quotation_id, kind, description, quantity, unit_price_cents, sort_order)
  select v_id, kind, description, quantity, unit_price_cents, sort_order
    from public.quotation_items where quotation_id = v_q.id;
  perform public.log_event('quotation', v_id, 'revision_created', null, 'draft',
    jsonb_build_object('previous_quote_id', v_q.id));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Contracts: versions and signatures are append-only
-- ---------------------------------------------------------------------------

create sequence public.contract_number_seq;

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null unique
    default ('C-' || lpad(nextval('public.contract_number_seq')::text, 6, '0')),
  quotation_id uuid not null unique references public.quotations (id),
  booking_id uuid unique,
  customer_id uuid not null references public.profiles (id),
  professional_id uuid not null references public.professional_profiles (id),
  current_version int not null default 1,
  status text not null default 'pending_signatures'
    check (status in ('pending_signatures', 'partially_signed', 'signed', 'void')),
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contracts_customer_idx on public.contracts (customer_id, created_at desc);
create index contracts_professional_idx on public.contracts (professional_id, created_at desc);
create trigger contracts_touch before update on public.contracts
  for each row execute function public.touch_updated_at();

create table public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id),
  version int not null check (version >= 1),
  content jsonb not null,
  content_hash text not null, -- sha256 of content::text, recorded again on every signature
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (contract_id, version)
);

create table public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_version_id uuid not null references public.contract_versions (id),
  signer_id uuid not null references public.profiles (id),
  signer_role text not null check (signer_role in ('customer', 'professional')),
  signer_name text not null check (char_length(signer_name) between 2 and 120),
  consent_statement text not null,
  content_hash text not null,
  ip_address text,
  user_agent text check (char_length(user_agent) <= 500),
  signed_at timestamptz not null default now(),
  unique (contract_version_id, signer_role)
);

create or replace function public.forbid_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception '% records are immutable.', tg_table_name using errcode = '22023';
end $$;
create trigger contract_versions_immutable before update or delete on public.contract_versions
  for each row execute function public.forbid_mutation();
create trigger contract_signatures_immutable before update or delete on public.contract_signatures
  for each row execute function public.forbid_mutation();

create or replace function public.is_contract_party(p_contract_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.contracts c
                  where c.id = p_contract_id
                    and (c.customer_id = auth.uid() or c.professional_id = public.my_professional_id()))
$$;

create or replace function public.add_contract_version(p_contract_id uuid, p_terms jsonb)
returns public.contract_versions language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c public.contracts;
  v_q public.quotations;
  v_b record;
  v_version int;
  v_content jsonb;
  v_row public.contract_versions;
begin
  select * into v_c from public.contracts where id = p_contract_id;
  select * into v_q from public.quotations where id = v_c.quotation_id;
  select scheduled_start, scheduled_end, location_city, location_address into v_b
    from public.bookings where id = v_c.booking_id;
  select coalesce(max(version), 0) + 1 into v_version from public.contract_versions where contract_id = p_contract_id;
  v_content := jsonb_build_object(
    'contract_number', v_c.contract_number,
    'version', v_version,
    'generated_at', now(),
    'customer', v_q.accepted_snapshot -> 'customer',
    'professional', v_q.accepted_snapshot -> 'professional',
    'quotation', v_q.accepted_snapshot -> 'quote',
    'items', v_q.accepted_snapshot -> 'items',
    'schedule', jsonb_build_object('start', v_b.scheduled_start, 'end', v_b.scheduled_end,
                                   'city', v_b.location_city, 'address', v_b.location_address,
                                   'timezone', 'Asia/Manila'),
    'terms', p_terms);
  insert into public.contract_versions (contract_id, version, content, content_hash, created_by)
  values (p_contract_id, v_version, v_content, encode(sha256(convert_to(v_content::text, 'UTF8')), 'hex'), auth.uid())
  returning * into v_row;
  update public.contracts set current_version = v_version,
         status = case when status = 'void' then status else 'pending_signatures' end
   where id = p_contract_id;
  return v_row;
end $$;

-- Either party may propose amended terms before the contract is fully signed. Price/scope changes need a new quotation.
create or replace function public.amend_contract(p_contract_id uuid, p_terms jsonb)
returns public.contract_versions language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_c public.contracts;
  v_current jsonb;
  v_key text;
  v_row public.contract_versions;
begin
  select * into v_c from public.contracts where id = p_contract_id for update;
  if not found or not public.is_contract_party(p_contract_id) then
    raise exception 'Contract not found.' using errcode = 'P0002';
  end if;
  if v_c.status not in ('pending_signatures', 'partially_signed') then
    raise exception 'This contract can no longer be amended.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_terms) <> 'object' then
    raise exception 'Invalid terms.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_terms) loop
    if v_key not in ('cancellation', 'rescheduling', 'completion', 'dispute_resolution', 'general', 'additional')
       or jsonb_typeof(p_terms -> v_key) <> 'string' or char_length(p_terms ->> v_key) > 5000 then
      raise exception 'Invalid contract term: %', v_key using errcode = '22023';
    end if;
  end loop;
  select content -> 'terms' into v_current from public.contract_versions
   where contract_id = p_contract_id and version = v_c.current_version;
  v_row := public.add_contract_version(p_contract_id, coalesce(v_current, '{}') || p_terms);
  perform public.log_event('contract', p_contract_id, 'amended', null, 'pending_signatures',
    jsonb_build_object('version', v_row.version));
  perform public.notify(case when v_c.customer_id = v_uid then public.professional_user_id(v_c.professional_id)
                             else v_c.customer_id end,
    'contract_amended', 'Contract terms were amended', 'Review and sign version ' || v_row.version,
    '/contracts/' || p_contract_id::text);
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

create sequence public.booking_number_seq;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_number text not null unique
    default ('B-' || lpad(nextval('public.booking_number_seq')::text, 6, '0')),
  booking_type text not null check (booking_type in ('instant', 'quote')),
  customer_id uuid not null references public.profiles (id),
  professional_id uuid not null references public.professional_profiles (id),
  service_id uuid references public.services (id) on delete set null,
  request_id uuid references public.service_requests (id),
  quotation_id uuid unique references public.quotations (id),
  contract_id uuid unique references public.contracts (id),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  location_city text check (char_length(location_city) <= 80),
  location_address text check (char_length(location_address) <= 300),
  customer_notes text check (char_length(customer_notes) <= 2000),
  status text not null check (status in (
    'requested', 'awaiting_professional', 'awaiting_quote', 'awaiting_customer_acceptance', 'awaiting_contract',
    'awaiting_payment', 'confirmed', 'in_progress', 'completed', 'cancellation_requested', 'cancelled',
    'disputed', 'expired')),
  previous_status text,
  payment_status text not null default 'unpaid' check (payment_status in (
    'not_required', 'unpaid', 'pending', 'deposit_paid', 'paid', 'failed', 'partially_refunded', 'refunded')),
  amount_total_cents bigint not null check (amount_total_cents >= 0),
  amount_due_now_cents bigint not null check (amount_due_now_cents >= 0),
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  currency char(3) not null default 'PHP' check (currency = 'PHP'),
  payment_due_by timestamptz,
  cancellation_requested_by uuid references public.profiles (id),
  cancellation_reason text check (char_length(cancellation_reason) <= 1000),
  cancelled_at timestamptz,
  reschedule_requested_by uuid references public.profiles (id),
  reschedule_proposed_start timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  check (amount_due_now_cents <= amount_total_cents),
  -- Database-level guarantee against double-booking, safe under concurrent requests.
  constraint bookings_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(scheduled_start, scheduled_end, '[)') with &&
  ) where (status in ('awaiting_contract', 'awaiting_payment', 'confirmed', 'in_progress', 'cancellation_requested'))
);
create index bookings_customer_idx on public.bookings (customer_id, scheduled_start desc);
create index bookings_professional_idx on public.bookings (professional_id, scheduled_start);
create index bookings_status_idx on public.bookings (status);
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

alter table public.contracts add constraint contracts_booking_fk foreign key (booking_id) references public.bookings (id);

create or replace function public.is_booking_party(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.bookings b
                  where b.id = p_booking_id
                    and (b.customer_id = auth.uid() or b.professional_id = public.my_professional_id()))
$$;

create or replace function public.booking_counterpart(p_booking public.bookings, p_actor uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_booking.customer_id = p_actor then public.professional_user_id(p_booking.professional_id)
              else p_booking.customer_id end
$$;

create or replace function public.accept_quotation(p_quotation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_q public.quotations;
  v_req public.service_requests;
  v_pro public.professional_profiles;
  v_snapshot jsonb;
  v_booking_id uuid;
  v_contract_id uuid;
  v_from text;
begin
  select * into v_q from public.quotations where id = p_quotation_id for update;
  if not found or v_q.customer_id <> v_uid or v_q.status = 'draft' then
    raise exception 'Quotation not found.' using errcode = 'P0002';
  end if;
  if v_q.status not in ('sent', 'viewed') then
    raise exception 'This quotation is % and can no longer be accepted.', v_q.status using errcode = '22023';
  end if;
  if v_q.valid_until < public.today_manila() then
    raise exception 'This quotation has expired. Ask the professional for a new one.' using errcode = '22023';
  end if;
  if exists (select 1 from public.quotations where quote_number = v_q.quote_number and revision > v_q.revision
              and status not in ('draft')) then
    raise exception 'A newer revision of this quotation exists.' using errcode = '22023';
  end if;
  if v_q.proposed_start <= now() then
    raise exception 'The proposed schedule has passed. Ask the professional for a revised quotation.' using errcode = '22023';
  end if;
  select * into v_pro from public.professional_profiles where id = v_q.professional_id;
  if v_pro.status <> 'published' then
    raise exception 'This professional is not currently accepting bookings.' using errcode = '22023';
  end if;
  select * into v_req from public.service_requests where id = v_q.request_id;
  v_from := v_q.status;

  v_snapshot := jsonb_build_object(
    'quote', to_jsonb(v_q) - 'accepted_snapshot' - 'customer_note',
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                         'kind', kind, 'description', description, 'quantity', quantity,
                         'unit_price_cents', unit_price_cents, 'line_total_cents', line_total_cents)
                         order by sort_order, created_at)
                        from public.quotation_items where quotation_id = v_q.id), '[]'),
    'professional', jsonb_build_object('id', v_pro.id, 'display_name', v_pro.display_name,
                                       'business_name', v_pro.business_name, 'slug', v_pro.slug),
    'customer', jsonb_build_object('id', v_uid, 'full_name', (select full_name from public.profiles where id = v_uid)),
    'accepted_at', now());

  update public.quotations set status = 'accepted', decided_at = now(), accepted_snapshot = v_snapshot
   where id = v_q.id returning * into v_q;

  insert into public.bookings (booking_type, customer_id, professional_id, service_id, request_id, quotation_id,
    scheduled_start, scheduled_end, location_city, location_address, status, payment_status,
    amount_total_cents, amount_due_now_cents)
  values ('quote', v_uid, v_q.professional_id, v_req.service_id, v_req.id, v_q.id,
    v_q.proposed_start, v_q.proposed_start + make_interval(mins => v_q.estimated_duration_minutes),
    v_req.location_city, v_req.location_address, 'awaiting_contract', 'unpaid',
    v_q.total_cents, round(v_q.total_cents * v_q.deposit_percent / 100.0)::bigint)
  returning id into v_booking_id;

  insert into public.contracts (quotation_id, booking_id, customer_id, professional_id)
  values (v_q.id, v_booking_id, v_uid, v_q.professional_id) returning id into v_contract_id;
  update public.bookings set contract_id = v_contract_id where id = v_booking_id;
  perform public.add_contract_version(v_contract_id,
    coalesce((select value from public.platform_settings where key = 'contract_terms'), '{}'));

  perform public.log_event('quotation', v_q.id, 'accepted', v_from, 'accepted',
    jsonb_build_object('total_cents', v_q.total_cents));
  perform public.log_event('booking', v_booking_id, 'created', null, 'awaiting_contract',
    jsonb_build_object('quotation_id', v_q.id));
  perform public.notify(v_pro.user_id, 'quote_accepted', 'Quotation accepted',
    v_q.title || ' — review and sign the contract.', '/contracts/' || v_contract_id::text,
    'quote_accepted:' || v_q.id::text);
  return jsonb_build_object('booking_id', v_booking_id, 'contract_id', v_contract_id);
end $$;

create or replace function public.sign_contract(
  p_contract_id uuid, p_version int, p_signer_name text, p_consent boolean)
returns public.contracts language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_c public.contracts;
  v_v public.contract_versions;
  v_role text;
  v_headers json;
  v_count int;
  v_booking public.bookings;
  v_hold int;
begin
  select * into v_c from public.contracts where id = p_contract_id for update;
  if not found or not public.is_contract_party(p_contract_id) then
    raise exception 'Contract not found.' using errcode = 'P0002';
  end if;
  if p_consent is not true then
    raise exception 'You must confirm that you have read and agree to this contract.' using errcode = '22023';
  end if;
  if v_c.status not in ('pending_signatures', 'partially_signed') then
    raise exception 'This contract is % and cannot be signed.', v_c.status using errcode = '22023';
  end if;
  if p_version is distinct from v_c.current_version then
    raise exception 'A newer version of this contract exists. Review it before signing.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_signer_name, ''))) < 2 then
    raise exception 'Type your full name to sign.' using errcode = '22023';
  end if;
  v_role := case when v_c.customer_id = v_uid then 'customer' else 'professional' end;
  select * into v_v from public.contract_versions where contract_id = v_c.id and version = v_c.current_version;
  if exists (select 1 from public.contract_signatures where contract_version_id = v_v.id and signer_role = v_role) then
    raise exception 'You have already signed this version.' using errcode = '22023';
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  insert into public.contract_signatures (contract_version_id, signer_id, signer_role, signer_name,
    consent_statement, content_hash, ip_address, user_agent)
  values (v_v.id, v_uid, v_role, btrim(p_signer_name),
    'I have reviewed contract ' || v_c.contract_number || ' version ' || v_v.version ||
    ' and agree to be bound by its terms. I understand that typing my name records my acceptance.',
    v_v.content_hash,
    left(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), 64),
    left(v_headers ->> 'user-agent', 500));

  select count(*) into v_count from public.contract_signatures where contract_version_id = v_v.id;
  if v_count = 2 then
    update public.contracts set status = 'signed', signed_at = now() where id = v_c.id returning * into v_c;
    select * into v_booking from public.bookings where id = v_c.booking_id for update;
    if v_booking.status = 'awaiting_contract' then
      select coalesce((value #>> '{}')::int, 45) into v_hold from public.platform_settings where key = 'payment_hold_minutes';
      if v_booking.amount_due_now_cents > 0 then
        -- Quote-based deposits get at least 24 hours to pay; the slot stays held meanwhile.
        update public.bookings set status = 'awaiting_payment',
               payment_due_by = now() + make_interval(mins => greatest(coalesce(v_hold, 45), 1440))
         where id = v_booking.id;
      else
        update public.bookings set status = 'confirmed', payment_status = 'not_required' where id = v_booking.id;
      end if;
      perform public.log_event('booking', v_booking.id, 'contract_signed', 'awaiting_contract',
        case when v_booking.amount_due_now_cents > 0 then 'awaiting_payment' else 'confirmed' end);
    end if;
    perform public.notify(v_c.customer_id, 'contract_signed', 'Contract fully signed',
      case when v_booking.amount_due_now_cents > 0 then 'Complete the deposit payment to confirm your booking.'
           else 'Your booking is confirmed.' end,
      '/dashboard/bookings/' || v_c.booking_id::text, 'contract_signed_c:' || v_v.id::text);
    perform public.notify(public.professional_user_id(v_c.professional_id), 'contract_signed', 'Contract fully signed',
      v_c.contract_number, '/pro-dashboard/bookings/' || v_c.booking_id::text, 'contract_signed_p:' || v_v.id::text);
  else
    update public.contracts set status = 'partially_signed' where id = v_c.id returning * into v_c;
    perform public.notify(case when v_role = 'customer' then public.professional_user_id(v_c.professional_id)
                               else v_c.customer_id end,
      'contract_signature_requested', 'Your signature is needed', v_c.contract_number || ' was signed by the other party.',
      '/contracts/' || v_c.id::text);
  end if;
  perform public.log_event('contract', v_c.id, 'signed', null, v_c.status,
    jsonb_build_object('version', v_v.version, 'role', v_role, 'content_hash', v_v.content_hash));
  return v_c;
end $$;

create or replace function public.create_instant_booking(
  p_service_id uuid, p_start timestamptz, p_location_city text, p_location_address text, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_s public.services;
  v_pro public.professional_profiles;
  v_mode text;
  v_hold int;
  v_id uuid;
  v_online boolean;
begin
  select * into v_s from public.services where id = p_service_id and status = 'active' and instant_booking;
  if not found then
    raise exception 'This service cannot be booked instantly.' using errcode = 'P0002';
  end if;
  select * into v_pro from public.professional_profiles where id = v_s.professional_id and status = 'published';
  if not found then
    raise exception 'This professional is not accepting bookings.' using errcode = 'P0002';
  end if;
  if v_pro.user_id = v_uid then
    raise exception 'You cannot book your own service.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_location_city, ''))) < 2 or char_length(btrim(coalesce(p_location_address, ''))) < 5 then
    raise exception 'Enter the service address.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.get_available_slots(v_pro.id, (p_start at time zone v_pro.timezone)::date,
                                             (p_start at time zone v_pro.timezone)::date, v_s.duration_minutes) s
     where s = p_start) then
    raise exception 'That time is no longer available. Choose another slot.' using errcode = '23P01';
  end if;
  select value #>> '{}' into v_mode from public.platform_settings where key = 'instant_booking_payment_mode';
  select coalesce((value #>> '{}')::int, 45) into v_hold from public.platform_settings where key = 'payment_hold_minutes';
  v_online := coalesce(v_mode, 'online') = 'online';

  insert into public.bookings (booking_type, customer_id, professional_id, service_id, scheduled_start, scheduled_end,
    location_city, location_address, customer_notes, status, payment_status, amount_total_cents,
    amount_due_now_cents, payment_due_by)
  values ('instant', v_uid, v_pro.id, v_s.id, p_start, p_start + make_interval(mins => v_s.duration_minutes),
    btrim(p_location_city), btrim(p_location_address), nullif(btrim(p_notes), ''),
    case when v_online then 'awaiting_payment' else 'confirmed' end,
    case when v_online then 'unpaid' else 'not_required' end,
    v_s.price_cents, case when v_online then v_s.price_cents else 0 end,
    case when v_online then now() + make_interval(mins => coalesce(v_hold, 45)) end)
  returning id into v_id;

  perform public.log_event('booking', v_id, 'created', null,
    case when v_online then 'awaiting_payment' else 'confirmed' end, jsonb_build_object('service_id', v_s.id));
  perform public.notify(v_pro.user_id, 'booking_new', 'New booking: ' || v_s.name,
    to_char(p_start at time zone v_pro.timezone, 'Mon DD, YYYY HH12:MI AM'),
    '/pro-dashboard/bookings/' || v_id::text, 'booking_new:' || v_id::text);
  return v_id;
end $$;

-- One function for all party-initiated booking transitions keeps the rules in a single place.
create or replace function public.booking_action(p_booking_id uuid, p_action text, p_reason text default null,
  p_new_start timestamptz default null)
returns public.bookings language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_b public.bookings;
  v_is_customer boolean;
  v_is_pro boolean;
  v_from text;
  v_other uuid;
  v_title text;
  v_refundable bigint;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  v_is_customer := v_b.customer_id = v_uid;
  v_is_pro := coalesce(v_b.professional_id = public.my_professional_id(), false);
  if not (v_is_customer or v_is_pro) then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  v_from := v_b.status;
  v_other := public.booking_counterpart(v_b, v_uid);

  if p_action = 'start' then
    if not v_is_pro or v_b.status <> 'confirmed' then
      raise exception 'Only a confirmed booking can be started by the professional.' using errcode = '22023';
    end if;
    update public.bookings set status = 'in_progress', started_at = now() where id = v_b.id returning * into v_b;
    v_title := 'Your job has started';

  elsif p_action = 'complete' then
    if not v_is_pro or v_b.status <> 'in_progress' then
      raise exception 'Only a job in progress can be marked completed by the professional.' using errcode = '22023';
    end if;
    update public.bookings set status = 'completed', completed_at = now() where id = v_b.id returning * into v_b;
    v_title := 'Job completed — leave a review';

  elsif p_action = 'cancel' then
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'Give a reason for cancelling.' using errcode = '22023';
    end if;
    if v_b.status in ('awaiting_contract', 'awaiting_payment') and v_b.amount_paid_cents = 0 then
      update public.bookings set status = 'cancelled', cancelled_at = now(), cancellation_reason = btrim(p_reason),
             cancellation_requested_by = v_uid
       where id = v_b.id returning * into v_b;
      update public.contracts set status = 'void' where id = v_b.contract_id and status <> 'signed';
      v_title := 'Booking cancelled';
    elsif v_b.status in ('awaiting_contract', 'awaiting_payment', 'confirmed', 'in_progress') then
      update public.bookings set previous_status = status, status = 'cancellation_requested',
             cancellation_requested_by = v_uid, cancellation_reason = btrim(p_reason)
       where id = v_b.id returning * into v_b;
      v_title := 'Cancellation requested';
    else
      raise exception 'A booking that is % cannot be cancelled.', v_b.status using errcode = '22023';
    end if;

  elsif p_action in ('approve_cancellation', 'reject_cancellation') then
    if v_b.status <> 'cancellation_requested' or v_b.cancellation_requested_by = v_uid then
      raise exception 'There is no cancellation request for you to answer.' using errcode = '22023';
    end if;
    if p_action = 'approve_cancellation' then
      update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_b.id returning * into v_b;
      v_refundable := v_b.amount_paid_cents - coalesce((select sum(amount_cents) from public.refunds
                        where booking_id = v_b.id and status not in ('rejected', 'failed')), 0);
      if v_refundable > 0 then
        -- Cancelling does not move money. An administrator reviews refunds against the payment arrangement.
        insert into public.refunds (payment_record_id, booking_id, amount_cents, status, reason, requested_by)
        select pr.id, v_b.id, least(v_refundable, pr.amount_cents), 'pending_review', 'Booking cancelled: ' || coalesce(v_b.cancellation_reason, ''), v_uid
          from public.payment_records pr
         where pr.booking_id = v_b.id and pr.status = 'paid'
         order by pr.paid_at desc limit 1;
      end if;
      v_title := 'Cancellation approved';
    else
      update public.bookings set status = previous_status, previous_status = null,
             cancellation_requested_by = null, cancellation_reason = null
       where id = v_b.id returning * into v_b;
      v_title := 'Cancellation declined';
    end if;

  elsif p_action = 'propose_reschedule' then
    if v_b.status not in ('awaiting_contract', 'awaiting_payment', 'confirmed') then
      raise exception 'This booking cannot be rescheduled.' using errcode = '22023';
    end if;
    if p_new_start is null or p_new_start <= now() then
      raise exception 'Choose a future date and time.' using errcode = '22023';
    end if;
    update public.bookings set reschedule_requested_by = v_uid, reschedule_proposed_start = p_new_start
     where id = v_b.id returning * into v_b;
    v_title := 'New schedule proposed';

  elsif p_action in ('accept_reschedule', 'reject_reschedule') then
    if v_b.reschedule_proposed_start is null or v_b.reschedule_requested_by = v_uid then
      raise exception 'There is no schedule proposal for you to answer.' using errcode = '22023';
    end if;
    if p_action = 'accept_reschedule' then
      if v_b.reschedule_proposed_start <= now() then
        raise exception 'The proposed time has passed.' using errcode = '22023';
      end if;
      update public.bookings
         set scheduled_end = reschedule_proposed_start + (scheduled_end - scheduled_start),
             scheduled_start = reschedule_proposed_start,
             reschedule_proposed_start = null, reschedule_requested_by = null
       where id = v_b.id returning * into v_b;
      v_title := 'Schedule change accepted';
    else
      update public.bookings set reschedule_proposed_start = null, reschedule_requested_by = null
       where id = v_b.id returning * into v_b;
      v_title := 'Schedule change declined';
    end if;

  elsif p_action = 'dispute' then
    if v_b.status not in ('confirmed', 'in_progress', 'completed', 'cancellation_requested', 'cancelled') then
      raise exception 'A booking that is % cannot be disputed.', v_b.status using errcode = '22023';
    end if;
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'Describe the problem.' using errcode = '22023';
    end if;
    insert into public.disputes (booking_id, opened_by, reason) values (v_b.id, v_uid, btrim(p_reason));
    update public.bookings set previous_status = status, status = 'disputed' where id = v_b.id returning * into v_b;
    perform public.notify(ur.user_id, 'dispute_opened', 'Dispute opened on ' || v_b.booking_number, left(p_reason, 140),
      '/admin/disputes') from public.user_roles ur where ur.role = 'admin';
    v_title := 'A dispute was opened';

  else
    raise exception 'Unknown action.' using errcode = '22023';
  end if;

  perform public.log_event('booking', v_b.id, p_action, v_from, v_b.status,
    jsonb_strip_nulls(jsonb_build_object('reason', p_reason, 'new_start', p_new_start)));
  perform public.notify(v_other, 'booking_' || p_action, v_title, v_b.booking_number,
    '/bookings/' || v_b.id::text);
  return v_b;
end $$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_versions enable row level security;
alter table public.contract_signatures enable row level security;
alter table public.bookings enable row level security;

create policy quotations_select on public.quotations for select to authenticated
  using (professional_id = public.my_professional_id()
         or (customer_id = auth.uid() and status <> 'draft')
         or public.is_admin());
create policy quotations_update_draft on public.quotations for update to authenticated
  using (professional_id = public.my_professional_id() and status = 'draft')
  with check (professional_id = public.my_professional_id() and status = 'draft');
create policy quotations_delete_draft on public.quotations for delete to authenticated
  using (professional_id = public.my_professional_id() and status = 'draft');

create policy quotation_items_select on public.quotation_items for select to authenticated
  using (public.can_view_quotation(quotation_id));
create policy quotation_items_insert on public.quotation_items for insert to authenticated
  with check (public.can_edit_quotation(quotation_id));
create policy quotation_items_update on public.quotation_items for update to authenticated
  using (public.can_edit_quotation(quotation_id)) with check (public.can_edit_quotation(quotation_id));
create policy quotation_items_delete on public.quotation_items for delete to authenticated
  using (public.can_edit_quotation(quotation_id));

create policy contracts_select on public.contracts for select to authenticated
  using (public.is_contract_party(id) or public.is_admin());
create policy contract_versions_select on public.contract_versions for select to authenticated
  using (public.is_contract_party(contract_id) or public.is_admin());
create policy contract_signatures_select on public.contract_signatures for select to authenticated
  using (exists (select 1 from public.contract_versions v where v.id = contract_version_id
                  and (public.is_contract_party(v.contract_id) or public.is_admin())));

create policy bookings_select on public.bookings for select to authenticated
  using (customer_id = auth.uid() or professional_id = public.my_professional_id() or public.is_admin());

create or replace function public.can_access_entity(p_entity_type text, p_entity_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case p_entity_type
    when 'service_request' then public.is_request_party(p_entity_id)
    when 'quotation' then public.can_view_quotation(p_entity_id)
    when 'contract' then public.is_contract_party(p_entity_id)
    when 'booking' then public.is_booking_party(p_entity_id)
    else false end
$$;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_admin() or public.can_access_entity(entity_type, entity_id));

grant select, delete on public.quotations to authenticated;
grant update (title, scope_of_work, notes, estimated_duration_minutes, proposed_start, payment_terms, exclusions,
  warranty_terms, valid_until, discount_cents, tax_rate_bp, deposit_percent) on public.quotations to authenticated;
grant select, delete on public.quotation_items to authenticated;
grant insert (quotation_id, kind, description, quantity, unit_price_cents, sort_order) on public.quotation_items to authenticated;
grant update (kind, description, quantity, unit_price_cents, sort_order) on public.quotation_items to authenticated;
grant select on public.contracts, public.contract_versions, public.contract_signatures, public.bookings to authenticated;

grant execute on function public.can_view_quotation(uuid) to authenticated;
grant execute on function public.can_edit_quotation(uuid) to authenticated;
grant execute on function public.is_contract_party(uuid) to authenticated;
grant execute on function public.is_booking_party(uuid) to authenticated;
grant execute on function public.can_access_entity(text, uuid) to authenticated;
grant execute on function public.create_quotation(uuid) to authenticated;
grant execute on function public.send_quotation(uuid) to authenticated;
grant execute on function public.mark_quotation_viewed(uuid) to authenticated;
grant execute on function public.customer_quotation_decision(uuid, text, text) to authenticated;
grant execute on function public.withdraw_quotation(uuid) to authenticated;
grant execute on function public.revise_quotation(uuid) to authenticated;
grant execute on function public.accept_quotation(uuid) to authenticated;
grant execute on function public.amend_contract(uuid, jsonb) to authenticated;
grant execute on function public.sign_contract(uuid, int, text, boolean) to authenticated;
grant execute on function public.create_instant_booking(uuid, timestamptz, text, text, text) to authenticated;
grant execute on function public.booking_action(uuid, text, text, timestamptz) to authenticated;
