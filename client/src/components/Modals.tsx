import React, { useState, useEffect } from 'react';
import { X, KeyRound, Plus, UserPlus, HelpCircle, AlertCircle, Check } from 'lucide-react';
import { api } from '../api/client.js';
import { Team } from '../types.js';

// --- CREATE TEAM MODAL ---
export function CreateTeamModal({
  isOpen,
  onClose,
  hackathonId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  hackathonId: string;
  onSuccess: (team: Team) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [maxMembers, setMaxMembers] = useState(4);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const neededSkills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    try {
      const newTeam = await api.createTeam({
        hackathonId,
        name,
        description,
        neededSkills,
        maxMembers,
      });
      onSuccess(newTeam);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create team');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-cardBorder rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-borderLight">
          <h2 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <Plus className="w-5 h-5 text-teal" />
            <span>Create New Team</span>
          </h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-charcoal transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-danger text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-charcoal font-semibold mb-1 text-[13px]">Team Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pixel Pushers"
              className="w-full px-3.5 py-2.5 bg-white border border-borderMuted rounded-[10px] text-charcoal placeholder:text-muted focus:outline-none focus:border-teal"
            />
          </div>

          <div>
            <label className="block text-charcoal font-semibold mb-1 text-[13px]">Description / Project Goal</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Accessibility checker for small-business sites..."
              className="w-full px-3.5 py-2.5 bg-white border border-borderMuted rounded-[10px] text-charcoal placeholder:text-muted focus:outline-none focus:border-teal"
            />
          </div>

          <div>
            <label className="block text-charcoal font-semibold mb-1 text-[13px]">Wanted Skills (Comma-separated)</label>
            <input
              type="text"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="React, Node, Postgres, Design"
              className="w-full px-3.5 py-2.5 bg-white border border-borderMuted rounded-[10px] text-charcoal placeholder:text-muted focus:outline-none focus:border-teal"
            />
          </div>

          <div>
            <label className="block text-charcoal font-semibold mb-1 text-[13px]">Maximum Team Size</label>
            <select
              value={maxMembers}
              onChange={(e) => setMaxMembers(parseInt(e.target.value, 10))}
              className="w-full px-3.5 py-2.5 bg-white border border-borderMuted rounded-[10px] text-charcoal focus:outline-none focus:border-teal"
            >
              <option value={2}>2 Members</option>
              <option value={3}>3 Members</option>
              <option value={4}>4 Members (Standard)</option>
              <option value={5}>5 Members</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-[10px] text-charcoal border border-borderMuted hover:bg-canvas font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-[10px] bg-teal hover:bg-teal-hover text-white font-semibold transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Creating Team...' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- JOIN CODE MODAL ---
export function JoinCodeModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: { teamId: string; teamName: string }) => void;
}) {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.joinByCode(code.trim().toUpperCase());
      onSuccess(res);
      onClose();
    } catch (err: any) {
      if (err.statusCode === 409) {
        setError(err.message || 'Seat was just claimed by another racer or team is full.');
      } else {
        setError(err.message || 'Invalid or expired invite code.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-cardBorder rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-borderLight">
          <h2 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-teal" />
            <span>Join Team with Code</span>
          </h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-charcoal transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-danger text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-charcoal font-semibold mb-1.5 text-[13px]">
              Invite Code (Crockford Base32)
            </label>
            <input
              type="text"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. K7QM-2XWD-9PFH"
              className="w-full px-4 py-3 bg-white border border-borderMuted rounded-[10px] text-charcoal text-center text-lg font-mono font-bold tracking-widest placeholder:text-muted placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:border-teal"
            />
            <p className="text-[12px] text-muted mt-2">
              Protected by PostgreSQL guarded transactions: hundreds can enter the code simultaneously, and exactly one claims the seat.
            </p>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-[10px] text-charcoal border border-borderMuted hover:bg-canvas font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !code.trim()}
              className="px-5 py-2.5 rounded-[10px] bg-teal hover:bg-teal-hover text-white font-semibold transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Verifying & Claiming...' : 'Claim Last Seat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- REQUEST TO JOIN MODAL ---
export function RequestJoinModal({
  isOpen,
  onClose,
  team,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
  onSuccess: () => void;
}) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !team) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await api.requestToJoin(team.id, message);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit join request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-cardBorder rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-borderLight">
          <h2 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-teal" />
            <span>Ask to Join {team.name}</span>
          </h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-charcoal transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-danger text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-charcoal font-semibold mb-1.5 text-[13px]">
              Note to Team Leader
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Introduce yourself, your skills, and what you would like to build..."
              className="w-full px-3.5 py-2.5 bg-white border border-borderMuted rounded-[10px] text-charcoal placeholder:text-muted focus:outline-none focus:border-teal text-sm"
            />
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-[10px] text-charcoal border border-borderMuted hover:bg-canvas font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-[10px] bg-teal hover:bg-teal-hover text-white font-semibold transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- KEYBOARD SHORTCUTS HELP MODAL ---
export function KeyboardHelpModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'J', desc: 'Open Join by Invite Code modal' },
    { key: 'C', desc: 'Open Create New Team modal' },
    { key: '/', desc: 'Focus and jump to search input' },
    { key: 'L', desc: 'Toggle Concurrency Stress Lab' },
    { key: 'Esc', desc: 'Close open modal or exit team view' },
    { key: '?', desc: 'Show this keyboard navigation help' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-cardBorder rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-borderLight">
          <h2 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-teal" />
            <span>Keyboard Shortcuts</span>
          </h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-charcoal transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="divide-y divide-borderLight">
          {shortcuts.map((sc) => (
            <div key={sc.key} className="py-2.5 flex items-center justify-between text-sm">
              <span className="text-charcoal">{sc.desc}</span>
              <kbd className="px-2.5 py-1 bg-canvas border border-borderMuted rounded font-mono text-xs font-semibold text-charcoal shadow-2xs">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 text-center">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-[10px] bg-canvas border border-borderMuted hover:bg-borderLight text-charcoal font-semibold text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
