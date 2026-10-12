-- Hire Me! — service requests, conversations, messages, notifications, audit history.

-- ---------------------------------------------------------------------------
-- Notifications and audit history (written only by trusted functions)
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (char_length(type) <= 60),
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 1000),
  link text check (char_length(link) <= 300),
  dedupe_key text unique, -- makes webhook retries and repeated triggers idempotent
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create or replace function public.notify(
  p_user_id uuid, p_type text, p_title text, p_body text, p_link text, p_dedupe_key text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, link, dedupe_key)
  values (p_user_id, p_type, left(p_title, 200), left(p_body, 1000), p_link, p_dedupe_key)
  on conflict (dedupe_key) do nothing;
end $$;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  from_status text,
  to_status text,
  actor_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.log_event(
  p_entity_type text, p_entity_id uuid, p_action text,
  p_from text default null, p_to text default null, p_metadata jsonb default '{}')
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_logs (entity_type, entity_id, action, from_status, to_status, actor_id, metadata)
  values (p_entity_type, p_entity_id, p_action, p_from, p_to, auth.uid(), coalesce(p_metadata, '{}'))
$$;

create or replace function public.professional_user_id(p_professional_id uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select user_id from public.professional_profiles where id = p_professional_id
$$;

-- ---------------------------------------------------------------------------
-- Service requests
-- ---------------------------------------------------------------------------

create sequence public.request_number_seq;

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique
    default ('REQ-' || lpad(nextval('public.request_number_seq')::text, 6, '0')),
  customer_id uuid not null references public.profiles (id),
  professional_id uuid references public.professional_profiles (id), -- null reserved for future open requests
  service_id uuid references public.services (id) on delete set null,
  category_id uuid references public.service_categories (id),
  title text not null check (char_length(title) between 3 and 140),
  description text not null check (char_length(description) between 10 and 5000),
  location_city text not null check (char_length(location_city) between 2 and 80),
  location_address text check (char_length(location_address) <= 300),
  preferred_date date,
  preferred_time text check (preferred_time in ('morning', 'afternoon', 'evening', 'flexible')),
  alternative_dates date[] not null default '{}' check (cardinality(alternative_dates) <= 3),
  requirements text check (char_length(requirements) <= 2000),
  status text not null default 'submitted' check (status in (
    'draft', 'submitted', 'viewed', 'awaiting_info', 'accepted', 'declined', 'quoted', 'cancelled', 'expired')),
  status_note text check (char_length(status_note) <= 1000),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_requests_customer_idx on public.service_requests (customer_id, created_at desc);
create index service_requests_professional_idx on public.service_requests (professional_id, status, created_at desc);
create trigger service_requests_touch before update on public.service_requests
  for each row execute function public.touch_updated_at();

create or replace function public.is_request_party(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.service_requests r
     where r.id = p_request_id
       and (r.customer_id = auth.uid()
            or (r.professional_id is not null and r.professional_id = public.my_professional_id())))
$$;

create table public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  storage_path text not null unique check (char_length(storage_path) <= 400),
  file_name text not null check (char_length(file_name) <= 200),
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  created_at timestamptz not null default now(),
  check (storage_path like request_id::text || '/%')
);
create index request_attachments_request_idx on public.request_attachments (request_id);

-- ---------------------------------------------------------------------------
-- Conversations and messages
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id),
  professional_id uuid not null references public.professional_profiles (id),
  request_id uuid unique references public.service_requests (id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index conversations_general_unique
  on public.conversations (customer_id, professional_id) where request_id is null;

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.conversation_participants
                  where conversation_id = p_conversation_id and user_id = auth.uid())
$$;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id),
  body text not null default '' check (char_length(body) <= 4000),
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5),
  created_at timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or jsonb_array_length(attachments) > 0)
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_sender_recent_idx on public.messages (sender_id, created_at desc);

create or replace function public.messages_before_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limit int;
  v_recent int;
  v_att jsonb;
begin
  select coalesce((value #>> '{}')::int, 20) into v_limit from public.platform_settings
   where key = 'message_rate_limit_per_minute';
  select count(*) into v_recent from public.messages
   where sender_id = new.sender_id and created_at > now() - interval '1 minute';
  if v_recent >= coalesce(v_limit, 20) then
    raise exception 'You are sending messages too quickly. Wait a moment and try again.' using errcode = '54000';
  end if;
  for v_att in select * from jsonb_array_elements(new.attachments) loop
    if jsonb_typeof(v_att) <> 'object'
       or coalesce(v_att ->> 'path', '') not like new.conversation_id::text || '/%'
       or coalesce(v_att ->> 'path', '') like '%..%' then
      raise exception 'Invalid attachment.' using errcode = '22023';
    end if;
  end loop;
  return new;
end $$;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.messages_before_insert();

create or replace function public.messages_after_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_other record;
  v_sender text;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_participants set last_read_at = new.created_at
   where conversation_id = new.conversation_id and user_id = new.sender_id;
  select full_name into v_sender from public.profiles where id = new.sender_id;
  for v_other in
    select user_id from public.conversation_participants
     where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    -- One unread "new message" notification per conversation, not one per message.
    if not exists (select 1 from public.notifications
                    where user_id = v_other.user_id and type = 'message' and read_at is null
                      and link like '%' || new.conversation_id::text) then
      perform public.notify(v_other.user_id, 'message',
        'New message from ' || coalesce(nullif(v_sender, ''), 'a user'),
        left(nullif(new.body, ''), 140), '/messages/' || new.conversation_id::text);
    end if;
  end loop;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.messages_after_insert();

-- Opens (or returns) the general conversation between the caller and a professional.
create or replace function public.start_conversation(p_professional_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_pro_user uuid;
  v_id uuid;
begin
  select user_id into v_pro_user from public.professional_profiles
   where id = p_professional_id and status = 'published';
  if v_pro_user is null then
    raise exception 'This professional is not available.' using errcode = 'P0002';
  end if;
  if v_pro_user = v_uid then
    raise exception 'You cannot message yourself.' using errcode = '22023';
  end if;
  select id into v_id from public.conversations
   where customer_id = v_uid and professional_id = p_professional_id and request_id is null;
  if v_id is null then
    insert into public.conversations (customer_id, professional_id) values (v_uid, p_professional_id)
    on conflict do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.conversations
       where customer_id = v_uid and professional_id = p_professional_id and request_id is null;
    else
      insert into public.conversation_participants (conversation_id, user_id)
      values (v_id, v_uid), (v_id, v_pro_user);
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.conversation_participants set last_read_at = now()
   where conversation_id = p_conversation_id and user_id = auth.uid();
  update public.notifications set read_at = now()
   where user_id = auth.uid() and type = 'message' and read_at is null
     and link = '/messages/' || p_conversation_id::text;
end $$;

-- Conversation list with counterpart, last message and unread count for the caller.
create or replace function public.my_conversations()
returns table (
  id uuid, request_id uuid, request_title text, professional_id uuid,
  counterpart_name text, counterpart_avatar text, counterpart_is_professional boolean,
  last_message_at timestamptz, last_message text, unread_count bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.request_id, r.title,
         c.professional_id,
         case when c.customer_id = auth.uid() then pp.display_name else cu.full_name end,
         case when c.customer_id = auth.uid() then pp.avatar_path else cu.avatar_path end,
         c.customer_id = auth.uid(),
         c.last_message_at,
         (select case when m.body <> '' then left(m.body, 140) else 'Attachment' end
            from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
         (select count(*) from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at)
    from public.conversations c
    join public.conversation_participants me on me.conversation_id = c.id and me.user_id = auth.uid()
    join public.professional_profiles pp on pp.id = c.professional_id
    join public.profiles cu on cu.id = c.customer_id
    left join public.service_requests r on r.id = c.request_id
   order by coalesce(c.last_message_at, c.created_at) desc
$$;

-- ---------------------------------------------------------------------------
-- Request workflow
-- ---------------------------------------------------------------------------

create or replace function public.create_service_request(
  p_professional_id uuid,
  p_title text,
  p_description text,
  p_location_city text,
  p_location_address text default null,
  p_service_id uuid default null,
  p_preferred_date date default null,
  p_preferred_time text default null,
  p_alternative_dates date[] default '{}',
  p_requirements text default null,
  p_submit boolean default true)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_pro public.professional_profiles;
  v_category uuid;
  v_id uuid;
  v_conv uuid;
  v_status text := case when p_submit then 'submitted' else 'draft' end;
begin
  select * into v_pro from public.professional_profiles where id = p_professional_id and status = 'published';
  if not found then
    raise exception 'This professional is not accepting requests right now.' using errcode = 'P0002';
  end if;
  if v_pro.user_id = v_uid then
    raise exception 'You cannot send a request to yourself.' using errcode = '22023';
  end if;
  if p_service_id is not null then
    select category_id into v_category from public.services
     where id = p_service_id and professional_id = p_professional_id and status = 'active';
    if not found then
      raise exception 'That service is not available.' using errcode = 'P0002';
    end if;
  end if;
  if p_preferred_date is not null and p_preferred_date < public.today_manila() then
    raise exception 'The preferred date cannot be in the past.' using errcode = '22023';
  end if;
  if (select count(*) from public.service_requests
       where customer_id = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You have sent many requests recently. Try again later.' using errcode = '54000';
  end if;

  insert into public.service_requests (
    customer_id, professional_id, service_id, category_id, title, description, location_city,
    location_address, preferred_date, preferred_time, alternative_dates, requirements, status, submitted_at)
  values (
    v_uid, p_professional_id, p_service_id, v_category, trim(p_title), trim(p_description), trim(p_location_city),
    nullif(trim(p_location_address), ''), p_preferred_date, p_preferred_time, coalesce(p_alternative_dates, '{}'),
    nullif(trim(p_requirements), ''), v_status, case when p_submit then now() end)
  returning id into v_id;

  insert into public.conversations (customer_id, professional_id, request_id)
  values (v_uid, p_professional_id, v_id) returning id into v_conv;
  insert into public.conversation_participants (conversation_id, user_id) values (v_conv, v_uid), (v_conv, v_pro.user_id);

  perform public.log_event('service_request', v_id, 'created', null, v_status);
  if p_submit then
    perform public.notify(v_pro.user_id, 'request_new', 'New service request',
      trim(p_title), '/pro-dashboard/requests/' || v_id::text, 'request_new:' || v_id::text);
  end if;
  return v_id;
end $$;

-- Controlled status transitions. Who may move a request where is defined here and nowhere else.
create or replace function public.transition_service_request(p_request_id uuid, p_to text, p_note text default null)
returns public.service_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_active_user();
  v_req public.service_requests;
  v_is_customer boolean;
  v_is_pro boolean;
  v_allowed boolean := false;
  v_pro_user uuid;
  v_from text;
begin
  select * into v_req from public.service_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  v_is_customer := v_req.customer_id = v_uid;
  v_is_pro := coalesce(v_req.professional_id = public.my_professional_id(), false);
  if not (v_is_customer or v_is_pro) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;

  if v_is_customer then
    v_allowed := (v_req.status = 'draft' and p_to = 'submitted')
              or (v_req.status = 'awaiting_info' and p_to = 'submitted')
              or (v_req.status in ('draft', 'submitted', 'viewed', 'awaiting_info', 'accepted', 'quoted') and p_to = 'cancelled');
  end if;
  if not v_allowed and v_is_pro then
    v_allowed := (v_req.status = 'submitted' and p_to = 'viewed')
              or (v_req.status in ('submitted', 'viewed') and p_to = 'awaiting_info')
              or (v_req.status in ('submitted', 'viewed', 'awaiting_info') and p_to in ('accepted', 'declined'));
  end if;
  if not v_allowed then
    raise exception 'This request cannot move from % to %.', v_req.status, p_to using errcode = '22023';
  end if;
  v_from := v_req.status;
  if p_to = 'awaiting_info' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Tell the customer what information you need.' using errcode = '22023';
  end if;

  update public.service_requests
     set status = p_to,
         status_note = coalesce(nullif(btrim(p_note), ''), status_note),
         submitted_at = case when p_to = 'submitted' and submitted_at is null then now() else submitted_at end
   where id = p_request_id returning * into v_req;

  perform public.log_event('service_request', p_request_id, 'status_changed', v_from, p_to,
    jsonb_build_object('note', p_note));

  v_pro_user := public.professional_user_id(v_req.professional_id);
  if v_is_pro and p_to <> 'viewed' then
    perform public.notify(v_req.customer_id, 'request_' || p_to,
      case p_to when 'accepted' then 'Your request was accepted'
                when 'declined' then 'Your request was declined'
                else 'The professional needs more information' end,
      v_req.title, '/dashboard/requests/' || p_request_id::text);
  elsif v_is_customer then
    perform public.notify(v_pro_user, 'request_' || p_to,
      case p_to when 'cancelled' then 'A request was cancelled' else 'A request was submitted' end,
      v_req.title, '/pro-dashboard/requests/' || p_request_id::text);
  end if;
  return v_req;
end $$;

-- ---------------------------------------------------------------------------
-- Profile visibility between related users (names/avatars only live in profiles)
-- ---------------------------------------------------------------------------

create or replace function public.can_view_profile(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_user_id = auth.uid()
      or exists (select 1 from public.conversation_participants a
                   join public.conversation_participants b on b.conversation_id = a.conversation_id
                  where a.user_id = auth.uid() and b.user_id = p_user_id)
      or exists (select 1 from public.professional_profiles where user_id = p_user_id and status = 'published')
$$;

create policy profiles_select_related on public.profiles for select to authenticated
  using (public.can_view_profile(id));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.service_requests enable row level security;
alter table public.request_attachments enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy requests_select on public.service_requests for select to authenticated
  using (customer_id = auth.uid()
         or (professional_id is not null and professional_id = public.my_professional_id() and status <> 'draft')
         or public.is_admin());
-- Customers may edit request details only while the professional has not acted on it.
create policy requests_update_customer on public.service_requests for update to authenticated
  using (customer_id = auth.uid() and status in ('draft', 'submitted', 'awaiting_info'))
  with check (customer_id = auth.uid() and status in ('draft', 'submitted', 'awaiting_info'));

create policy request_attachments_select on public.request_attachments for select to authenticated
  using (public.is_request_party(request_id));
create policy request_attachments_insert on public.request_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.is_request_party(request_id));

create policy conversations_select on public.conversations for select to authenticated
  using (public.is_conversation_participant(id));
create policy participants_select on public.conversation_participants for select to authenticated
  using (public.is_conversation_participant(conversation_id));
create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_participant(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_participant(conversation_id)
              and not exists (select 1 from public.profiles where id = auth.uid() and is_suspended));

-- audit_logs select policy is created in the bookings migration (needs quotation/booking helpers).

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.service_requests to authenticated;
grant update (title, description, location_city, location_address, preferred_date, preferred_time,
  alternative_dates, requirements) on public.service_requests to authenticated;
grant select on public.request_attachments to authenticated;
grant insert (request_id, uploaded_by, storage_path, file_name, mime_type, size_bytes) on public.request_attachments to authenticated;
grant select on public.conversations to authenticated;
grant select on public.conversation_participants to authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body, attachments) on public.messages to authenticated;

grant execute on function public.is_request_party(uuid) to authenticated;
grant execute on function public.is_conversation_participant(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.create_service_request(uuid, text, text, text, text, uuid, date, text, date[], text, boolean) to authenticated;
grant execute on function public.transition_service_request(uuid, text, text) to authenticated;

-- Realtime for chat and notifications (RLS applies to realtime subscriptions).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.notifications;
  end if;
end $$;
