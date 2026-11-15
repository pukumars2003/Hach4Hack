import React, { useState, useEffect, useCallback } from 'react';
import {
  LogOut,
  Users,
  Shield,
  Activity,
  Search,
  RefreshCw,
  ArrowLeft,
  FlaskConical,
  ScrollText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../api/client.js';
import { AdminUser, AdminStats } from '../types.js';
import { ConcurrencyLab } from './ConcurrencyLab.js';

const PAGE_SIZE = 200;

export function AdminDashboard({ onExit, onLogout }: { onExit: () => void; onLogout: () => void }) {
  const [tab, setTab] = useState<'users' | 'lab' | 'audit'>('users');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);

  const [hackathons, setHackathons] = useState<any[]>([]);
  const [activeHackathonId, setActiveHackathonId] = useState('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const loadUsers = useCallback(async (searchTerm: string, pageOffset: number) => {
    setIsLoadingUsers(true);
    setUsersError(null);
    try {
      const res = await api.getAdminUsers({ search: searchTerm, limit: PAGE_SIZE, offset: pageOffset });
      setUsers(res.users);
      setTotal(res.total);
      setStats(res.stats);
    } catch (err) {
      console.error(err);
      setUsers([]);
      setTotal(0);
      setUsersError(err instanceof Error ? err.message : 'Unable to load the user directory.');
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  const loadAudit = useCallback(async (hackathonId: string) => {
    if (!hackathonId) return;
    setIsLoadingAudit(true);
    try {
      const res = await api.getAuditLogs({ hackathonId, limit: 100 });
      setAuditLogs(Array.isArray(res) ? res : []);
    } catch {
      setAuditLogs([]);
    } finally {
      setIsLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    api
      .getHackathons()
      .then((hList) => {
        setHackathons(hList);
        if (hList.length > 0) setActiveHackathonId(hList[0].id);
      })
      .catch(() => {});
  }, []);

  // Debounced load for both search and pagination.
  useEffect(() => {
    const handle = setTimeout(() => {
      loadUsers(search, offset);
    }, 300);
    return () => clearTimeout(handle);
  }, [search, offset, loadUsers]);

  useEffect(() => {
    if (tab === 'audit') loadAudit(activeHackathonId);
  }, [tab, activeHackathonId, loadAudit]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  const getInitials = (name?: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatDate = (value?: string) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const statCards = [
    { label: 'Total users', value: stats?.total_users ?? 0, icon: Users },
    { label: 'Admins', value: stats?.admin_users ?? 0, icon: Shield },
    { label: 'Users on teams', value: stats?.users_with_teams ?? 0, icon: Activity },
    { label: 'Teams', value: stats?.total_teams ?? 0, icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="h-16 bg-charcoal sticky top-0 z-40 border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-lime text-charcoal flex items-center justify-center font-extrabold text-sm">
              CS
            </div>
            <span className="font-bold text-lg text-white tracking-tight">CyberSwaRaksha</span>
            <span className="hidden sm:inline-flex ml-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-lime/20 text-lime rounded-md">
              Admin
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onExit}
              className="h-9 px-4 rounded-lg border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to board</span>
            </button>
            <button
              onClick={onLogout}
              className="h-9 px-4 rounded-lg border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-charcoal tracking-tight">Admin dashboard</h1>
            <p className="text-muted text-sm mt-1">Every registered user, their team, and the live race test.</p>
          </div>
          <button
            onClick={() => loadUsers(search, offset)}
            disabled={isLoadingUsers}
            className="h-9 px-4 rounded-lg bg-charcoal hover:bg-neutral-800 text-white text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingUsers ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((card, i) => (
            <div
              key={card.label}
              className="bg-white rounded-xl border border-cardBorder p-5 animate-slide-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted">{card.label}</span>
                <div className="w-8 h-8 rounded-lg bg-lime/20 flex items-center justify-center">
                  <card.icon className="w-4 h-4 text-charcoal" />
                </div>
              </div>
              <div className="text-3xl font-extrabold text-charcoal">{card.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-cardBorder mb-6">
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === 'users'
                ? 'border-charcoal text-charcoal'
                : 'border-transparent text-muted hover:text-charcoal'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setTab('lab')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              tab === 'lab'
                ? 'border-charcoal text-charcoal'
                : 'border-transparent text-muted hover:text-charcoal'
            }`}
          >
            <FlaskConical className="w-4 h-4" />
            Race test
          </button>
          <button
            onClick={() => setTab('audit')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              tab === 'audit'
                ? 'border-charcoal text-charcoal'
                : 'border-transparent text-muted hover:text-charcoal'
            }`}
          >
            <ScrollText className="w-4 h-4" />
            Audit log
          </button>
        </div>

        {tab === 'users' && (
          <div className="bg-white rounded-xl border border-cardBorder overflow-hidden animate-slide-up">
            <div className="px-5 py-4 border-b border-cardBorder flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-lg font-bold text-charcoal">All users</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setOffset(0);
                  }}
                  placeholder="Search name, email or username..."
                  className="h-9 pl-9 pr-4 w-full sm:w-72 border border-cardBorder rounded-lg bg-canvas text-sm text-charcoal focus:outline-none focus:border-charcoal focus:ring-1 focus:ring-charcoal/10 placeholder:text-subtle"
                />
              </div>
            </div>

            {isLoadingUsers ? (
              <div className="py-16 text-center">
                <div className="w-6 h-6 border-2 border-cardBorder border-t-charcoal rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted">Loading users...</p>
              </div>
            ) : usersError ? (
              <div role="alert" className="py-16 px-5 text-center">
                <p className="text-sm text-danger">{usersError}</p>
                <button
                  onClick={() => loadUsers(search, offset)}
                  className="mt-4 h-9 px-4 rounded-lg bg-charcoal text-white text-sm font-medium hover:bg-neutral-800"
                >
                  Retry
                </button>
              </div>
            ) : users.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-muted">No users found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-subtle border-b border-cardBorder">
                      <th className="px-5 py-3 font-semibold">User</th>
                      <th className="px-5 py-3 font-semibold">Username</th>
                      <th className="px-5 py-3 font-semibold">Role</th>
                      <th className="px-5 py-3 font-semibold">Team</th>
                      <th className="px-5 py-3 font-semibold">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cardBorder">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-canvas/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-charcoal text-lime flex items-center justify-center font-bold text-[11px] shrink-0">
                              {getInitials(user.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-charcoal truncate">{user.name}</div>
                              <div className="text-xs text-muted truncate">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-muted">
                          {user.username || '—'}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md ${
                              user.role === 'admin'
                                ? 'bg-lime/25 text-charcoal'
                                : 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {user.role || 'user'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {user.team_name ? (
                            <div className="flex items-center gap-2">
                              <span className="text-charcoal truncate max-w-[200px]">{user.team_name}</span>
                              {user.team_role && (
                                <span className="text-[10px] uppercase tracking-wider text-muted">
                                  {user.team_role}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted whitespace-nowrap">{formatDate(user.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-5 py-4 border-t border-cardBorder flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-muted">
                Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOffset((v) => Math.max(0, v - PAGE_SIZE))}
                  disabled={!canPrev || isLoadingUsers}
                  className="h-8 px-3 rounded-lg border border-cardBorder text-xs font-medium text-charcoal hover:bg-canvas disabled:opacity-40 flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                <span className="text-xs text-muted">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setOffset((v) => v + PAGE_SIZE)}
                  disabled={!canNext || isLoadingUsers}
                  className="h-8 px-3 rounded-lg border border-cardBorder text-xs font-medium text-charcoal hover:bg-canvas disabled:opacity-40 flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'lab' && (
          <div className="animate-slide-up">
            {activeHackathonId ? (
              <ConcurrencyLab hackathonId={activeHackathonId} />
            ) : (
              <div className="bg-white rounded-xl border border-cardBorder p-10 text-center">
                <p className="text-sm text-muted">No hackathon found. Seed one first.</p>
              </div>
            )}
          </div>
        )}

        {tab === 'audit' && (
          <div className="bg-white rounded-xl border border-cardBorder overflow-hidden animate-slide-up">
            <div className="px-5 py-4 border-b border-cardBorder flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-charcoal">Audit log</h2>
              <button
                onClick={() => loadAudit(activeHackathonId)}
                disabled={isLoadingAudit}
                className="h-8 px-3 rounded-lg border border-cardBorder text-xs font-medium text-charcoal hover:bg-canvas disabled:opacity-50 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAudit ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {isLoadingAudit ? (
              <div className="py-16 text-center">
                <div className="w-6 h-6 border-2 border-cardBorder border-t-charcoal rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted">Loading audit log...</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-muted">No audit entries yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-subtle border-b border-cardBorder">
                      <th className="px-5 py-3 font-semibold">Action</th>
                      <th className="px-5 py-3 font-semibold">Actor</th>
                      <th className="px-5 py-3 font-semibold">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cardBorder">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-canvas/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-mono text-xs text-charcoal">{log.action}</div>
                          {log.details && (
                            <div className="text-[11px] text-muted mt-0.5 truncate max-w-[420px]">
                              {JSON.stringify(log.details)}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-charcoal whitespace-nowrap">{log.actor_name || '—'}</td>
                        <td className="px-5 py-3 text-muted whitespace-nowrap">{formatDate(log.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}