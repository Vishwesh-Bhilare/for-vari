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

Run `supabase/schema.sql` in SQL editor, then immediately run `supabase/seed.sql` so the six route node UUIDs and demo member referenced by local offline cache exist in Postgres before writes start. Row Level Security is enabled on all tables with permissive hackathon policies (`using (true)`). Production should restrict writes to authenticated group members and protect personal contact fields; crowd map and item board reads can remain public where appropriate.

## Feature order implemented

1. Crowd density route map with live Realtime subscription and offline queue.
2. Peer-to-peer item request feed with GPS attachment.
3. Lost-and-found group code check-in timeline.
4. Fixed SOS button with priority outbox replay.
5. Volunteer dashboard panel for active alerts, sightings, and requests.
6. Service worker caches map tiles on first load for offline route rendering.


## Map tile attribution and production tiles

The app displays OpenStreetMap attribution in Leaflet. For production, avoid heavy direct use of `tile.openstreetmap.org`; use a tile provider such as MapTiler or Stadia, or host tiles yourself.
