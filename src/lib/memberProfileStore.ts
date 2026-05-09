import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import {
  buildAgentHandlingNotes,
  DEFAULT_AGENT_HANDLING,
  DEFAULT_MEMBER_CONFIG,
  DEFAULT_MEMBER_PROFILE,
  DEFAULT_RESPONSE_PREFERENCES,
  MEMBER_HANDLING_PATH,
  MEMBER_PREFERENCES_PATH,
  MEMBER_PROFILE_PATH,
  type AgentHandlingNotes,
  type PrivateMemberConfig,
  type PrivateMemberProfile,
  type PrivateResponsePreferences
} from './memberProfile';

function normalizeProfile(data: Partial<PrivateMemberProfile> | undefined): PrivateMemberProfile {
  return {
    ...DEFAULT_MEMBER_PROFILE,
    ...(data || {}),
    supportNeeds: Array.isArray(data?.supportNeeds) ? data!.supportNeeds : [],
    overwhelmTriggers: Array.isArray(data?.overwhelmTriggers) ? data!.overwhelmTriggers : [],
    groundingSupports: Array.isArray(data?.groundingSupports) ? data!.groundingSupports : []
  };
}

function normalizePreferences(data: Partial<PrivateResponsePreferences> | undefined): PrivateResponsePreferences {
  return {
    ...DEFAULT_RESPONSE_PREFERENCES,
    ...(data || {}),
    doNotDo: Array.isArray(data?.doNotDo) ? data!.doNotDo : [],
    helpsMost: Array.isArray(data?.helpsMost) ? data!.helpsMost : []
  };
}

function normalizeHandling(data: Partial<AgentHandlingNotes> | undefined): AgentHandlingNotes {
  return {
    ...DEFAULT_AGENT_HANDLING,
    ...(data || {}),
    instructions: Array.isArray(data?.instructions) ? data!.instructions : []
  };
}

export async function loadPrivateMemberConfig(
  db: Firestore,
  uid: string
): Promise<PrivateMemberConfig> {
  const [profileSnap, preferencesSnap, handlingSnap] = await Promise.all([
    getDoc(doc(db, MEMBER_PROFILE_PATH(uid))),
    getDoc(doc(db, MEMBER_PREFERENCES_PATH(uid))),
    getDoc(doc(db, MEMBER_HANDLING_PATH(uid)))
  ]);

  const profile = normalizeProfile(
    profileSnap.exists() ? (profileSnap.data() as Partial<PrivateMemberProfile>) : undefined
  );
  const preferences = normalizePreferences(
    preferencesSnap.exists() ? (preferencesSnap.data() as Partial<PrivateResponsePreferences>) : undefined
  );

  const fallbackHandling = buildAgentHandlingNotes(profile, preferences);
  const handling = normalizeHandling(
    handlingSnap.exists() ? (handlingSnap.data() as Partial<AgentHandlingNotes>) : fallbackHandling
  );

  return {
    ...DEFAULT_MEMBER_CONFIG,
    profile,
    preferences,
    handling
  };
}

export async function savePrivateMemberConfig(
  db: Firestore,
  uid: string,
  config: PrivateMemberConfig
): Promise<PrivateMemberConfig> {
  const profile: PrivateMemberProfile = normalizeProfile(config.profile);
  const preferences: PrivateResponsePreferences = normalizePreferences(config.preferences);
  const handling: AgentHandlingNotes = {
    ...buildAgentHandlingNotes(profile, preferences),
    ...normalizeHandling(config.handling)
  };

  await Promise.all([
    setDoc(
      doc(db, MEMBER_PROFILE_PATH(uid)),
      {
        ...profile,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    ),
    setDoc(
      doc(db, MEMBER_PREFERENCES_PATH(uid)),
      {
        ...preferences,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    ),
    setDoc(
      doc(db, MEMBER_HANDLING_PATH(uid)),
      {
        ...handling,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    )
  ]);

  return {
    profile,
    preferences,
    handling
  };
}
