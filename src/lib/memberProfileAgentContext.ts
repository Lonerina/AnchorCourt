import type { PrivateMemberConfig } from './memberProfile';
import { buildMemberProfilePrompt } from './memberProfilePrompt';

export function applyMemberProfileToInstruction(baseInstruction: string, memberConfig: PrivateMemberConfig): string {
  const profileBlock = buildMemberProfilePrompt(memberConfig).trim();
  const trimmedBase = baseInstruction.trim();

  if (!profileBlock) {
    return trimmedBase;
  }

  return [trimmedBase, profileBlock].filter(Boolean).join('\n\n');
}
