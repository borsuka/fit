-- ============================================================================
-- 0010  Storage buckets
-- ============================================================================

-- PRIVATE. Food photos are personal data and, combined with body metrics, are
-- health-adjacent. Access is by short-lived signed URL only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'food-photos',
  'food-photos',
  false,
  5242880,                                   -- 5 MB ceiling; the client resizes to <300KB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Object ownership is the first path segment: food-photos/{user_id}/{scan}.jpg
-- ---------------------------------------------------------------------------

create policy food_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy food_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy food_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy food_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy recipe_images_select on storage.objects for select to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy recipe_images_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy recipe_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
