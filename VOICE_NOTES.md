# Mesh Chat Voice Notes

## Step 0 findings and assumptions

The mesh chat implementation is concentrated in `src/components/VarkariSosMesh.tsx`, with `MeshChatMessage` defined in `src/types.ts` and cached via the `mesh_messages` IndexedDB object store in `src/db.ts`. Existing text messages are created locally, inserted into React state, written to IndexedDB with `saveMeshMessage`, then passed through `broadcastMeshPacket`. That packet is sent to the local `BroadcastChannel`, direct WebRTC data channels, and Supabase Realtime when configured. Receivers suppress duplicate `packetId`s, increment hop metadata, update relay paths, save complete messages to IndexedDB, relay while under the hop limit, and upload to `mesh_chat_relays` if the receiver is online.

This codebase does not currently expose a browser-side BLE GATT write path for chat payloads; the runnable offline phone-to-phone transport is the existing WebRTC data-channel mesh, with BroadcastChannel and Supabase Realtime used for local/cross-device simulation. Voice notes therefore extend the existing packet envelope and dedup path rather than adding a separate BLE-only protocol.

## Encoding and limits

Voice notes use the native `MediaRecorder` API and prefer `audio/webm;codecs=opus`, falling back to another browser-supported audio MIME type. Audio blobs are encoded as base64 so they can be stored in IndexedDB, relayed in JSON packets, and uploaded to Supabase without a storage bucket.

The max duration is 30 seconds. That matches the requested emergency-note cap while keeping users from accidentally generating unbounded offline payloads.

## Chunking decision

Voice base64 is split into 12,000-character chunks. This is intentionally far below common WebRTC data-channel message limits and keeps BroadcastChannel/Supabase Realtime payloads moderate. Because the current repository does not implement a lower-level BLE characteristic writer for chat, this chunk size extends the existing app-level packet envelope without inventing a parallel transport. Each chunk has its own packet id plus the original message id, chunk index, total chunk count, hop count, and relay path metadata.

Incoming chunks are buffered by message id, de-duplicated by chunk index, and reassembled once all chunks arrive. Partial notes surface as receiving/stalled progress and can still complete if missing chunks arrive later through another relay path.
