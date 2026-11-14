export interface User {
  id: string;
  email: string;
  username?: string | null;
  name: string;
  avatar_url?: string;
  skills: string[];
  interests: string[];
  timezone_offset_minutes: number;
  discovery_enabled: boolean;
  role?: string; // optional admin/user role
}


export interface TeamMember {
  user_id: string;
  role: 'leader' | 'member';
  joined_at: string;
  name: string;
  email: string;
  avatar_url?: string;
  skills: string[];
  timezone_offset_minutes: number;
}

export interface Team {
  id: string;
  hackathon_id: string;
  name: string;
  description: string;
  needed_skills: string[];
  member_count: number;
  max_members: number;
  leader_id: string;
  leader_name?: string;
  leader_avatar?: string;
  min_team_size: number;
  status: 'forming' | 'ready' | 'full';
  created_at: string;
  updated_at: string;
}

export interface TeamDetail extends Team {
  members: TeamMember[];
  pendingRequests?: JoinRequest[];
  inviteCodes?: InviteCode[];
  auditLogs?: AuditLog[];
}

export interface JoinRequest {
  id: string;
  team_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
  user_skills?: string[];
  timezone_offset_minutes?: number;
}

export interface InviteCode {
  id: string;
  code?: string;
  code_hash?: string;
  created_at: string;
  expires_at: string;
  revoked_at?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  details: any;
  created_at: string;
  actor_name: string;
}

export interface Suggestion {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  skills: string[];
  interests: string[];
  timezoneOffsetMinutes: number;
  score: number;
  breakdown: {
    skills: { score: number; reason: string };
    timezone: { score: number; reason: string };
    interests: { score: number; reason: string };
  };
}

