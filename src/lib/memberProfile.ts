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

export const SUPPORT_NEEDS: SupportNeed[] = [
  'adhd',
  'autism',
  'anxiety',
  'panic',
  'mdd',
  'bpd',
  'irlen',
  'sensory_sensitivity',
  'learning_difficulty',
  'chronic_illness',
  'other'
];

export const RESPONSE_TONES: ResponseTone[] = ['gentle', 'direct', 'balanced'];
export const RESPONSE_LENGTHS: ResponseLength[] = ['short', 'medium', 'detailed'];
export const GUIDANCE_STYLES: GuidanceStyle[] = ['step_by_step', 'summary_first', 'adaptive'];

export const FIELD_LABELS: Record<string, string> = {
  adhd: 'ADHD',
  autism: 'Autism',
  anxiety: 'Anxiety',
  panic: 'Panic',
  mdd: 'MDD',
  bpd: 'BPD',
  irlen: 'Irlen',
  sensory_sensitivity: 'Sensory sensitivity',
  learning_difficulty: 'Learning difficulty',
  chronic_illness: 'Chronic illness',
  other: 'Other',
  gentle: 'Gentle',
  direct: 'Direct',
  balanced: 'Balanced',
  short: 'Short',
  medium: 'Medium',
  detailed: 'Detailed',
  step_by_step: 'Step by step',
  summary_first: 'Summary first',
  adaptive: 'Adaptive'
};

export const FIELD_HELP: Record<string, string> = {
  adhd: 'Prefer clarity, reduced clutter, and manageable pacing.',
  autism: 'Prefer predictable structure and reduced ambiguity.',
  anxiety: 'Prefer calm tone and reduced urgency pressure.',
  panic: 'Avoid overload and escalation-heavy phrasing.',
  mdd: 'Keep support grounded, clear, and non-performative.',
  bpd: 'Be steady, clear, and avoid unnecessary volatility.',
  irlen: 'Reduce visual density and sensory strain where possible.',
  sensory_sensitivity: 'Use lower intensity formatting and pacing.',
  learning_difficulty: 'Prefer simpler structure and clearer sequencing.',
  chronic_illness: 'Respect energy limits, pacing, and fluctuation.',
  other: 'Additional support needs not covered above.'
};

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
