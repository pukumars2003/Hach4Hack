import React, { useState } from 'react';
import {
  Users, Crown, Shield, UserMinus, Plus, Copy, Check,
  AlertTriangle, KeyRound, Clock, ArrowLeft, Trash2, CheckCircle2, XCircle
} from 'lucide-react';
import { TeamDetail as ITeamDetail, User } from '../types.js';
import { api } from '../api/client.js';
import { TeammateSuggestions } from './TeammateSuggestions.js';

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
  const [activeSubTab, setActiveSubTab] = useState<'members' | 'suggestions' | 'audit'>('members');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newCodeGenerated, setNewCodeGenerated] = useState<string | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isLeader = currentUser?.id === team.leader_id;
  const isMember = team.members.some((m) => m.user_id === currentUser?.id);

  const handleCreateInvite = async () => {
    setIsGeneratingInvite(true);
    setActionError(null);
    try {
      const res = await api.createInvite(team.id, 48);
      setNewCodeGenerated(res.code);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm('Are you sure you want to revoke this invite code?')) return;
    try {
      await api.revokeInvite(team.id, inviteId);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await api.acceptRequest(requestId);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      await api.declineRequest(requestId);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleRemoveMember = async (targetUserId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from the team?`)) return;
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
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Board</span>
      </button>

      {/* Team Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-white tracking-tight">{team.name}</h1>
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  team.status === 'full'
                    ? 'bg-slate-800 text-slate-400'
                    : team.status === 'ready'
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {team.status}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
              {team.description || 'No description provided.'}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Capacity</div>
              <div className="text-2xl font-black text-white font-mono mt-0.5">
                {team.member_count} / {team.max_members}
              </div>
            </div>

            {isMember && (
              <button
                onClick={onLeaveTeam}
                className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Leave Team</span>
              </button>
            )}
          </div>
        </div>

        {/* Needed Skills */}
        {team.needed_skills && team.needed_skills.length > 0 && (
          <div className="pt-4 flex items-center gap-2 flex-wrap text-xs">
            <span className="text-slate-400 font-medium">Needed Skills:</span>
            {team.needed_skills.map((s) => (
              <span
                key={s}
                className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs font-medium"
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {actionError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('members')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeSubTab === 'members'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Members ({team.members.length})
        </button>

        {isLeader && (
          <button
            onClick={() => setActiveSubTab('suggestions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeSubTab === 'suggestions'
                ? 'bg-slate-800 text-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Find Teammates (AI Rank)
          </button>
        )}

        {isMember && (
          <button
            onClick={() => setActiveSubTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeSubTab === 'audit'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Audit Trail
          </button>
        )}
      </div>

      {/* Tab 1: Members & Leader Management */}
      {activeSubTab === 'members' && (
        <div className="space-y-6">
          {/* Members List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Current Squad ({team.members.length} / {team.max_members})</span>
            </h3>

            <div className="divide-y divide-slate-800/80">
              {team.members.map((m) => {
                const isLeaderRow = m.user_id === team.leader_id;
                const canRemove = isLeader && !isLeaderRow;

                return (
                  <div key={m.user_id} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-xs">
                        {m.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-200">{m.name}</span>
                          {isLeaderRow && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold flex items-center gap-1">
                              <Crown className="w-3 h-3" /> Leader
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span>Joined {new Date(m.joined_at).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>UTC {m.timezone_offset_minutes >= 0 ? `+${m.timezone_offset_minutes / 60}h` : `${m.timezone_offset_minutes / 60}h`}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {m.skills && m.skills.length > 0 && (
                        <div className="hidden sm:flex items-center gap-1">
                          {m.skills.slice(0, 2).map((sk) => (
                            <span key={sk} className="px-2 py-0.5 rounded bg-slate-950 text-slate-400 text-[10px]">
                              {sk}
                            </span>
                          ))}
                        </div>
                      )}

                      {canRemove && (
                        <button
                          onClick={() => handleRemoveMember(m.user_id, m.name)}
                          title="Remove from team"
                          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leader Controls: Invite Codes */}
          {isLeader && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-emerald-400" />
                    <span>Invite Codes (Crockford Base32)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Share invite codes with prospective teammates. Codes expire in 48 hours.
                  </p>
                </div>

                <button
                  onClick={handleCreateInvite}
                  disabled={isGeneratingInvite}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Generate Code</span>
                </button>
              </div>

              {/* Newly Generated Code Banner */}
              {newCodeGenerated && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                      Newly Created Invite Code (Returned Once)
                    </div>
                    <div className="text-lg font-mono font-black text-white tracking-widest mt-0.5">
                      {newCodeGenerated}
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(newCodeGenerated)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-400 transition-colors"
                  >
                    {copiedCode === newCodeGenerated ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode === newCodeGenerated ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {/* Active Codes List */}
              {team.inviteCodes && team.inviteCodes.length > 0 ? (
                <div className="space-y-2">
                  {team.inviteCodes.map((code) => (
                    <div
                      key={code.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2 text-slate-300">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Expires {new Date(code.expires_at).toLocaleString()}</span>
                      </div>
                      <button
                        onClick={() => handleRevokeInvite(code.id)}
                        className="text-rose-400 hover:text-rose-300 font-medium"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic">No active invite codes. Click generate above.</div>
              )}
            </div>
          )}

          {/* Leader Controls: Pending Join Requests */}
          {isLeader && team.pendingRequests && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Pending Join Requests ({team.pendingRequests.length})</span>
              </h3>

              {team.pendingRequests.length === 0 ? (
                <div className="text-xs text-slate-500 italic">No pending requests at this moment.</div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {team.pendingRequests.map((req) => (
                    <div key={req.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-sm text-slate-200">{req.user_name}</div>
                        {req.message && (
                          <p className="text-xs text-slate-400 mt-1 italic">&ldquo;{req.message}&rdquo;</p>
                        )}
                        {req.user_skills && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {req.user_skills.map((sk: string) => (
                              <span key={sk} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400">
                                {sk}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleAcceptRequest(req.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Accept</span>
                        </button>
                        <button
                          onClick={() => handleDeclineRequest(req.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs flex items-center gap-1 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Teammate Suggestions (AI Explainability) */}
      {activeSubTab === 'suggestions' && isLeader && (
        <TeammateSuggestions teamId={team.id} />
      )}

      {/* Tab 3: Immutable Audit Log */}
      {activeSubTab === 'audit' && isMember && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Append-Only Audit Trail (Postgres Trigger Guarded)</span>
          </h3>

          <div className="divide-y divide-slate-800/80">
            {team.auditLogs && team.auditLogs.length > 0 ? (
              team.auditLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                  <div>
                    <span className="font-mono font-bold text-emerald-400">{log.action}</span>
                    <span className="text-slate-400 ml-2">by {log.actor_name}</span>
                    {log.details && (
                      <pre className="text-[11px] text-slate-500 font-mono mt-1 overflow-x-auto max-w-xl">
                        {JSON.stringify(log.details)}
                      </pre>
                    )}
                  </div>
                  <div className="text-slate-500 text-[10px] shrink-0 font-mono">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500 italic">No audit records found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
