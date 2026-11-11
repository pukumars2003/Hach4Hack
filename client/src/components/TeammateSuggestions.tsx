import React, { useEffect, useState } from 'react';
import { Sparkles, Compass, BrainCircuit, Heart, RefreshCw, UserPlus } from 'lucide-react';
import { Suggestion } from '../types.js';
import { api } from '../api/client.js';

export function TeammateSuggestions({ teamId }: { teamId: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getSuggestions(teamId);
      setSuggestions(res.suggestions);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, [teamId]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <span>Teammate Recommendation Engine</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Candidates ranked by skill complementarity (0.6), timezone proximity (0.3), and interest overlap (0.1).
          </p>
        </div>

        <button
          onClick={fetchSuggestions}
          disabled={isLoading}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
          Evaluating candidate pool and calculating complementarity matrix...
        </div>
      ) : suggestions.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500 italic">
          No eligible candidates found. All participants may currently belong to a team.
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((cand) => (
            <div
              key={cand.userId}
              className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-sm">
                    {cand.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-200">{cand.name}</h4>
                    <div className="text-xs text-slate-500 mt-0.5">
                      UTC {cand.timezoneOffsetMinutes >= 0 ? `+${cand.timezoneOffsetMinutes / 60}h` : `${cand.timezoneOffsetMinutes / 60}h`}
                    </div>
                  </div>
                </div>

                {/* Score Pill */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Match Score</div>
                    <div className="text-xl font-black text-emerald-400 font-mono">
                      {cand.score} <span className="text-xs text-slate-500 font-normal">/ 100</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Explainability Breakdown */}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                {/* Skill Synergy */}
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="flex items-center gap-1 font-medium">
                      <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" /> Skill Synergy
                    </span>
                    <span className="font-mono font-bold text-slate-300">
                      {Math.round(cand.breakdown.skills.score * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    {cand.breakdown.skills.reason}
                  </p>
                </div>

                {/* Timezone Overlap */}
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="flex items-center gap-1 font-medium">
                      <Compass className="w-3.5 h-3.5 text-amber-400" /> Timezone
                    </span>
                    <span className="font-mono font-bold text-slate-300">
                      {Math.round(cand.breakdown.timezone.score * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    {cand.breakdown.timezone.reason}
                  </p>
                </div>

                {/* Shared Interests */}
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="flex items-center gap-1 font-medium">
                      <Heart className="w-3.5 h-3.5 text-rose-400" /> Interests
                    </span>
                    <span className="font-mono font-bold text-slate-300">
                      {Math.round(cand.breakdown.interests.score * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    {cand.breakdown.interests.reason}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
