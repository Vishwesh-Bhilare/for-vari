# Pandharpur Vari Companion

Offline-first React/Vite PWA for the Pandharpur Vari. It demonstrates a Supabase-backed route crowd map, peer item lending, lost-and-found check-ins, and priority SOS alerts.

## Stack

- React + Vite + Tailwind
- PWA via `vite-plugin-pwa` with custom service worker tile caching
- Leaflet map with offline OpenStreetMap tile cache-on-first-load
- IndexedDB via `idb` as local source of truth and write outbox
- Supabase Postgres/Auth/Realtime-ready schema

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable live data. Without them, the demo still works offline using IndexedDB and seeded route nodes.

## Supabase setup

1. In the Supabase dashboard, open Authentication → Providers and enable **Anonymous Sign-ins**. The app signs pilgrims in anonymously on load so every crowd report, item request, sighting, and SOS alert has an RLS-aware `auth.uid()` without forcing signup.
2. Run `supabase/schema.sql` in the SQL editor, then run `supabase/seed.sql` so the six route node UUIDs and default group code exist in Postgres before writes start.
3. To bootstrap the first admin, sign up or upgrade one account through the app, copy that user's `auth.users.id`, then run this one-time SQL statement:

```sql
update profiles set role = 'admin', approved = true where id = '<that users auth.users id>';
```

The schema stores individual identity in `profiles`, auto-creates a profile for every anonymous or permanent auth user, and points crowd reports, item requests, sightings, and SOS alerts at `profiles(id)`. Row Level Security now keeps public map/feed reads open, requires `auth.uid()` for pilgrim writes, and gates volunteer/admin actions by `profiles.role` and `profiles.approved`. There is intentionally no self-serve first-admin path.

## Feature order implemented

1. Crowd density route map with live Realtime subscription and offline queue.
2. Peer-to-peer item request feed with GPS attachment.
3. Lost-and-found group code check-in timeline.
4. Fixed SOS button with priority outbox replay.
5. Auth-gated volunteer dashboard with SOS resolution, sighting verification, and node filtering.
6. Admin approval panel for pending volunteer applications.
7. Service worker caches map tiles on first load for offline route rendering.


## Map tile attribution and production tiles

The app displays OpenStreetMap attribution in Leaflet. For production, avoid heavy direct use of `tile.openstreetmap.org`; use a tile provider such as MapTiler or Stadia, or host tiles yourself.
