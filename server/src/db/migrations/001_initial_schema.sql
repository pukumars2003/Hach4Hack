-- Initial Schema Migration for Race-Proof Team Formation Platform

-- 1. Custom Types & Enums
DO $$ BEGIN
  CREATE TYPE request_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'team_created', 'member_joined', 'member_left', 'member_removed',
    'leader_transferred', 'request_created', 'request_accepted', 
    'request_declined', 'request_cancelled', 'invite_created', 'invite_revoked', 'team_deleted',
    'team_updated'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'team_updated';

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(32),
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  interests TEXT[] NOT NULL DEFAULT '{}',
  timezone_offset_minutes INT NOT NULL DEFAULT 0, -- Range: -720 to +720 (-12h to +12h)
  discovery_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(32);
UPDATE users
SET username = split_part(email, '@', 1)
WHERE username IS NULL
  AND email ~ '^user[0-9]{5}@demo[.]test$';

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username) WHERE username IS NOT NULL;

-- 3. Hackathons Table
CREATE TABLE IF NOT EXISTS hackathons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  min_team_size INT NOT NULL DEFAULT 2,
  max_team_size INT NOT NULL DEFAULT 4,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT check_team_limits CHECK (min_team_size >= 1 AND max_team_size >= min_team_size)
);

-- 4. Teams Table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  needed_skills TEXT[] NOT NULL DEFAULT '{}',
  leader_id UUID NOT NULL REFERENCES users(id),
  member_count INT NOT NULL DEFAULT 1,
  max_members INT NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT unique_team_name_per_hackathon UNIQUE (hackathon_id, name),
  CONSTRAINT check_member_bounds CHECK (member_count >= 0 AND member_count <= max_members)
);

-- 5. Team Members Table (Core Invariant: Exactly one team per user per hackathon)
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hackathon_id UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member', -- 'leader' or 'member'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT unique_user_per_hackathon UNIQUE (hackathon_id, user_id)
);

-- 6. Join Requests Table
CREATE TABLE IF NOT EXISTS join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status request_status NOT NULL DEFAULT 'pending',
  message VARCHAR(280) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_request 
  ON join_requests (team_id, user_id) 
  WHERE status = 'pending';

-- 7. Invite Codes Table (Crockford Base32 with SHA-256 Storage)
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_invite_lookup 
  ON invite_codes (code_hash) 
  WHERE revoked_at IS NULL;

-- 8. Audit Log Table (Append-Only)
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  hackathon_id UUID NOT NULL,
  team_id UUID, -- NULL allowed so logs survive team deletion
  actor_id UUID NOT NULL REFERENCES users(id),
  action audit_action NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Tamper-Proof Trigger on Audit Logs
CREATE OR REPLACE FUNCTION trg_audit_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_audit ON audit_logs;
CREATE TRIGGER trg_protect_audit
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION trg_audit_immutable();

-- 9. Idempotency Records Table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key VARCHAR(128) NOT NULL,
  endpoint VARCHAR(100) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  status_code INT,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, key, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_ttl ON idempotency_keys (created_at);

-- 10. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_teams_board_cursor ON teams (hackathon_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_teams_global_cursor ON teams (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_team_members_lookup ON team_members (team_id, joined_at ASC);
CREATE INDEX IF NOT EXISTS idx_users_discovery ON users (discovery_enabled, timezone_offset_minutes) WHERE discovery_enabled = true;

