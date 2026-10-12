-- Performance-only changes recommended by the Supabase advisors. Access rules are unchanged:
--   * Wrap auth.uid(), is_admin() and my_professional_id() in scalar subqueries so Postgres evaluates them
--     once per statement instead of once per row.
--   * Merge the two permissive SELECT policies on profiles into one.
--   * Index foreign keys used by joins and RLS lookups.

-- profiles
drop policy profiles_select_self on public.profiles;
drop policy profiles_select_related on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()) or public.can_view_profile(id));
alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter policy user_roles_select_self on public.user_roles
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- professional profile and its owned records
alter policy pro_select on public.professional_profiles
  using (status = 'published' or user_id = (select auth.uid()) or (select public.is_admin()));
alter policy pro_update_own on public.professional_profiles
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy pro_categories_select on public.professional_categories
  using (public.is_published_professional(professional_id) or professional_id = (select public.my_professional_id()) or (select public.is_admin()));
alter policy pro_categories_insert on public.professional_categories with check (professional_id = (select public.my_professional_id()));
alter policy pro_categories_delete on public.professional_categories using (professional_id = (select public.my_professional_id()));

alter policy service_areas_select on public.professional_service_areas
  using (public.is_published_professional(professional_id) or professional_id = (select public.my_professional_id()) or (select public.is_admin()));
alter policy service_areas_insert on public.professional_service_areas with check (professional_id = (select public.my_professional_id()));
alter policy service_areas_delete on public.professional_service_areas using (professional_id = (select public.my_professional_id()));

alter policy subscriptions_select on public.professional_subscriptions
  using (professional_id = (select public.my_professional_id()) or (select public.is_admin()));

alter policy services_select on public.services
  using ((status = 'active' and public.is_published_professional(professional_id))
         or professional_id = (select public.my_professional_id()) or (select public.is_admin()));
alter policy services_insert on public.services with check (professional_id = (select public.my_professional_id()));
alter policy services_update on public.services
  using (professional_id = (select public.my_professional_id())) with check (professional_id = (select public.my_professional_id()));
alter policy services_delete on public.services using (professional_id = (select public.my_professional_id()));

alter policy portfolio_select on public.portfolio_items
  using (public.is_published_professional(professional_id) or professional_id = (select public.my_professional_id()) or (select public.is_admin()));
alter policy portfolio_insert on public.portfolio_items with check (professional_id = (select public.my_professional_id()));
alter policy portfolio_update on public.portfolio_items
  using (professional_id = (select public.my_professional_id())) with check (professional_id = (select public.my_professional_id()));
alter policy portfolio_delete on public.portfolio_items using (professional_id = (select public.my_professional_id()));

alter policy availability_rules_select on public.availability_rules
  using (public.is_published_professional(professional_id) or professional_id = (select public.my_professional_id()));
alter policy availability_rules_insert on public.availability_rules with check (professional_id = (select public.my_professional_id()));
alter policy availability_rules_delete on public.availability_rules using (professional_id = (select public.my_professional_id()));
alter policy availability_exceptions_select on public.availability_exceptions using (professional_id = (select public.my_professional_id()));
alter policy availability_exceptions_insert on public.availability_exceptions with check (professional_id = (select public.my_professional_id()));
alter policy availability_exceptions_delete on public.availability_exceptions using (professional_id = (select public.my_professional_id()));

alter policy favorites_select on public.favorites using (user_id = (select auth.uid()));
alter policy favorites_insert on public.favorites with check (user_id = (select auth.uid()));
alter policy favorites_delete on public.favorites using (user_id = (select auth.uid()));

-- requests, messaging, notifications
alter policy notifications_select on public.notifications using (user_id = (select auth.uid()));
alter policy notifications_update on public.notifications
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy requests_select on public.service_requests
  using (customer_id = (select auth.uid())
         or (professional_id is not null and professional_id = (select public.my_professional_id()) and status <> 'draft')
         or (select public.is_admin()));
alter policy requests_update_customer on public.service_requests
  using (customer_id = (select auth.uid()) and status in ('draft', 'submitted', 'awaiting_info'))
  with check (customer_id = (select auth.uid()) and status in ('draft', 'submitted', 'awaiting_info'));

alter policy request_attachments_insert on public.request_attachments
  with check (uploaded_by = (select auth.uid()) and public.is_request_party(request_id));

alter policy messages_insert on public.messages
  with check (sender_id = (select auth.uid()) and public.is_conversation_participant(conversation_id)
              and not exists (select 1 from public.profiles where id = (select auth.uid()) and is_suspended));

-- quotations, bookings, payments, trust
alter policy quotations_select on public.quotations
  using (professional_id = (select public.my_professional_id())
         or (customer_id = (select auth.uid()) and status <> 'draft')
         or (select public.is_admin()));
alter policy quotations_update_draft on public.quotations
  using (professional_id = (select public.my_professional_id()) and status = 'draft')
  with check (professional_id = (select public.my_professional_id()) and status = 'draft');
alter policy quotations_delete_draft on public.quotations
  using (professional_id = (select public.my_professional_id()) and status = 'draft');

alter policy bookings_select on public.bookings
  using (customer_id = (select auth.uid()) or professional_id = (select public.my_professional_id()) or (select public.is_admin()));

alter policy payment_records_select on public.payment_records
  using (customer_id = (select auth.uid()) or professional_id = (select public.my_professional_id()) or (select public.is_admin()));

alter policy reviews_select on public.reviews
  using ((status = 'published' and public.is_published_professional(professional_id))
         or customer_id = (select auth.uid()) or professional_id = (select public.my_professional_id()) or (select public.is_admin()));

alter policy reports_select on public.reports using (reporter_id = (select auth.uid()) or (select public.is_admin()));
alter policy reports_insert on public.reports
  with check (reporter_id = (select auth.uid()) and not exists (select 1 from public.profiles where id = (select auth.uid()) and is_suspended));

alter policy verification_select on public.verification_submissions
  using (professional_id = (select public.my_professional_id()) or (select public.is_admin()));

-- Foreign keys used in joins, lookups and cascades
create index if not exists bookings_service_idx on public.bookings (service_id);
create index if not exists bookings_request_idx on public.bookings (request_id);
create index if not exists conversations_professional_idx on public.conversations (professional_id);
create index if not exists conversations_customer_idx on public.conversations (customer_id);
create index if not exists favorites_professional_idx on public.favorites (professional_id);
create index if not exists payment_records_customer_idx on public.payment_records (customer_id);
create index if not exists payment_records_professional_idx on public.payment_records (professional_id);
create index if not exists refunds_payment_record_idx on public.refunds (payment_record_id);
create index if not exists reviews_customer_idx on public.reviews (customer_id);
create index if not exists service_requests_service_idx on public.service_requests (service_id);
create index if not exists service_requests_category_idx on public.service_requests (category_id);
create index if not exists quotations_previous_idx on public.quotations (previous_quote_id);
create index if not exists contract_signatures_signer_idx on public.contract_signatures (signer_id);
create index if not exists disputes_booking_idx on public.disputes (booking_id);
