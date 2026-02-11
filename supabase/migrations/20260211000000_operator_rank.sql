-- Add operator rank columns to profiles table
-- operator_rank: the computed rank tier (synced from client on every push)
-- rank_points:   total RP driving the tier (synced from client)
-- rank_override:  admin-settable override — when non-null, the client uses this
--                 tier instead of the computed one (useful for test/demo accounts)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS operator_rank  text NOT NULL DEFAULT 'novice',
  ADD COLUMN IF NOT EXISTS rank_points    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_override  text DEFAULT NULL;
