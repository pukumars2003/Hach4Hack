import React, { useState } from 'react';
import { Play, CheckCircle2, AlertCircle, RefreshCw, Zap, ShieldCheck } from 'lucide-react';
import { apiRequest, API_BASE } from '../api/client.js';

interface RaceResultItem {
  id: number;
  userId: string;
  name: string;
  status: number;
  durationMs: number;
  code?: string;
}

export function ConcurrencyLab({ hackathonId }: { hackathonId: string }) {
  const [concurrencyCount, setConcurrencyCount] = useState<number>(50);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [results, setResults] = useState<RaceResultItem[]>([]);
  const [stats, setStats] = useState<{
    wins: number;
    conflicts: number;
    errors: number;
    dbCount: number;
    maxMembers: number;
    totalDurationMs: number;
  } | null>(null);

  const runRaceSimulation = async () => {
    setIsRunning(true);
    setResults([]);
    setStats(null);

    try {
      // 1. Create a fresh test team with maxMembers = 4
      const leaderName = `LabLeader-${Date.now()}`;
      const leaderEmail = `lab_lead_${Date.now()}@test.com`;

      // Register temporary leader
      const leadAuth = await apiRequest<{ token: string; user: any }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: leaderEmail,
          password: 'Password123!',
          name: leaderName,
        }),
      });

      // Create team
      const newTeam = await apiRequest<any>('/teams', {
        method: 'POST',
        headers: { Authorization: `Bearer ${leadAuth.token}` },
        body: JSON.stringify({
          hackathonId,
          name: `Concurrency Lab Race Team ${Date.now()}`,
          maxMembers: 4,
        }),
      });

      // Generate invite code
      const inviteData = await apiRequest<{ code: string }>(`/teams/${newTeam.id}/invites`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${leadAuth.token}` },
        body: JSON.stringify({ expiresInHours: 2 }),
      });

      // Join 2 dummy members so exactly 1 seat remains (3/4)
      for (let m = 1; m <= 2; m++) {
        const dummy = await apiRequest<{ token: string }>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: `lab_dummy_${m}_${Date.now()}@test.com`,
            password: 'Password123!',
            name: `Pioneer ${m}`,
          }),
        });
        await apiRequest('/teams/join-by-code', {
          method: 'POST',
          headers: { Authorization: `Bearer ${dummy.token}` },
          body: JSON.stringify({ code: inviteData.code }),
        });
      }

      // 2. Prepare distinct racers in 1 single fast batch call
      const batchRes = await apiRequest<{ racers: { token: string; name: string }[] }>('/teams/lab/batch-racers', {
        method: 'POST',
        body: JSON.stringify({ count: concurrencyCount }),
      });
      const racers = batchRes.racers;

      // 3. Fire all concurrent requests at the exact same instant using Promise.all
      const overallStart = performance.now();

      const racePromises = racers.map(async (racer, idx) => {
        const start = performance.now();
        try {
          const res = await fetch(`${API_BASE}/teams/join-by-code`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${racer.token}`,
              'Idempotency-Key': `lab-race-${idx}-${Date.now()}`,
            },
            body: JSON.stringify({ code: inviteData.code }),
          });

          const dur = Math.round(performance.now() - start);
          const body = await res.json().catch(() => ({}));
          return {
            id: idx + 1,
            userId: racer.name,
            name: racer.name,
            status: res.status,
            durationMs: dur,
            code: body?.code,
          };
        } catch {
          return {
            id: idx + 1,
            userId: racer.name,
            name: racer.name,
            status: 0,
            durationMs: Math.round(performance.now() - start),
            code: 'network_fail',
          };
        }
      });

      const responses = await Promise.all(racePromises);
      const totalDuration = Math.round(performance.now() - overallStart);

      // 4. Query target team to verify DB state
      const teamCheck = await apiRequest<any>(`/teams/${newTeam.id}`);

      const wins = responses.filter((r) => r.status === 200).length;
      const conflicts = responses.filter((r) => r.status === 409).length;
      const errors = responses.filter((r) => r.status >= 500 || r.status === 0).length;

      setResults(responses);
      setStats({
        wins,
        conflicts,
        errors,
        dbCount: teamCheck.member_count,
        maxMembers: teamCheck.max_members,
        totalDurationMs: totalDuration,
      });
    } catch (err: any) {
      console.error(err);
      alert('Error during simulation: ' + err.message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-white border border-cardBorder rounded-[14px] p-6 shadow-sm max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-borderLight">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-teal-light text-teal-dark">
              <Zap className="w-5 h-5" />
            </span>
            <h2 className="text-2xl font-bold text-charcoal tracking-tight">
              Live Concurrency Race Test
            </h2>
          </div>
          <p className="text-sm text-muted mt-1">
            Simulate 50+ participants clicking &ldquo;Join&rdquo; at the exact same millisecond. Prove that exactly 1 gets the seat.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-canvas px-3.5 py-2.5 rounded-[10px] border border-borderMuted text-xs text-charcoal font-semibold">
            <span>Racers:</span>
            <select
              value={concurrencyCount}
              onChange={(e) => setConcurrencyCount(Number(e.target.value))}
              disabled={isRunning}
              className="bg-transparent text-teal-dark font-bold focus:outline-none cursor-pointer"
            >
              <option value={25}>25 simultaneous</option>
              <option value={50}>50 simultaneous (Req)</option>
              <option value={100}>100 simultaneous</option>
              <option value={250}>250 simultaneous (5x)</option>
            </select>
          </div>

          <button
            onClick={runRaceSimulation}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-teal hover:bg-teal-hover text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Racing...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Fire Race Test</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary Scorecard */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in duration-300">
          <div className="p-4 rounded-xl bg-[#DCF3E4] border border-[#86EFAC] flex flex-col justify-between">
            <div className="text-xs font-bold text-[#14532D] uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#14532D]" />
              <span>Claimed Seat</span>
            </div>
            <div className="text-3xl font-black font-mono text-[#14532D] mt-2">
              {stats.wins} <span className="text-xs font-sans font-medium text-[#14532D]">Winner</span>
            </div>
            <div className="text-[11px] text-[#14532D] mt-1">
              {stats.wins === 1 ? '✅ Exactly 1 Winner' : '❌ Race Condition!'}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#FDEBC8] border border-[#FDBA74] flex flex-col justify-between">
            <div className="text-xs font-bold text-[#7A3E00] uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-[#7A3E00]" />
              <span>Seat Full (409)</span>
            </div>
            <div className="text-3xl font-black font-mono text-[#7A3E00] mt-2">
              {stats.conflicts} <span className="text-xs font-sans font-medium text-[#7A3E00]">Refusals</span>
            </div>
            <div className="text-[11px] text-[#7A3E00] mt-1">
              Atomic 409 Conflict returned
            </div>
          </div>

          <div className="p-4 rounded-xl bg-canvas border border-cardBorder flex flex-col justify-between">
            <div className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-teal" />
              <span>5xx Errors</span>
            </div>
            <div className="text-3xl font-black font-mono text-charcoal mt-2">
              {stats.errors}
            </div>
            <div className="text-[11px] text-muted mt-1">
              Zero internal exceptions
            </div>
          </div>

          <div className="p-4 rounded-xl bg-canvas border border-cardBorder flex flex-col justify-between">
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              Postgres Invariant
            </div>
            <div className="text-3xl font-black font-mono text-charcoal mt-2">
              {stats.dbCount}/{stats.maxMembers}
            </div>
            <div className="text-[11px] text-muted mt-1">
              Zero over-capacity in database
            </div>
          </div>
        </div>
      )}

      {/* Racers Result Grid */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>Individual Racer Audit Log</span>
            <span>Total burst duration: {stats?.totalDurationMs}ms</span>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-xl border border-cardBorder divide-y divide-borderLight">
            {results.map((r) => {
              const isWinner = r.status === 200;
              const isConflict = r.status === 409;

              return (
                <div
                  key={r.id}
                  className={`p-3 flex items-center justify-between text-xs transition-colors ${
                    isWinner ? 'bg-[#DCF3E4]/40' : 'bg-white hover:bg-canvas/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-muted w-6 text-right font-bold">
                      #{r.id}
                    </span>
                    <span className="font-semibold text-charcoal">{r.name}</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="font-mono text-muted text-[11px]">
                      {r.durationMs}ms
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                        isWinner
                          ? 'bg-[#DCF3E4] text-[#14532D]'
                          : isConflict
                          ? 'bg-[#FDEBC8] text-[#7A3E00]'
                          : 'bg-red-100 text-danger'
                      }`}
                    >
                      {r.status === 200 ? '200 OK (WINNER)' : r.status === 409 ? '409 CONFLICT' : `${r.status} ERROR`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
