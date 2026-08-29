-- Voice notes for first-class mesh chat messages.
alter table mesh_chat_relays
  add column if not exists message_type text not null default 'text',
  add column if not exists audio_base64 text,
  add column if not exists duration_seconds numeric,
  add column if not exists mime_type text;

alter table mesh_chat_relays
  alter column text drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mesh_chat_relays_message_type_check'
  ) then
    alter table mesh_chat_relays
      add constraint mesh_chat_relays_message_type_check
      check (message_type = any (array['text', 'voice']));
  end if;
end $$;
