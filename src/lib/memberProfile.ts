import { doc, getDoc, setDoc, updateDoc, Firestore } from 'firebase/firestore';

export type SupportNeed = 'adhd' | 'autism' | 'anxiety' | 'panic' | 'mdd' | 'bpd' | 'irlen' | 'sensory_sensitivity' | 'learning_difficulty' | 'chronic_illness' | 'other';
export type ResponseTone = 'gentle' | 'direct' | 'balanced';
export type ResponseLength = 'short' | 'medium' | 'detailed';
export type GuidanceStyle = 'step_by_step' | 'summary_first' | 'adaptive';

export interface MemberProfile {
  name: string;
  pronouns: string;
  timezone: string;
  bio: string;
  primaryGoals: string;
  challenges: string;
  supportNeeds: SupportNeed[];
  otherSupportNotes: string;
}

export interface MemberPreferences {
  tone: ResponseTone;
  length: ResponseLength;
  guidance: GuidanceStyle;
  notionSync: boolean;
  driveSync: boolean;
  calendarSync: boolean;
  gmailSync: boolean;
}

export interface MemberHandling {
  summary: string;
  constraints: string[];
  triggers: string[];
  comforts: string[];
  lastUpdated: number;
}

export interface PrivateMemberConfig {
  profile: MemberProfile;
  preferences: MemberPreferences;
  handling: MemberHandling;
}

export const DEFAULT_MEMBER_PROFILE: MemberProfile = {
  name: '',
  pronouns: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  bio: '',
  primaryGoals: '',
  challenges: '',
  supportNeeds: [],
  otherSupportNotes: ''
};

export const DEFAULT_MEMBER_PREFERENCES: MemberPreferences = {
  tone: 'balanced',
  length: 'medium',
  guidance: 'adaptive',
  notionSync: false,
  driveSync: false,
  calendarSync: false,
  gmailSync: false
};

export const DEFAULT_MEMBER_HANDLING: MemberHandling = {
  summary: 'Standard supportive handling.',
  constraints: [],
  triggers: [],
  comforts: [],
  lastUpdated: Date.now()
};

export const DEFAULT_PRIVATE_CONFIG: PrivateMemberConfig = {
  profile: DEFAULT_MEMBER_PROFILE,
  preferences: DEFAULT_MEMBER_PREFERENCES,
  handling: DEFAULT_MEMBER_HANDLING
};

export const SUPPORT_NEEDS: SupportNeed[] = [
  'adhd', 'autism', 'anxiety', 'panic', 'mdd', 'bpd', 'irlen',
  'sensory_sensitivity', 'learning_difficulty', 'chronic_illness', 'other'
];

export const RESPONSE_TONES: ResponseTone[] = ['gentle', 'direct', 'balanced'];
export const RESPONSE_LENGTHS: ResponseLength[] = ['short', 'medium', 'detailed'];
export const GUIDANCE_STYLES: GuidanceStyle[] = ['step_by_step', 'summary_first', 'adaptive'];

export const FIELD_LABELS: Record<string, string> = {
  adhd: 'ADHD',
  autism: 'Autism (ASD)',
  anxiety: 'Anxiety',
  panic: 'Panic Disorder',
  mdd: 'MDD (Depression)',
  bpd: 'BPD',
  irlen: 'Irlen Syndrome',
  sensory_sensitivity: 'Sensory Sensitivity',
  learning_difficulty: 'Learning Difficulty',
  chronic_illness: 'Chronic Illness',
  other: 'Other Support Needed',
  gentle: 'Gentle',
  direct: 'Direct',
  balanced: 'Balanced',
  short: 'Short',
  medium: 'Medium',
  detailed: 'Detailed',
  step_by_step: 'Step-by-Step',
  summary_first: 'Summary First',
  adaptive: 'Adaptive'
};

export const FIELD_HELP: Record<string, string> = {
  adhd: 'Focus, executive function, or impulse support.',
  autism: 'Clarity, directness, or routine-based interaction.',
  anxiety: 'Reassurance and structured pacing.',
  panic: 'Emergency grounding and de-escalation focus.',
  mdd: 'Low-energy support and encouragement.',
  bpd: 'Stability and validated communication.',
  irlen: 'Visual processing and format sensitivity.',
  sensory_sensitivity: 'Noise, light, or texture-based triggers.',
  learning_difficulty: 'Simplified instructions or multi-mode help.',
  chronic_illness: 'Pacing and spoon-management awareness.',
  other: 'Specify in notes if needed.'
};

export const MEMBER_PROFILE_PATH = (uid: string) => `users/${uid}/private/member_profile`;
export const MEMBER_PREFERENCES_PATH = (uid: string) => `users/${uid}/private/member_preferences`;
export const MEMBER_HANDLING_PATH = (uid: string) => `users/${uid}/private/member_handling`;
