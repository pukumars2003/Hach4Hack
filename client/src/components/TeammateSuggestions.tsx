import React, { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, UserPlus } from 'lucide-react';
import { Suggestion } from '../types.js';
import { api } from '../api/client.js';

export function TeammateSuggestions({ teamId }: { teamId?: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (teamId) {
        const res = await api.getSuggestions(teamId);
        setSuggestions(res.suggestions);
      } else {
        // Fallback: mock or general candidates
        setSuggestions([
          {
            userId: 'sugg-1',
            name: 'Priya N.',
            email: 'priya@demo.test',
            skills: ['Node', 'Postgres', 'TypeScript'],
            interests: ['Distributed Systems'],
            timezoneOffsetMinutes: 330,
            score: 78,
            breakdown: {
              skills: { score: 85, reason: 'Covers Node and Postgres, which your team wants.' },
              timezone: { score: 100, reason: '0 hours from your time zone.' },
              interests: { score: 60, reason: 'Shared focus on Distributed Systems' },
            },
          },
          {
            userId: 'sugg-2',
            name: 'Omar T.',
            email: 'omar@demo.test',
            skills: ['Docker', 'Rust', 'Kubernetes'],
            interests: ['DevOps'],
            timezoneOffsetMinutes: 270,
            score: 64,
            breakdown: {
              skills: { score: 70, reason: 'Brings Docker, which the team lacks.' },
              timezone: { score: 80, reason: '1 hour from your time zone.' },
              interests: { score: 50, reason: 'Shared interest in backend tooling' },
            },
          },
          {
            userId: 'sugg-3',
            name: 'Elena V.',
            email: 'elena@demo.test',
            skills: ['React', 'Design', 'TailwindCSS'],
            interests: ['UI/UX'],
            timezoneOffsetMinutes: 330,
            score: 59,
            breakdown: {
              skills: { score: 60, reason: 'Strong UI overlap.' },
              timezone: { score: 100, reason: 'Same time zone.' },
              interests: { score: 40, reason: 'Design focus' },
            },
          },
        ]);
      }
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
    <div className="bg-white border border-cardBorder rounded-[14px] p-6 shadow-sm space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between pb-4 border-b border-borderLight">
        <div>
          <h3 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal" />
            <span>Suggested Teammates</span>
          </h3>
          <p className="text-sm text-muted mt-1">
            Ranked by complementary skills (0.6), timezone proximity (0.3), and interest overlap (0.1).
          </p>
        </div>

        <button
          onClick={fetchSuggestions}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-lg border border-borderMuted hover:bg-canvas text-charcoal text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-danger text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal" />
          Calculating complementarity matrix across candidate pool...
        </div>
      ) : suggestions.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted">
          No matching candidates available right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suggestions.map((s) => (
            <div
              key={s.userId}
              className="border border-cardBorder rounded-[10px] p-4 flex flex-col justify-between gap-3 bg-canvas/30 hover:bg-canvas/60 transition-colors"
            >
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-base text-charcoal">{s.name}</span>
                  <span className="font-mono font-bold text-base text-teal-dark bg-teal-light px-2.5 py-0.5 rounded-full">
                    {s.score} pts
                  </span>
                </div>

                <p className="text-sm text-muted leading-relaxed">
                  {s.breakdown?.skills?.reason || 'Good skills and timezone match.'}
                </p>

                <div className="flex gap-1.5 flex-wrap pt-1">
                  {s.skills.map((sk) => (
                    <span
                      key={sk}
                      className="text-xs px-2 py-0.5 rounded bg-borderLight text-charcoal"
                    >
                      {sk}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => alert(`Invite sent to ${s.name}!`)}
                  className="w-full h-9 border border-teal rounded-lg bg-white text-teal-dark hover:bg-teal-light font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Send invite</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
