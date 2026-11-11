export interface TeamProfile {
  id: string;
  neededSkills: string[];
  existingSkills: string[];
  medianTimezoneOffset: number;
  combinedInterests: string[];
}

export interface CandidateUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  skills: string[];
  interests: string[];
  timezoneOffsetMinutes: number;
}

export interface SuggestionResult {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  skills: string[];
  interests: string[];
  timezoneOffsetMinutes: number;
  score: number;
  breakdown: {
    skills: {
      score: number;
      reason: string;
    };
    timezone: {
      score: number;
      reason: string;
    };
    interests: {
      score: number;
      reason: string;
    };
  };
}

/**
 * Calculates teammate suggestion score according to the Hackathon Spec:
 * Score = 100 * (0.6 * S_skill + 0.3 * S_tz + 0.1 * S_interest)
 */
export function scoreCandidate(
  team: TeamProfile,
  candidate: CandidateUser
): SuggestionResult {
  const normCandSkills = new Set(candidate.skills.map((s) => s.toLowerCase().trim()));
  const normNeededSkills = team.neededSkills.map((s) => s.toLowerCase().trim());
  const normExistingSkills = new Set(team.existingSkills.map((s) => s.toLowerCase().trim()));
  const normCandInterests = new Set(candidate.interests.map((i) => i.toLowerCase().trim()));
  const normTeamInterests = new Set(team.combinedInterests.map((i) => i.toLowerCase().trim()));

  // 1. Skill Score (S_skill = 0.6 * NeedMatch + 0.4 * Novelty)
  const matchedNeeded = normNeededSkills.filter((s) => normCandSkills.has(s));
  const needMatchRatio = normNeededSkills.length > 0
    ? matchedNeeded.length / normNeededSkills.length
    : 1.0;

  const novelSkills = Array.from(normCandSkills).filter((s) => !normExistingSkills.has(s));
  const noveltyRatio = normCandSkills.size > 0
    ? novelSkills.length / normCandSkills.size
    : 0.0;

  const sSkill = 0.6 * needMatchRatio + 0.4 * noveltyRatio;

  let skillReason = '';
  if (normNeededSkills.length > 0) {
    skillReason = `Covers ${matchedNeeded.length} of ${normNeededSkills.length} wanted skills (${matchedNeeded.slice(0, 3).join(', ') || 'none'})`;
    if (novelSkills.length > 0) {
      skillReason += `; brings ${novelSkills.slice(0, 2).join(', ')}, which the team lacks`;
    }
  } else {
    skillReason = `Brings ${novelSkills.length} diverse skills to the team`;
  }

  // 2. Timezone Score (S_tz = 1 - d / 720)
  const diffRaw = Math.abs(candidate.timezoneOffsetMinutes - team.medianTimezoneOffset);
  const diffMinutes = Math.min(diffRaw, 1440 - diffRaw);
  const sTz = Math.max(0, 1 - diffMinutes / 720);

  const diffHours = (diffMinutes / 60).toFixed(1).replace(/\.0$/, '');
  const tzReason = diffMinutes === 0
    ? 'Same time zone as team median'
    : `${diffHours} hour(s) from the team's median time zone`;

  // 3. Shared Interests Score (Jaccard similarity)
  let sInterest = 0;
  const sharedInterests = Array.from(normCandInterests).filter((i) => normTeamInterests.has(i));
  const unionCount = new Set([...normCandInterests, ...normTeamInterests]).size;

  if (unionCount > 0) {
    sInterest = sharedInterests.length / unionCount;
  }

  const interestReason = sharedInterests.length > 0
    ? `Shares ${sharedInterests.length} of ${normTeamInterests.size} combined interests (${sharedInterests.slice(0, 2).join(', ')})`
    : 'No overlapping interests noted';

  // 4. Total Composite Score (0 - 100)
  const totalScore = Math.round(100 * (0.6 * sSkill + 0.3 * sTz + 0.1 * sInterest));

  return {
    userId: candidate.id,
    name: candidate.name,
    email: candidate.email,
    avatarUrl: candidate.avatarUrl,
    skills: candidate.skills,
    interests: candidate.interests,
    timezoneOffsetMinutes: candidate.timezoneOffsetMinutes,
    score: totalScore,
    breakdown: {
      skills: {
        score: Math.round(sSkill * 100) / 100,
        reason: skillReason,
      },
      timezone: {
        score: Math.round(sTz * 100) / 100,
        reason: tzReason,
      },
      interests: {
        score: Math.round(sInterest * 100) / 100,
        reason: interestReason,
      },
    },
  };
}

