export type SupportNeed =
  | 'adhd'
  | 'autism'
  | 'anxiety'
  | 'panic'
  | 'mdd'
  | 'bpd'
  | 'irlen'
  | 'sensory_sensitivity'
  | 'learning_difficulty'
  | 'chronic_illness'
  | 'other';

export type ResponseTone = 'gentle' | 'direct' | 'balanced';
export type ResponseLength = 'short' | 'medium' | 'detailed';
export type GuidanceStyle = 'step_by_step' | 'summary_first' | 'adaptive';
export type HouseAccessView = 'family_safe' | 'court_core';

export interface PrivateMemberProfile {
  preferredName: string;
  ageBand?: string;
  roleOrStage?: string;
  workOrStudyContext?: string;
  supportNeeds: SupportNeed[];
  sensoryNotes?: string;
  overwhelmTriggers?: string[];
  groundingSupports?: string[];
  crisisNotes?: string;
  importantContext?: string;
  updatedAt?: unknown;
}

export interface PrivateResponsePreferences {
  defaultTone: ResponseTone;
  responseLength: ResponseLength;
  guidanceStyle: GuidanceStyle;
  checkInsOkay: boolean;
  preferredFirstAgentId?: string;
  avoidToneNotes?: string;
  doNotDo?: string[];
  helpsMost?: string[];
  updatedAt?: unknown;
}

export interface AgentHandlingNotes {
  summary: string;
  instructions: string[];
  updatedAt?: unknown;
}

export interface PrivateMemberConfig {
  profile: PrivateMemberProfile;
  preferences: PrivateResponsePreferences;
  handling: AgentHandlingNotes;
}

export const DEFAULT_MEMBER_PROFILE: PrivateMemberProfile = {
  preferredName: '',
  ageBand: '',
  roleOrStage: '',
  workOrStudyContext: '',
  supportNeeds: [],
  sensoryNotes: '',
  overwhelmTriggers: [],
  groundingSupports: [],
  crisisNotes: '',
  importantContext: ''
};

export const DEFAULT_RESPONSE_PREFERENCES: PrivateResponsePreferences = {
  defaultTone: 'balanced',
  responseLength: 'medium',
  guidanceStyle: 'adaptive',
  checkInsOkay: true,
  preferredFirstAgentId: 'agent_saren',
  avoidToneNotes: '',
  doNotDo: [],
  helpsMost: []
};

export const DEFAULT_AGENT_HANDLING: AgentHandlingNotes = {
  summary: '',
  instructions: []
};

export const DEFAULT_MEMBER_CONFIG: PrivateMemberConfig = {
  profile: DEFAULT_MEMBER_PROFILE,
  preferences: DEFAULT_RESPONSE_PREFERENCES,
  handling: DEFAULT_AGENT_HANDLING
};

export const MEMBER_PROFILE_PATH = (uid: string) => `users/${uid}/private/member_profile`;
export const MEMBER_PREFERENCES_PATH = (uid: string) => `users/${uid}/private/member_preferences`;
export const MEMBER_HANDLING_PATH = (uid: string) => `users/${uid}/private/member_handling`;

export function buildAgentHandlingNotes(
  profile: PrivateMemberProfile,
  preferences: PrivateResponsePreferences
): AgentHandlingNotes {
  const instructions: string[] = [];

  if (profile.supportNeeds.length > 0) {
    instructions.push(`Support needs present: ${profile.supportNeeds.join(', ')}`);
  }

  if (profile.sensoryNotes?.trim()) {
    instructions.push(`Sensory caution: ${profile.sensoryNotes.trim()}`);
  }

  if (profile.overwhelmTriggers && profile.overwhelmTriggers.length > 0) {
    instructions.push(`Avoid overwhelm triggers: ${profile.overwhelmTriggers.join(', ')}`);
  }

  if (profile.groundingSupports && profile.groundingSupports.length > 0) {
    instructions.push(`Helpful grounding supports: ${profile.groundingSupports.join(', ')}`);
  }

  instructions.push(`Default tone: ${preferences.defaultTone}`);
  instructions.push(`Response length: ${preferences.responseLength}`);
  instructions.push(`Guidance style: ${preferences.guidanceStyle}`);

  if (!preferences.checkInsOkay) {
    instructions.push('Do not add extra check-ins unless asked.');
  }

  if (preferences.avoidToneNotes?.trim()) {
    instructions.push(`Avoid this tone: ${preferences.avoidToneNotes.trim()}`);
  }

  if (preferences.doNotDo && preferences.doNotDo.length > 0) {
    instructions.push(`Do not: ${preferences.doNotDo.join(', ')}`);
  }

  if (preferences.helpsMost && preferences.helpsMost.length > 0) {
    instructions.push(`Usually helps: ${preferences.helpsMost.join(', ')}`);
  }

  const summaryParts = [
    profile.preferredName ? `Member: ${profile.preferredName}` : 'Member profile active',
    preferences.defaultTone ? `tone=${preferences.defaultTone}` : '',
    preferences.responseLength ? `length=${preferences.responseLength}` : '',
    preferences.guidanceStyle ? `style=${preferences.guidanceStyle}` : ''
  ].filter(Boolean);

  return {
    summary: summaryParts.join(' | '),
    instructions
  };
}
