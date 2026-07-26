-- Demo seed data keeps offline IndexedDB defaults in sync with Supabase FK targets.
insert into groups (id, group_code)
values ('77777777-7777-4777-8777-777777777777', 'WARI-7F2K')
on conflict (group_code) do update set group_code = excluded.group_code;

insert into nodes (id, name, lat, lng, sequence_order)
values
  ('11111111-1111-4111-8111-111111111111', 'Dehu', 18.7187, 73.7661, 1),
  ('22222222-2222-4222-8222-222222222222', 'Pune Halt', 18.5204, 73.8567, 2),
  ('33333333-3333-4333-8333-333333333333', 'Saswad', 18.3435, 74.0315, 3),
  ('44444444-4444-4444-8444-444444444444', 'Lonand', 18.0402, 74.1883, 4),
  ('55555555-5555-4555-8555-555555555555', 'Mukkam - Wakhri', 17.7242, 75.3309, 5),
  ('66666666-6666-4666-8666-666666666666', 'Pandharpur', 17.6746, 75.3237, 6)
on conflict (id) do update set
  name = excluded.name,
  lat = excluded.lat,
  lng = excluded.lng,
  sequence_order = excluded.sequence_order;
