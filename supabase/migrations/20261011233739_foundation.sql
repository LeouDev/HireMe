-- Hire Me! — foundation: privileges, helpers, accounts, professional profiles, services, availability.
-- Conventions:
--   * Money is integer centavos (bigint). Never floats.
--   * Every table has RLS. Clients get explicit column-level grants; workflow state changes go
--     through SECURITY DEFINER functions that validate the actor and the transition.
--   * Supabase grants ALL to anon/authenticated by default; we revoke those defaults here.

create extension if not exists btree_gist with schema extensions;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
-- EXECUTE-to-PUBLIC is a global built-in default; a per-schema revoke cannot remove it.
alter default privileges revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.today_manila()
returns date language sql stable set search_path = public, pg_temp as $$
  select (now() at time zone 'Asia/Manila')::date
$$;

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = public, pg_temp as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_path text check (char_length(avatar_path) <= 300),
  is_suspended boolean not null default false,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Administrator capability is granted only by trusted SQL (service role / dashboard), never by clients.
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid,
  primary key (user_id, role)
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Raises unless the caller is a signed-in, non-suspended user. Returns the caller id.
create or replace function public.require_active_user()
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You need to sign in to do that.' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_suspended) then
    raise exception 'Your account is suspended. Contact support.' using errcode = '42501';
  end if;
  return v_uid;
end $$;

-- ---------------------------------------------------------------------------
-- Platform configuration (non-secret, admin-editable)
-- ---------------------------------------------------------------------------

create table public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_]{2,64}$'),
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

insert into public.platform_settings (key, value, description) values
  ('instant_booking_payment_mode', '"online"',
   'online = instant bookings require PayMongo checkout; pay_on_site = customer pays the professional directly.'),
  ('payment_hold_minutes', '45', 'How long an unpaid booking holds its time slot.'),
  ('request_expiry_days', '30', 'Requests with no professional action expire after this many days.'),
  ('message_rate_limit_per_minute', '20', 'Maximum messages one user may send per minute.'),
  ('contract_terms', jsonb_build_object(
     'notice', 'TEMPLATE TERMS — NOT LEGAL ADVICE. These default clauses are placeholders and must be reviewed by a lawyer licensed in the Philippines before production use.',
     'cancellation', 'Either party may request cancellation through the platform. Cancellation of a confirmed booking requires the other party''s approval or an administrator decision. Any refund depends on the payment arrangement in effect and is not automatic.',
     'rescheduling', 'Either party may propose a new schedule through the platform. The schedule changes only when the other party accepts.',
     'completion', 'Work is considered complete when the professional marks the booking completed and the customer does not open a dispute within 7 days.',
     'dispute_resolution', 'The parties will first attempt to resolve disputes in good faith through the platform. Unresolved disputes may be escalated to platform administrators, without prejudice to remedies available under Philippine law.',
     'general', 'This agreement is between the customer and the professional. The platform facilitates communication, scheduling and payment tracking and is not a party to the service agreement.'
   ), 'Default contract clauses inserted into generated contracts.');

-- ---------------------------------------------------------------------------
-- Categories and subscription plans (reference data)
-- ---------------------------------------------------------------------------

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 60),
  description text check (char_length(description) <= 300),
  icon text check (char_length(icon) <= 40),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger service_categories_touch before update on public.service_categories
  for each row execute function public.touch_updated_at();

insert into public.service_categories (slug, name, description, icon, sort_order) values
  ('plumbing', 'Plumbing', 'Leaks, pipes, fixtures, water heaters and drainage.', 'droplets', 10),
  ('electrical', 'Electrical', 'Wiring, outlets, lighting, panels and inspections.', 'zap', 20),
  ('carpentry', 'Carpentry', 'Cabinets, furniture, doors, framing and repairs.', 'hammer', 30),
  ('air-conditioning', 'Air Conditioning', 'Aircon cleaning, installation and repair.', 'snowflake', 40),
  ('painting', 'Painting', 'Interior and exterior painting and finishing.', 'paint-roller', 50),
  ('appliance-repair', 'Appliance Repair', 'Washing machines, refrigerators and other appliances.', 'wrench', 60),
  ('cleaning', 'Cleaning', 'Home, office and post-construction cleaning.', 'sparkles', 70),
  ('construction', 'Construction', 'Renovations, extensions and general construction.', 'hard-hat', 80),
  ('welding', 'Welding', 'Gates, grills, railings and metal fabrication.', 'flame', 90),
  ('masonry', 'Masonry', 'Concrete, tiling, block work and plastering.', 'brick-wall', 100),
  ('landscaping', 'Landscaping', 'Gardens, lawns, trimming and outdoor spaces.', 'trees', 110),
  ('home-maintenance', 'Home Maintenance', 'General handyman work and small repairs.', 'house', 120);

-- Prices are illustrative hypotheses, editable by administrators; never hardcode them in the UI.
create table public.subscription_plans (
  code text primary key check (code ~ '^[a-z0-9_]{2,32}$'),
  name text not null,
  description text,
  price_cents bigint not null check (price_cents >= 0),
  currency char(3) not null default 'PHP',
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  max_active_services int check (max_active_services > 0),
  features text[] not null default '{}',
  is_active boolean not null default true,
  sort_order int not null default 100
);

insert into public.subscription_plans (code, name, description, price_cents, max_active_services, features, sort_order) values
  ('free', 'Free', 'Everything you need to get started.', 0, 3,
   array['Shareable professional page', 'Up to 3 active services', 'Customer inquiries and messaging'], 10),
  ('professional', 'Professional', 'For independent professionals growing their business.', 29900, 30,
   array['Up to 30 active services', 'Quotations and contracts', 'Availability and booking management'], 20),
  ('business', 'Business', 'For teams and service businesses.', 79900, null,
   array['Unlimited services', 'Team features (planned)', 'Additional reporting (planned)'], 30);

-- ---------------------------------------------------------------------------
-- Professional profiles (the public mini-website)
-- ---------------------------------------------------------------------------

create table public.professional_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$' and slug !~ '--'),
  display_name text not null check (char_length(display_name) between 2 and 80),
  business_name text check (char_length(business_name) <= 120),
  headline text check (char_length(headline) <= 160),
  bio text check (char_length(bio) <= 5000),
  years_experience int check (years_experience between 0 and 80),
  city text check (char_length(city) <= 80),
  province text check (char_length(province) <= 80),
  languages text[] not null default '{}' check (cardinality(languages) <= 10),
  certifications text check (char_length(certifications) <= 2000),
  licenses text check (char_length(licenses) <= 2000),
  avatar_path text check (char_length(avatar_path) <= 300),
  cover_path text check (char_length(cover_path) <= 300),
  -- Only contact details the professional explicitly chooses to publish.
  public_phone text check (char_length(public_phone) <= 30),
  public_email text check (char_length(public_email) <= 254),
  working_hours_note text check (char_length(working_hours_note) <= 500),
  faqs jsonb not null default '[]' check (jsonb_typeof(faqs) = 'array' and jsonb_array_length(faqs) <= 20),
  timezone text not null default 'Asia/Manila',
  slot_minutes int not null default 60 check (slot_minutes between 15 and 480),
  min_notice_hours int not null default 24 check (min_notice_hours between 0 and 720),
  booking_window_days int not null default 60 check (booking_window_days between 1 and 365),
  status text not null default 'draft' check (status in ('draft', 'published', 'suspended')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected', 'suspended')),
  verified_kinds text[] not null default '{}',
  rating_avg numeric(3, 2),
  review_count int not null default 0,
  published_at timestamptz,
  last_active_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(display_name, '') || ' ' || coalesce(business_name, '') || ' ' ||
      coalesce(headline, '') || ' ' || coalesce(bio, '') || ' ' || coalesce(city, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index professional_profiles_status_idx on public.professional_profiles (status);
create index professional_profiles_city_idx on public.professional_profiles (lower(city));
create index professional_profiles_search_idx on public.professional_profiles using gin (search_vector);

create or replace function public.professional_profiles_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  perform now() at time zone new.timezone; -- raises on an invalid time zone name
  if new.slug in ('admin', 'api', 'dashboard', 'login', 'register', 'help', 'support', 'new', 'edit', 'settings', 'pro') then
    raise exception 'That page address is reserved. Choose another.' using errcode = '23514';
  end if;
  new.last_active_at := now();
  return new;
end $$;
create trigger professional_profiles_guard before insert or update on public.professional_profiles
  for each row execute function public.professional_profiles_guard();
create trigger professional_profiles_touch before update on public.professional_profiles
  for each row execute function public.touch_updated_at();

create or replace function public.my_professional_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.professional_profiles where user_id = auth.uid()
$$;

create or replace function public.slugify(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select trim(both '-' from regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g'))
$$;

-- Creates the caller's professional profile with a unique slug derived from the requested one.
create or replace function public.become_professional(p_display_name text, p_city text, p_slug text default null)
returns public.professional_profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_base text;
  v_slug text;
  v_n int := 1;
  v_row public.professional_profiles;
begin
  select * into v_row from public.professional_profiles where user_id = v_uid;
  if found then
    return v_row;
  end if;
  v_base := left(public.slugify(coalesce(nullif(p_slug, ''), p_display_name)), 50);
  if char_length(v_base) < 3 then
    v_base := v_base || '-pro';
    v_base := trim(both '-' from v_base);
  end if;
  v_slug := v_base;
  while exists (select 1 from public.professional_profiles where slug = v_slug)
        or v_slug in ('admin', 'api', 'dashboard', 'login', 'register', 'help', 'support', 'new', 'edit', 'settings', 'pro') loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  insert into public.professional_profiles (user_id, slug, display_name, city)
  values (v_uid, v_slug, trim(p_display_name), nullif(trim(p_city), ''))
  returning * into v_row;
  return v_row;
end $$;

create table public.professional_categories (
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  category_id uuid not null references public.service_categories (id) on delete cascade,
  primary key (professional_id, category_id)
);
create index professional_categories_category_idx on public.professional_categories (category_id);

create table public.professional_service_areas (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  city text not null check (char_length(city) between 2 and 80),
  area text check (char_length(area) <= 80),
  created_at timestamptz not null default now()
);
create unique index professional_service_areas_unique
  on public.professional_service_areas (professional_id, lower(city), lower(coalesce(area, '')));
create index professional_service_areas_city_idx on public.professional_service_areas (lower(city));

create table public.professional_subscriptions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  plan_code text not null references public.subscription_plans (code),
  status text not null check (status in ('pending_payment', 'active', 'past_due', 'cancelled')),
  current_period_end timestamptz,
  provider text,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index professional_subscriptions_one_active
  on public.professional_subscriptions (professional_id) where status = 'active';
create trigger professional_subscriptions_touch before update on public.professional_subscriptions
  for each row execute function public.touch_updated_at();

create or replace function public.effective_plan(p_professional_id uuid)
returns public.subscription_plans
language sql stable security definer set search_path = public, pg_temp as $$
  select p.* from public.subscription_plans p
  where p.code = coalesce(
    (select s.plan_code from public.professional_subscriptions s
      where s.professional_id = p_professional_id and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
      limit 1),
    'free')
$$;

-- ---------------------------------------------------------------------------
-- Services and portfolio
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  category_id uuid references public.service_categories (id),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$'),
  description text check (char_length(description) <= 5000),
  pricing_model text not null check (pricing_model in ('fixed', 'starting', 'hourly', 'quote')),
  price_cents bigint check (price_cents between 0 and 100000000000),
  duration_minutes int check (duration_minutes between 15 and 10080),
  service_area_note text check (char_length(service_area_note) <= 500),
  materials_included text check (char_length(materials_included) <= 2000),
  materials_excluded text check (char_length(materials_excluded) <= 2000),
  preparation_notes text check (char_length(preparation_notes) <= 2000),
  requires_inspection boolean not null default false,
  instant_booking boolean not null default false,
  images text[] not null default '{}' check (cardinality(images) <= 8),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, slug),
  constraint services_price_matches_model check ((pricing_model = 'quote') = (price_cents is null)),
  constraint services_instant_requires_fixed check (
    not instant_booking or (pricing_model = 'fixed' and duration_minutes is not null and not requires_inspection))
);
create index services_professional_idx on public.services (professional_id, status);
create index services_category_idx on public.services (category_id) where status = 'active';
create trigger services_touch before update on public.services
  for each row execute function public.touch_updated_at();

create or replace function public.services_enforce_plan_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limit int;
  v_count int;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    select max_active_services into v_limit from public.effective_plan(new.professional_id);
    if v_limit is not null then
      select count(*) into v_count from public.services
       where professional_id = new.professional_id and status = 'active' and id <> new.id;
      if v_count >= v_limit then
        raise exception 'Your plan allows % active services. Deactivate one or upgrade your plan.', v_limit
          using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger services_plan_limit before insert or update on public.services
  for each row execute function public.services_enforce_plan_limit();

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text check (char_length(description) <= 2000),
  images text[] not null check (cardinality(images) between 1 and 12),
  completed_on date,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index portfolio_items_professional_idx on public.portfolio_items (professional_id, sort_order);
create trigger portfolio_items_touch before update on public.portfolio_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Availability (local wall-clock times in the professional's time zone)
-- ---------------------------------------------------------------------------

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index availability_rules_professional_idx on public.availability_rules (professional_id, weekday);

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  on_date date not null,
  start_time time, -- null start/end = whole day blocked
  end_time time,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or end_time > start_time)
);
create index availability_exceptions_professional_idx on public.availability_exceptions (professional_id, on_date);

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, professional_id)
);

-- Publishing requires a minimally complete page so customers never land on an empty profile.
create or replace function public.set_profile_published(p_publish boolean)
returns public.professional_profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_row public.professional_profiles;
begin
  select * into v_row from public.professional_profiles where user_id = v_uid for update;
  if not found then
    raise exception 'Create your professional profile first.' using errcode = 'P0002';
  end if;
  if v_row.status = 'suspended' then
    raise exception 'This profile is suspended. Contact support.' using errcode = '42501';
  end if;
  if p_publish then
    if coalesce(v_row.city, '') = '' then
      raise exception 'Add your city before publishing.' using errcode = '23514';
    end if;
    if coalesce(v_row.headline, '') = '' and coalesce(v_row.bio, '') = '' then
      raise exception 'Add a short introduction or biography before publishing.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.professional_categories where professional_id = v_row.id) then
      raise exception 'Choose at least one service category before publishing.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.services where professional_id = v_row.id and status = 'active') then
      raise exception 'Add at least one active service before publishing.' using errcode = '23514';
    end if;
    update public.professional_profiles
       set status = 'published', published_at = coalesce(published_at, now())
     where id = v_row.id returning * into v_row;
  else
    update public.professional_profiles set status = 'draft' where id = v_row.id returning * into v_row;
  end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.service_categories enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.professional_profiles enable row level security;
alter table public.professional_categories enable row level security;
alter table public.professional_service_areas enable row level security;
alter table public.professional_subscriptions enable row level security;
alter table public.services enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.favorites enable row level security;

create or replace function public.is_published_professional(p_professional_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.professional_profiles where id = p_professional_id and status = 'published')
$$;

-- profiles: policy for "related users" is added in the requests migration (needs those tables).
create policy profiles_select_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy user_roles_select_self on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy platform_settings_read on public.platform_settings for select to anon, authenticated using (true);

create policy categories_read on public.service_categories for select to anon, authenticated
  using (is_active or public.is_admin());
create policy categories_admin_insert on public.service_categories for insert to authenticated
  with check (public.is_admin());
create policy categories_admin_update on public.service_categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy plans_read on public.subscription_plans for select to anon, authenticated
  using (is_active or public.is_admin());
create policy plans_admin_update on public.subscription_plans for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy pro_select on public.professional_profiles for select to anon, authenticated
  using (status = 'published' or user_id = auth.uid() or public.is_admin());
create policy pro_update_own on public.professional_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy pro_categories_select on public.professional_categories for select to anon, authenticated
  using (public.is_published_professional(professional_id) or professional_id = public.my_professional_id() or public.is_admin());
create policy pro_categories_insert on public.professional_categories for insert to authenticated
  with check (professional_id = public.my_professional_id());
create policy pro_categories_delete on public.professional_categories for delete to authenticated
  using (professional_id = public.my_professional_id());

create policy service_areas_select on public.professional_service_areas for select to anon, authenticated
  using (public.is_published_professional(professional_id) or professional_id = public.my_professional_id() or public.is_admin());
create policy service_areas_insert on public.professional_service_areas for insert to authenticated
  with check (professional_id = public.my_professional_id());
create policy service_areas_delete on public.professional_service_areas for delete to authenticated
  using (professional_id = public.my_professional_id());

create policy subscriptions_select on public.professional_subscriptions for select to authenticated
  using (professional_id = public.my_professional_id() or public.is_admin());

create policy services_select on public.services for select to anon, authenticated
  using ((status = 'active' and public.is_published_professional(professional_id))
         or professional_id = public.my_professional_id() or public.is_admin());
create policy services_insert on public.services for insert to authenticated
  with check (professional_id = public.my_professional_id());
create policy services_update on public.services for update to authenticated
  using (professional_id = public.my_professional_id()) with check (professional_id = public.my_professional_id());
create policy services_delete on public.services for delete to authenticated
  using (professional_id = public.my_professional_id());

create policy portfolio_select on public.portfolio_items for select to anon, authenticated
  using (public.is_published_professional(professional_id) or professional_id = public.my_professional_id() or public.is_admin());
create policy portfolio_insert on public.portfolio_items for insert to authenticated
  with check (professional_id = public.my_professional_id());
create policy portfolio_update on public.portfolio_items for update to authenticated
  using (professional_id = public.my_professional_id()) with check (professional_id = public.my_professional_id());
create policy portfolio_delete on public.portfolio_items for delete to authenticated
  using (professional_id = public.my_professional_id());

create policy availability_rules_select on public.availability_rules for select to anon, authenticated
  using (public.is_published_professional(professional_id) or professional_id = public.my_professional_id());
create policy availability_rules_insert on public.availability_rules for insert to authenticated
  with check (professional_id = public.my_professional_id());
create policy availability_rules_delete on public.availability_rules for delete to authenticated
  using (professional_id = public.my_professional_id());

create policy availability_exceptions_select on public.availability_exceptions for select to authenticated
  using (professional_id = public.my_professional_id());
create policy availability_exceptions_insert on public.availability_exceptions for insert to authenticated
  with check (professional_id = public.my_professional_id());
create policy availability_exceptions_delete on public.availability_exceptions for delete to authenticated
  using (professional_id = public.my_professional_id());

create policy favorites_select on public.favorites for select to authenticated using (user_id = auth.uid());
create policy favorites_insert on public.favorites for insert to authenticated with check (user_id = auth.uid());
create policy favorites_delete on public.favorites for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants (explicit allow-list; RLS still applies to every row)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, avatar_path) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.platform_settings to anon, authenticated;
grant select on public.service_categories to anon, authenticated;
grant insert (slug, name, description, icon, sort_order, is_active) on public.service_categories to authenticated;
grant update (name, description, icon, sort_order, is_active) on public.service_categories to authenticated;
grant select on public.subscription_plans to anon, authenticated;
grant update (name, description, price_cents, max_active_services, features, is_active, sort_order) on public.subscription_plans to authenticated;

grant select on public.professional_profiles to anon, authenticated;
grant update (slug, display_name, business_name, headline, bio, years_experience, city, province, languages,
  certifications, licenses, avatar_path, cover_path, public_phone, public_email, working_hours_note, faqs,
  timezone, slot_minutes, min_notice_hours, booking_window_days)
  on public.professional_profiles to authenticated;

grant select on public.professional_categories to anon, authenticated;
grant insert, delete on public.professional_categories to authenticated;
grant select on public.professional_service_areas to anon, authenticated;
grant insert (professional_id, city, area), delete on public.professional_service_areas to authenticated;
grant select on public.professional_subscriptions to authenticated;

grant select on public.services to anon, authenticated;
grant insert (professional_id, category_id, name, slug, description, pricing_model, price_cents, duration_minutes,
  service_area_note, materials_included, materials_excluded, preparation_notes, requires_inspection,
  instant_booking, images, status) on public.services to authenticated;
grant update (category_id, name, slug, description, pricing_model, price_cents, duration_minutes,
  service_area_note, materials_included, materials_excluded, preparation_notes, requires_inspection,
  instant_booking, images, status) on public.services to authenticated;
grant delete on public.services to authenticated;

grant select on public.portfolio_items to anon, authenticated;
grant insert (professional_id, title, description, images, completed_on, sort_order) on public.portfolio_items to authenticated;
grant update (title, description, images, completed_on, sort_order) on public.portfolio_items to authenticated;
grant delete on public.portfolio_items to authenticated;

grant select on public.availability_rules to anon, authenticated;
grant insert (professional_id, weekday, start_time, end_time), delete on public.availability_rules to authenticated;
grant select on public.availability_exceptions to authenticated;
grant insert (professional_id, on_date, start_time, end_time, reason), delete on public.availability_exceptions to authenticated;

grant select, delete on public.favorites to authenticated;
grant insert (user_id, professional_id) on public.favorites to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.my_professional_id() to anon, authenticated;
grant execute on function public.is_published_professional(uuid) to anon, authenticated;
grant execute on function public.today_manila() to anon, authenticated;
grant execute on function public.become_professional(text, text, text) to authenticated;
grant execute on function public.effective_plan(uuid) to authenticated;
grant execute on function public.set_profile_published(boolean) to authenticated;
