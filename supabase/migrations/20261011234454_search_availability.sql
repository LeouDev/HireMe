-- Hire Me! — marketplace search and appointment slots.
-- City/service-area text matching for now; a geography column + PostGIS can replace it later
-- without changing the function signature.

create or replace function public.escape_like(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

create or replace function public.search_professionals(
  p_query text default null,
  p_category text default null,       -- category slug
  p_city text default null,
  p_date date default null,           -- only professionals who work that weekday and have not blocked the day
  p_min_rating numeric default null,
  p_max_price_cents bigint default null,
  p_verified_only boolean default false,
  p_sort text default 'relevance',    -- relevance | rating | price | recent
  p_limit int default 12,
  p_offset int default 0)
returns table (
  id uuid, slug text, display_name text, business_name text, headline text, city text,
  avatar_path text, cover_path text, verification_status text, verified_kinds text[],
  rating_avg numeric, review_count int, starting_price_cents bigint, categories text[],
  last_active_at timestamptz, total_count bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with q as (
    select nullif(btrim(p_query), '') as text,
           case when nullif(btrim(p_query), '') is null then null
                else websearch_to_tsquery('simple', btrim(p_query)) end as tsq,
           '%' || public.escape_like(btrim(p_query)) || '%' as pattern,
           '%' || public.escape_like(btrim(p_city)) || '%' as city_pattern
  ),
  base as (
    select pp.*,
           (select min(s.price_cents) from public.services s
             where s.professional_id = pp.id and s.status = 'active' and s.price_cents is not null) as min_price,
           (select array_agg(c.name order by c.sort_order) from public.professional_categories pc
              join public.service_categories c on c.id = pc.category_id
             where pc.professional_id = pp.id) as category_names
      from public.professional_profiles pp, q
     where pp.status = 'published'
       and (p_category is null or p_category = '' or exists (
             select 1 from public.professional_categories pc
               join public.service_categories c on c.id = pc.category_id
              where pc.professional_id = pp.id and c.slug = p_category))
       and (p_city is null or btrim(p_city) = '' or pp.city ilike q.city_pattern or exists (
             select 1 from public.professional_service_areas a
              where a.professional_id = pp.id and (a.city ilike q.city_pattern or a.area ilike q.city_pattern)))
       and (q.text is null or pp.search_vector @@ q.tsq
            or pp.display_name ilike q.pattern or pp.business_name ilike q.pattern
            or exists (select 1 from public.services s where s.professional_id = pp.id and s.status = 'active'
                        and (s.name ilike q.pattern or s.description ilike q.pattern))
            or exists (select 1 from public.professional_categories pc
                         join public.service_categories c on c.id = pc.category_id
                        where pc.professional_id = pp.id and c.name ilike q.pattern))
       and (p_min_rating is null or pp.rating_avg >= p_min_rating)
       and (not coalesce(p_verified_only, false) or pp.verification_status = 'verified')
       and (p_date is null or (
             exists (select 1 from public.availability_rules r
                      where r.professional_id = pp.id and r.weekday = extract(dow from p_date))
             and not exists (select 1 from public.availability_exceptions e
                              where e.professional_id = pp.id and e.on_date = p_date and e.start_time is null)))
  )
  select b.id, b.slug, b.display_name, b.business_name, b.headline, b.city, b.avatar_path, b.cover_path,
         b.verification_status, b.verified_kinds, b.rating_avg, b.review_count, b.min_price, b.category_names,
         b.last_active_at, count(*) over ()
    from base b, q
   where p_max_price_cents is null or b.min_price <= p_max_price_cents
   order by
     case when p_sort = 'rating' then b.rating_avg end desc nulls last,
     case when p_sort = 'rating' then b.review_count end desc,
     case when p_sort = 'price' then b.min_price end asc nulls last,
     case when p_sort = 'recent' then b.last_active_at end desc,
     case when coalesce(p_sort, 'relevance') = 'relevance' and q.tsq is not null
          then ts_rank(b.search_vector, q.tsq) end desc nulls last,
     b.rating_avg desc nulls last, b.review_count desc, b.published_at desc
   limit least(greatest(coalesce(p_limit, 12), 1), 48) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Bookable start times between two local dates, honouring working hours, breaks (gaps between rules),
-- blocked dates, existing bookings, minimum notice and the booking window.
create or replace function public.get_available_slots(
  p_professional_id uuid, p_from date, p_to date, p_duration_minutes int)
returns setof timestamptz
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_pro public.professional_profiles;
  v_day date;
  v_rule record;
  v_slot timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_earliest timestamptz;
  v_latest timestamptz;
begin
  select * into v_pro from public.professional_profiles where id = p_professional_id;
  if not found or (v_pro.status <> 'published' and v_pro.user_id is distinct from auth.uid()) then
    return;
  end if;
  if p_duration_minutes is null or p_duration_minutes < 15 or p_to < p_from or p_to - p_from > 31 then
    raise exception 'Invalid availability range.' using errcode = '22023';
  end if;
  v_earliest := now() + make_interval(hours => v_pro.min_notice_hours);
  v_latest := now() + make_interval(days => v_pro.booking_window_days);

  v_day := p_from;
  while v_day <= p_to loop
    if not exists (select 1 from public.availability_exceptions
                    where professional_id = v_pro.id and on_date = v_day and start_time is null) then
      for v_rule in
        select start_time, end_time from public.availability_rules
         where professional_id = v_pro.id and weekday = extract(dow from v_day) order by start_time
      loop
        v_slot := v_day + v_rule.start_time;
        while v_slot + make_interval(mins => p_duration_minutes) <= v_day + v_rule.end_time loop
          v_start := v_slot at time zone v_pro.timezone;
          v_end := v_start + make_interval(mins => p_duration_minutes);
          if v_start >= v_earliest and v_start <= v_latest
             and not exists (select 1 from public.availability_exceptions e
                              where e.professional_id = v_pro.id and e.on_date = v_day and e.start_time is not null
                                and tsrange(v_day + e.start_time, v_day + e.end_time) && tsrange(v_slot, v_slot + make_interval(mins => p_duration_minutes)))
             and not exists (select 1 from public.bookings b
                              where b.professional_id = v_pro.id
                                and b.status in ('awaiting_contract', 'awaiting_payment', 'confirmed', 'in_progress', 'cancellation_requested')
                                and tstzrange(b.scheduled_start, b.scheduled_end, '[)') && tstzrange(v_start, v_end, '[)')) then
            return next v_start;
          end if;
          v_slot := v_slot + make_interval(mins => v_pro.slot_minutes);
        end loop;
      end loop;
    end if;
    v_day := v_day + 1;
  end loop;
end $$;

-- Counters for the dashboard overview cards.
create or replace function public.dashboard_counts()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_pro uuid := public.my_professional_id();
begin
  if v_uid is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'customer', jsonb_build_object(
      'requests_open', (select count(*) from public.service_requests where customer_id = v_uid
                         and status in ('submitted', 'viewed', 'awaiting_info', 'accepted')),
      'requests_need_info', (select count(*) from public.service_requests where customer_id = v_uid and status = 'awaiting_info'),
      'quotes_new', (select count(*) from public.quotations where customer_id = v_uid and status in ('sent', 'viewed')),
      'contracts_to_sign', (select count(*) from public.contracts c where c.customer_id = v_uid
                             and c.status in ('pending_signatures', 'partially_signed')
                             and not exists (select 1 from public.contract_signatures s
                                              join public.contract_versions v on v.id = s.contract_version_id
                                             where v.contract_id = c.id and v.version = c.current_version
                                               and s.signer_role = 'customer')),
      'bookings_upcoming', (select count(*) from public.bookings where customer_id = v_uid
                             and status in ('awaiting_payment', 'confirmed', 'in_progress') and scheduled_end > now()),
      'payments_due', (select count(*) from public.bookings where customer_id = v_uid and status = 'awaiting_payment')),
    'professional', case when v_pro is null then null else jsonb_build_object(
      'requests_new', (select count(*) from public.service_requests where professional_id = v_pro and status = 'submitted'),
      'requests_pending', (select count(*) from public.service_requests where professional_id = v_pro
                            and status in ('viewed', 'awaiting_info', 'accepted')),
      'quotes_awaiting_customer', (select count(*) from public.quotations where professional_id = v_pro
                                    and status in ('sent', 'viewed')),
      'quotes_revision_requested', (select count(*) from public.quotations where professional_id = v_pro
                                     and status = 'revision_requested'),
      'contracts_to_sign', (select count(*) from public.contracts c where c.professional_id = v_pro
                             and c.status in ('pending_signatures', 'partially_signed')
                             and not exists (select 1 from public.contract_signatures s
                                              join public.contract_versions v on v.id = s.contract_version_id
                                             where v.contract_id = c.id and v.version = c.current_version
                                               and s.signer_role = 'professional')),
      'bookings_upcoming', (select count(*) from public.bookings where professional_id = v_pro
                             and status in ('confirmed', 'in_progress') and scheduled_end > now()),
      'jobs_completed', (select count(*) from public.bookings where professional_id = v_pro and status = 'completed'))
    end,
    'unread_notifications', (select count(*) from public.notifications where user_id = v_uid and read_at is null));
end $$;

create or replace function public.mark_all_notifications_read()
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

grant execute on function public.search_professionals(text, text, text, date, numeric, bigint, boolean, text, int, int) to anon, authenticated;
grant execute on function public.get_available_slots(uuid, date, date, int) to anon, authenticated;
grant execute on function public.dashboard_counts() to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
