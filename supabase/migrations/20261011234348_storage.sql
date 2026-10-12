-- Hire Me! — storage buckets and object policies.
-- public-media      public  : profile photos, covers, portfolio and service images. Path: {user_id}/...
-- request-files     private : job photos/videos attached to a request. Path: {request_id}/...
-- message-files     private : chat attachments. Path: {conversation_id}/...
-- verification-docs private : identity/licence documents. Path: {user_id}/... (owner + admins only)
-- Signed contracts are not stored as files: the immutable version lives in contract_versions and is rendered on demand.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public-media', 'public-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('request-files', 'request-files', false, 15728640,
   array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf']),
  ('message-files', 'message-files', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('verification-docs', 'verification-docs', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

create policy public_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy public_media_update on storage.objects for update to authenticated
  using (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy public_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy public_media_select_own on storage.objects for select to authenticated
  using (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy request_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'request-files'
              and public.is_request_party(public.try_uuid((storage.foldername(name))[1])));
create policy request_files_select on storage.objects for select to authenticated
  using (bucket_id = 'request-files'
         and public.is_request_party(public.try_uuid((storage.foldername(name))[1])));

create policy message_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'message-files'
              and public.is_conversation_participant(public.try_uuid((storage.foldername(name))[1])));
create policy message_files_select on storage.objects for select to authenticated
  using (bucket_id = 'message-files'
         and public.is_conversation_participant(public.try_uuid((storage.foldername(name))[1])));

create policy verification_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy verification_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'verification-docs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

grant execute on function public.try_uuid(text) to authenticated;
