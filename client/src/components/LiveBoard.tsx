import React, { useState } from 'react';
import { Search, Filter, Users, ArrowRight, ShieldCheck, Clock, UserPlus } from 'lucide-react';
import { Team } from '../types.js';

interface LiveBoardProps {
  teams: Team[];
  isLoading: boolean;
  search: string;
  setSearch: (s: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  selectedSkill: string;
  setSelectedSkill: (s: string) => void;
  onSelectTeam: (teamId: string) => void;
  onRequestJoin: (team: Team) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  currentUserId?: string;
  userTeamId?: string;
}

export function LiveBoard({
  teams,
  isLoading,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  selectedSkill,
  setSelectedSkill,
  onSelectTeam,
  onRequestJoin,
  hasMore,
  onLoadMore,
  currentUserId,
  userTeamId,
}: LiveBoardProps) {
  const commonSkills = ['React', 'Node.js', 'PostgreSQL', 'TypeScript', 'Python', 'Docker', 'Rust', 'Machine Learning'];

  return (
    <div className="space-y-6">
      {/* Search & Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="search-input"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teams by name or description... (Press / to focus)"
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {['all', 'forming', 'ready', 'full'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg capitalize font-medium transition-colors ${
                  statusFilter === st
                    ? 'bg-slate-800 text-emerald-400 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Skill Badges */}
        <div className="flex items-center gap-2 flex-wrap text-xs pt-1 border-t border-slate-800/60">
          <span className="text-slate-500 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5" /> Needed:
          </span>
          {commonSkills.map((sk) => (
            <button
              key={sk}
              onClick={() => setSelectedSkill(selectedSkill === sk ? '' : sk)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                selectedSkill === sk
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {sk}
            </button>
          ))}
          {selectedSkill && (
            <button
              onClick={() => setSelectedSkill('')}
              className="text-xs text-rose-400 hover:underline ml-2"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Team Cards Grid */}
      {teams.length === 0 && !isLoading ? (
        <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-slate-800">
          <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-200">No teams found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Try adjusting your search criteria or create a new team to begin forming your squad.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {teams.map((t) => {
            const isFull = t.member_count >= t.max_members;
            const isUserInThisTeam = userTeamId === t.id;
            const progress = (t.member_count / t.max_members) * 100;

            return (
              <div
                key={t.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-xl group"
              >
                <div>
                  {/* Status & Capacity */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        t.status === 'full'
                          ? 'bg-slate-800 text-slate-400'
                          : t.status === 'ready'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {t.status}
                    </span>

                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t.member_count}/{t.max_members}</span>
                    </div>
                  </div>

                  {/* Member Capacity Progress Bar */}
                  <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mb-3">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isFull ? 'bg-slate-600' : t.status === 'ready' ? 'bg-blue-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {/* Team Title */}
                  <h3
                    onClick={() => onSelectTeam(t.id)}
                    className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors cursor-pointer truncate"
                  >
                    {t.name}
                  </h3>

                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {t.description || 'No description provided.'}
                  </p>

                  {/* Needed Skills */}
                  {t.needed_skills && t.needed_skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {t.needed_skills.slice(0, 3).map((sk) => (
                        <span
                          key={sk}
                          className="px-2 py-0.5 rounded-md bg-slate-950 text-slate-300 border border-slate-800 text-[10px] font-medium"
                        >
                          {sk}
                        </span>
                      ))}
                      {t.needed_skills.length > 3 && (
                        <span className="text-[10px] text-slate-500 self-center">
                          +{t.needed_skills.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate text-slate-400">
                    <div className="w-5 h-5 rounded-full bg-slate-800 text-[10px] flex items-center justify-center font-bold text-emerald-400">
                      {(t.leader_name || 'L').slice(0, 1)}
                    </div>
                    <span className="truncate max-w-[100px]">{t.leader_name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isUserInThisTeam && !userTeamId && !isFull && (
                      <button
                        onClick={() => onRequestJoin(t)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/20 flex items-center gap-1 transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Request</span>
                      </button>
                    )}

                    <button
                      onClick={() => onSelectTeam(t.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1 transition-colors"
                    >
                      <span>View</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Load More */}
      {hasMore && (
        <div className="text-center pt-4">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 transition-all hover:border-slate-700 active:scale-95"
          >
            {isLoading ? 'Loading more teams...' : 'Load More Teams'}
          </button>
        </div>
      )}
    </div>
  );
}

