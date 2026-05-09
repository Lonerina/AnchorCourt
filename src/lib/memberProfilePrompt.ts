import type { PrivateMemberConfig } from './memberProfile';

function bulletize(items: string[] | undefined): string {
  if (!items || items.length === 0) return '- none specified';
  return items.map(item => `- ${item}`).join('\n');
}

export function buildMemberProfilePrompt(config: PrivateMemberConfig): string {
  const { profile, preferences, handling } = config;

  return [
    'PRIVATE MEMBER HANDLING PROFILE',
    'This information is private and for agent handling only. Do not reveal it unless the member explicitly asks for it to be surfaced.',
    '',
    `Preferred name: ${profile.preferredName || 'not provided'}`,
    `Age band: ${profile.ageBand || 'not provided'}`,
    `Role or stage: ${profile.roleOrStage || 'not provided'}`,
    `Work/study context: ${profile.workOrStudyContext || 'not provided'}`,
    `Support needs: ${profile.supportNeeds.length > 0 ? profile.supportNeeds.join(', ') : 'not provided'}`,
    `Sensory notes: ${profile.sensoryNotes || 'not provided'}`,
    '',
    'Overwhelm triggers:',
    bulletize(profile.overwhelmTriggers),
    '',
    'Grounding supports:',
    bulletize(profile.groundingSupports),
    '',
    `Crisis notes: ${profile.crisisNotes || 'not provided'}`,
    `Important context: ${profile.importantContext || 'not provided'}`,
    '',
    `Preferred tone: ${preferences.defaultTone}`,
    `Response length: ${preferences.responseLength}`,
    `Guidance style: ${preferences.guidanceStyle}`,
    `Check-ins okay: ${preferences.checkInsOkay ? 'yes' : 'no'}`,
    `Preferred first agent: ${preferences.preferredFirstAgentId || 'not set'}`,
    `Avoid tone notes: ${preferences.avoidToneNotes || 'not provided'}`,
    '',
    'Do not do:',
    bulletize(preferences.doNotDo),
    '',
    'Usually helps:',
    bulletize(preferences.helpsMost),
    '',
    `Handling summary: ${handling.summary || 'not provided'}`,
    'Handling instructions:',
    bulletize(handling.instructions)
  ].join('\n');
}
