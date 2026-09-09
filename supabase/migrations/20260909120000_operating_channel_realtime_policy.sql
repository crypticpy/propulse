-- #698: Realtime Authorization for the workspace operating channel.
--
-- MANUAL APPLICATION REQUIRED — this file is not applied automatically.
-- The owner must run it against the project database (see
-- docs/AGENT-CONSTITUTION.md: agents never apply migrations or touch the
-- database). Until it is applied, `createAccountTransport`'s private channel
-- join is denied (no matching policy = Realtime Authorization fails closed),
-- and `useOperatingTransport` falls back to same-browser BroadcastChannel
-- only — cross-device sync stays visibly off, not silently broken.
--
-- The operating-state cursor (#658, #633) fans out to an operator's other
-- signed-in, `sync`-entitled devices over a private Supabase Realtime
-- broadcast channel named `operating:<uid>`
-- (src/lib/workspace/operatingChannel.ts, createAccountTransport). A private
-- channel is only reachable by clients whose JWT satisfies the RLS policies
-- below — the channel name itself is not a secret, and any other
-- authenticated user could otherwise guess `operating:<their-uid>` is not
-- the interesting part; the interesting part is that nobody else's uid
-- satisfies these policies.

-- RLS is already enabled on realtime.messages by Supabase; an ALTER TABLE
-- here would be redundant at best and fails on projects where the migration
-- role lacks ownership of that table (owner review, #698 fix round).

DROP POLICY IF EXISTS operating_channel_select_own ON realtime.messages;
CREATE POLICY operating_channel_select_own ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'
    AND realtime.topic() LIKE 'operating:%'
    AND split_part(realtime.topic(), ':', 2) = auth.uid()::text
  );

DROP POLICY IF EXISTS operating_channel_insert_own ON realtime.messages;
CREATE POLICY operating_channel_insert_own ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    extension = 'broadcast'
    AND realtime.topic() LIKE 'operating:%'
    AND split_part(realtime.topic(), ':', 2) = auth.uid()::text
  );
