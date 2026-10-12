-- 1) Booking parties may see each other's name/avatar even without a conversation (instant bookings).
create or replace function public.can_view_profile(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_user_id = auth.uid()
      or exists (select 1 from public.conversation_participants a
                   join public.conversation_participants b on b.conversation_id = a.conversation_id
                  where a.user_id = auth.uid() and b.user_id = p_user_id)
      or exists (select 1 from public.bookings bk
                  where (bk.customer_id = p_user_id and bk.professional_id = public.my_professional_id())
                     or (bk.customer_id = auth.uid() and public.professional_user_id(bk.professional_id) = p_user_id))
      or exists (select 1 from public.professional_profiles where user_id = p_user_id and status = 'published')
$$;

-- 2) A dispute resolved as "cancelled" queues any paid amount for refund review (it never moves money by itself).
create or replace function public.admin_resolve_dispute(p_dispute_id uuid, p_outcome text, p_resolution text, p_booking_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.require_admin();
  v_d public.disputes;
  v_b public.bookings;
  v_refundable bigint;
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
    if p_booking_status = 'cancelled' and v_b.id is not null then
      v_refundable := v_b.amount_paid_cents - coalesce((select sum(amount_cents) from public.refunds
                        where booking_id = v_b.id and status not in ('rejected', 'failed')), 0);
      if v_refundable > 0 then
        insert into public.refunds (payment_record_id, booking_id, amount_cents, status, reason, requested_by)
        select pr.id, v_b.id, least(v_refundable, pr.amount_cents), 'pending_review',
               'Dispute resolved with cancellation: ' || coalesce(left(p_resolution, 200), ''), v_admin
          from public.payment_records pr
         where pr.booking_id = v_b.id and pr.status = 'paid'
         order by pr.paid_at desc limit 1;
      end if;
    end if;
    perform public.notify(x.uid, 'dispute_' || p_outcome, 'Dispute ' || p_outcome,
      coalesce(left(p_resolution, 140), ''), '/bookings/' || v_d.booking_id::text)
      from (select v_b.customer_id as uid union select public.professional_user_id(v_b.professional_id)) x
     where x.uid is not null;
  end if;
  perform public.log_event('dispute', v_d.id, 'admin_' || p_outcome, v_d.status, p_outcome,
    jsonb_build_object('resolution', p_resolution, 'booking_status', p_booking_status));
end $$;
