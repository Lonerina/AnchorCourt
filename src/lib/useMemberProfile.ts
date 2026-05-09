import { useCallback, useEffect, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import {
  DEFAULT_MEMBER_CONFIG,
  type PrivateMemberConfig
} from './memberProfile';
import { loadPrivateMemberConfig, savePrivateMemberConfig } from './memberProfileStore';

interface UseMemberProfileResult {
  memberConfig: PrivateMemberConfig;
  memberConfigLoading: boolean;
  memberConfigSaving: boolean;
  memberConfigError: string | null;
  reloadMemberConfig: () => Promise<void>;
  saveMemberConfig: (nextConfig: PrivateMemberConfig) => Promise<void>;
}

export function useMemberProfile(
  db: Firestore,
  uid: string | null | undefined
): UseMemberProfileResult {
  const [memberConfig, setMemberConfig] = useState<PrivateMemberConfig>(DEFAULT_MEMBER_CONFIG);
  const [memberConfigLoading, setMemberConfigLoading] = useState(false);
  const [memberConfigSaving, setMemberConfigSaving] = useState(false);
  const [memberConfigError, setMemberConfigError] = useState<string | null>(null);

  const reloadMemberConfig = useCallback(async () => {
    if (!uid) {
      setMemberConfig(DEFAULT_MEMBER_CONFIG);
      setMemberConfigError(null);
      return;
    }

    setMemberConfigLoading(true);
    setMemberConfigError(null);
    try {
      const loaded = await loadPrivateMemberConfig(db, uid);
      setMemberConfig(loaded);
    } catch (error) {
      console.error('Failed to load member profile config:', error);
      setMemberConfigError('Failed to load private member profile.');
    } finally {
      setMemberConfigLoading(false);
    }
  }, [db, uid]);

  const saveMemberConfig = useCallback(async (nextConfig: PrivateMemberConfig) => {
    if (!uid) return;

    setMemberConfigSaving(true);
    setMemberConfigError(null);
    try {
      const saved = await savePrivateMemberConfig(db, uid, nextConfig);
      setMemberConfig(saved);
    } catch (error) {
      console.error('Failed to save member profile config:', error);
      setMemberConfigError('Failed to save private member profile.');
      throw error;
    } finally {
      setMemberConfigSaving(false);
    }
  }, [db, uid]);

  useEffect(() => {
    void reloadMemberConfig();
  }, [reloadMemberConfig]);

  return {
    memberConfig,
    memberConfigLoading,
    memberConfigSaving,
    memberConfigError,
    reloadMemberConfig,
    saveMemberConfig
  };
}
