import React, { useState, useEffect } from 'react';
import { ArrowLeft, Copy, Check, AlertCircle } from 'lucide-react';
import { TeamDetail as ITeamDetail, User } from '../types.js';
import { api } from '../api/client.js';

interface TeamDetailProps {
  team: ITeamDetail;
  currentUser: User | null;
  onBack: () => void;
  onRefresh: () => void;
  onLeaveTeam: () => void;
}

export function TeamDetail({
  team,
  currentUser,
  onBack,
  onRefresh,
  onLeaveTeam,
}: TeamDetailProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isRenewingCode, setIsRenewingCode] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const isLeader = currentUser?.id === team.leader_id;
  const isMember = team.members.some((m) => m.user_id === currentUser?.id);

  // Load audit logs and suggestions for this team
  useEffect(() => {
    let cancelled = false;

    // Load audit logs
    api.getAuditLogs({ teamId: team.id, limit: 10 })
      .then((res) => {
        if (!cancelled && Array.isArray(res)) setAuditLogs(res);
      })
      .catch(() => {});

    // Load teammate suggestions
    if (isLeader) {
      api.getSuggestions(team.id)
        .then((res) => {
          if (!cancelled && res.suggestions) setSuggestions(res.suggestions.slice(0, 3));
        })
        .catch(() => {});
    }

    return () => { cancelled = true; };
  }, [team.id, isLeader]);

  const activeInvite = (team.inviteCodes && team.inviteCodes.length > 0) ? team.inviteCodes[0] : null;

  const handleRenewInvite = async () => {
    setIsRenewingCode(true);
    setActionError(null);
    try {
      if (activeInvite) {
        await api.revokeInvite(team.id, activeInvite.id);
      }
      const res = await api.createInvite(team.id, 24);
      setCopiedCode(res.code);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsRenewingCode(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    setActionError(null);
    try {
      await api.acceptRequest(requestId);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    setActionError(null);
    try {
      await api.declineRequest(requestId);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleRemoveMember = async (targetUserId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from the team?`)) return;
    setActionError(null);
    try {
      await api.removeMember(team.id, targetUserId);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 3000);
  };

  const getInitials = (name?: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatLogTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '--:--';
    }
  };

  const formatAuditAction = (action: string, details: any) => {
    switch (action) {
      case 'team_created': return 'Team created';
      case 'member_joined': return 'New member joined';
      case 'member_left': return 'Member left the team';
      case 'member_removed': return 'Member removed from team';
      case 'leader_transferred': return 'Leadership transferred';
      case 'invite_created': return 'New invite code generated';
      case 'invite_revoked': return 'Invite code revoked';
      case 'request_accepted': return 'Join request accepted by leader';
      case 'request_declined': return 'Join request declined';
      default: return action.replace(/_/g, ' ');
    }
  };

  const isFull = team.members.length >= team.max_members;
  const isReady = team.members.length >= (team.max_members - 1) && !isFull;
  const statusLabel = isFull
    ? `Full · ${team.members.length} of ${team.max_members} seats`
    : isReady
    ? `Ready · ${team.members.length} of ${team.max_members} seats`
    : `Forming · ${team.members.length} of ${team.max_members} seats`;

  const statusBg = isFull ? 'bg-neutral-100' : isReady ? 'bg-lime/35' : 'bg-[#FDEBC8]';
  const statusFg = isFull || isReady ? 'text-charcoal' : 'text-[#7A3E00]';

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-8 flex flex-col gap-6">
      {/* Back button */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-teal-dark hover:text-teal-hover transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to looking for teammates</span>
        </button>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-danger text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Main 2-Column Split */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Column (flex: 1) */}
        <div className="flex-1 min-w-0 w-full flex flex-col gap-5">
          {/* Card 1: Team Header */}
          <div className="bg-white border border-cardBorder rounded-[14px] p-6 flex flex-col gap-3 shadow-sm">
            <div className="flex justify-between items-center gap-4 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-charcoal truncate">
                {team.name}
              </h1>
              <span
                className={`text-[13px] font-semibold px-3 py-1.5 rounded-[12px] ${statusBg} ${statusFg}`}
              >
                {statusLabel}
              </span>
            </div>

            <p className="text-[15px] text-muted leading-relaxed">
              {team.description || 'Accessibility checker for hackathon submissions. Looking for teammates with complementary skills.'}
            </p>

            {/* Skills & Wanted Tags */}
            <div className="flex gap-2 flex-wrap pt-1">
              {team.needed_skills && team.needed_skills.map((sk) => (
                <span
                  key={sk}
                  className="text-[13px] px-2.5 py-1 rounded-lg bg-lime/30 text-charcoal font-medium"
                >
                  Wanted: {sk}
                </span>
              ))}
            </div>
          </div>

          {/* Card 2: Members List */}
          <div className="bg-white border border-cardBorder rounded-[14px] p-6 flex flex-col gap-2 shadow-sm">
            <h2 className="text-[18px] font-bold text-charcoal mb-2">Members</h2>

            <div className="divide-y divide-borderLight">
              {team.members.map((m) => {
                const isThisMemberLeader = m.role === 'leader';
                const isCurrentUser = m.user_id === currentUser?.id;
                const canManageThisMember = isLeader && !isCurrentUser;

                return (
                  <div
                    key={m.user_id}
                    className="flex items-center gap-3.5 py-3 first:pt-1 last:pb-1"
                  >
                    <div className="w-10 h-10 rounded-full bg-teal-light text-teal-dark flex items-center justify-center font-bold text-[14px] shrink-0">
                      {getInitials(m.name)}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="font-semibold text-[15px] text-charcoal flex items-center gap-2 truncate">
                        <span>{m.name} {isCurrentUser && '(you)'}</span>
                        <span
                          className={`text-[11px] font-mono px-2 py-0.5 rounded uppercase font-semibold ${
                            isThisMemberLeader
                              ? 'bg-teal-light text-teal-dark'
                              : 'bg-borderLight text-muted'
                          }`}
                        >
                          {m.role}
                        </span>
                      </div>
                      <div className="text-[13px] text-muted truncate">
                        {m.skills && m.skills.length > 0 ? m.skills.join(', ') : 'Developer'} · {m.timezone_offset_minutes !== undefined ? `UTC${m.timezone_offset_minutes >= 0 ? '+' : ''}${(m.timezone_offset_minutes / 60).toFixed(1)}` : 'UTC+0'}
                      </div>
                    </div>

                    {canManageThisMember && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRemoveMember(m.user_id, m.name)}
                          className="h-9 px-3 border border-danger/40 rounded-lg bg-white font-medium text-[13px] text-danger hover:bg-red-50 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 3: Activity Log */}
          <div className="bg-white border border-cardBorder rounded-[14px] p-6 flex flex-col gap-3 shadow-sm">
            <h2 className="text-[18px] font-bold text-charcoal">Activity log</h2>

            {auditLogs.length === 0 ? (
              <div className="text-sm text-muted py-4 text-center">
                No activity recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-borderLight">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex gap-4 text-[14px] py-2.5 items-start">
                    <span className="font-mono text-[13px] text-muted w-[70px] shrink-0 pt-0.5">
                      {formatLogTime(log.created_at)}
                    </span>
                    <span className="flex-1 text-charcoal">
                      {formatAuditAction(log.action, log.details)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (width: 400px) */}
        <div className="w-full lg:w-[400px] flex flex-col gap-5 shrink-0">
          {/* Card 1: Invite Code (Pine background) */}
          <div className="bg-pine text-[#F3F1EA] rounded-[14px] p-6 flex flex-col gap-3 shadow-md">
            <div className="text-[12px] font-semibold tracking-wider text-[#C9D8D5] uppercase font-mono">
              INVITE CODE (EXPIRES IN 24 HOURS)
            </div>

            <div className="font-mono font-bold text-2xl tracking-wider select-all text-white py-1">
              {activeInvite ? activeInvite.code_hash?.slice(0, 14).toUpperCase() || 'K7QM-2XWD-9PFH' : 'NO CODE ACTIVE'}
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => copyToClipboard(activeInvite?.code_hash?.slice(0, 14).toUpperCase() || '')}
                className="flex-1 h-10 border-0 rounded-lg bg-mint hover:bg-mint-hover text-pine font-semibold text-[14px] transition-colors flex items-center justify-center gap-1.5"
              >
                {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'Copied!' : 'Copy code'}</span>
              </button>
              {isLeader && (
                <button
                  onClick={handleRenewInvite}
                  disabled={isRenewingCode}
                  className="flex-1 h-10 border border-neutral-600 rounded-lg bg-transparent text-neutral-100 hover:bg-white/10 font-semibold text-[14px] transition-colors disabled:opacity-50"
                >
                  {isRenewingCode ? 'Renewing...' : 'Revoke & renew'}
                </button>
              )}
            </div>
          </div>

          {/* Card 2: Join Requests */}
          {isLeader && (
            <div className="bg-white border border-cardBorder rounded-[14px] p-6 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-[18px] font-bold text-charcoal">Join requests</h2>
                <span className="text-[12px] font-semibold bg-[#FDEBC8] text-[#7A3E00] rounded-full px-2 py-0.5 font-mono">
                  {team.pendingRequests ? team.pendingRequests.filter((r) => r.status === 'pending').length : 0}
                </span>
              </div>

              {(!team.pendingRequests || team.pendingRequests.filter((r) => r.status === 'pending').length === 0) ? (
                <div className="text-sm text-muted py-3 text-center">
                  No pending requests.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {team.pendingRequests.filter((r) => r.status === 'pending').map((r) => (
                    <div
                      key={r.id}
                      className="border border-cardBorder rounded-[10px] p-3.5 flex flex-col gap-2.5"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-[15px] text-charcoal">{r.user_name || 'Participant'}</span>
                        <span className="text-[13px] text-muted">
                          {r.user_skills && r.user_skills.length > 0 ? r.user_skills.join(', ') : 'Software Engineer'} · asked recently
                        </span>
                      </div>

                      <div className="flex gap-2.5 pt-1">
                        <button
                          onClick={() => handleAcceptRequest(r.id)}
                          className="flex-1 h-9 rounded-lg bg-teal hover:bg-teal-hover text-white font-semibold text-[14px] transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleDeclineRequest(r.id)}
                          className="flex-1 h-9 border border-borderMuted rounded-lg bg-white text-charcoal hover:bg-canvas font-semibold text-[14px] transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Card 3: Suggested Teammates */}
          {isLeader && suggestions.length > 0 && (
            <div className="bg-white border border-cardBorder rounded-[14px] p-6 flex flex-col gap-3 shadow-sm">
              <h2 className="text-[18px] font-bold text-charcoal">Suggested teammates</h2>

              <div className="flex flex-col gap-3">
                {suggestions.map((s) => (
                  <div
                    key={s.userId}
                    className="border border-cardBorder rounded-[10px] p-3.5 flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-[15px] text-charcoal">{s.name}</span>
                      <span className="font-mono font-bold text-[14px] text-teal-dark">
                        {s.score}
                      </span>
                    </div>

                    <p className="text-[13px] text-[#33373E] leading-relaxed">
                      {s.breakdown?.skills?.reason || 'Good timezone and skill overlap.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leave Team Button */}
          {isMember && (
            <button
              onClick={onLeaveTeam}
              className="h-11 border border-danger rounded-[10px] bg-white text-danger font-semibold text-[15px] hover:bg-red-50 transition-colors shadow-sm"
            >
              Leave team
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
