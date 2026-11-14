import React, { useState, useEffect, useCallback } from 'react';
import { LogOut, Users, Shield, Activity, ChevronRight, Search, RefreshCw } from 'lucide-react';
import { api } from '../api/client.js';
import { Team } from '../types.js';

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState({ totalTeams: 0, totalMembers: 0, formingTeams: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [hackathons, setHackathons] = useState<any[]>([]);
  const [activeHackathonId, setActiveHackathonId] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const hList = await api.getHackathons();
      setHackathons(hList);
      const hId = hList.length > 0 ? hList[0].id : '';
      setActiveHackathonId(hId);

      if (hId) {
        const res = await api.getTeams({ hackathonId: hId, limit: 100 });
        setTeams(res.teams);
        const totalMembers = res.teams.reduce((sum: number, t: Team) => sum + t.member_count, 0);
        const formingTeams = res.teams.filter((t: Team) => t.status === 'forming').length;
        setStats({ totalTeams: res.teams.length, totalMembers, formingTeams });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredTeams = teams.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Top navigation bar */}
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

          <button
            onClick={onLogout}
            className="h-9 px-4 rounded-lg border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        {/* Page heading */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-charcoal tracking-tight">Dashboard</h1>
            <p className="text-muted text-sm mt-1">Overview of teams and platform activity.</p>
          </div>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="h-9 px-4 rounded-lg bg-charcoal hover:bg-neutral-800 text-white text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-cardBorder p-5 animate-slide-up" style={{ animationDelay: '0ms' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted">Total Teams</span>
              <div className="w-8 h-8 rounded-lg bg-lime/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-charcoal" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-charcoal">{stats.totalTeams}</div>
          </div>

          <div className="bg-white rounded-xl border border-cardBorder p-5 animate-slide-up" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted">Total Members</span>
              <div className="w-8 h-8 rounded-lg bg-lime/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-charcoal" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-charcoal">{stats.totalMembers}</div>
          </div>

          <div className="bg-white rounded-xl border border-cardBorder p-5 animate-slide-up" style={{ animationDelay: '160ms' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted">Forming</span>
              <div className="w-8 h-8 rounded-lg bg-lime/20 flex items-center justify-center">
                <Activity className="w-4 h-4 text-charcoal" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-charcoal">{stats.formingTeams}</div>
          </div>
        </div>

        {/* Teams section */}
        <div className="bg-white rounded-xl border border-cardBorder overflow-hidden animate-slide-up" style={{ animationDelay: '200ms' }}>
          <div className="px-5 py-4 border-b border-cardBorder flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-bold text-charcoal">Teams</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teams..."
                className="h-9 pl-9 pr-4 w-full sm:w-64 border border-cardBorder rounded-lg bg-canvas text-sm text-charcoal focus:outline-none focus:border-charcoal focus:ring-1 focus:ring-charcoal/10 placeholder:text-subtle"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 text-center">
              <div className="w-6 h-6 border-2 border-cardBorder border-t-charcoal rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted">Loading teams...</p>
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted">No teams found.</p>
            </div>
          ) : (
            <div className="divide-y divide-cardBorder">
              {filteredTeams.map((team) => (
                <div
                  key={team.id}
                  className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-canvas/50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-[15px] text-charcoal truncate">{team.name}</span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md ${team.status === 'forming'
                            ? 'bg-lime/20 text-charcoal'
                            : team.status === 'ready'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-neutral-100 text-neutral-600'
                          }`}
                      >
                        {team.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted truncate">{team.description || 'No description'}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-sm font-mono text-muted">
                      {team.member_count}/{team.max_members}
                    </span>
                    <ChevronRight className="w-4 h-4 text-subtle group-hover:text-charcoal transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-12 pb-8 text-center">
          <p className="text-xs text-subtle">
            CyberSwaRaksha — Built with Fastify + PostgreSQL + React
          </p>
        </footer>
      </main>
    </div>
  );
}
