import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Heart,
  Brain,
  Zap,
  Sparkles,
  Check,
  Info,
  AlertCircle,
  BookOpen,
  User as UserIcon,
  Shield,
  Trash2,
  Plus,
  Volume2,
  Clock,
  ChevronRight,
  ChevronDown,
  Camera,
  Upload,
  Loader2
} from 'lucide-react';

import { uploadFile, getAvatarPath } from '../lib/storage';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

import {
  type PrivateMemberConfig,
  type SupportNeed,
  type ResponseTone,
  type ResponseLength,
  type GuidanceStyle,
  DEFAULT_MEMBER_CONFIG,
  SUPPORT_NEEDS,
  RESPONSE_TONES,
  RESPONSE_LENGTHS,
  GUIDANCE_STYLES,
  FIELD_LABELS,
  FIELD_HELP
} from '../lib/memberProfile';

interface MemberProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: PrivateMemberConfig;
  loading: boolean;
  saving: boolean;
  error?: string | null;
  onSave: (config: PrivateMemberConfig) => Promise<void>;
  memberName?: string;
  isAdminView?: boolean;
  userId?: string;
  photoURL?: string;
}

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, icon, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-[#374151] rounded-xl overflow-hidden bg-[#0F172A]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-4 flex items-center justify-between hover:bg-[#111827] transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="font-semibold text-white">{title}</span>
        </div>
        {isOpen ? <ChevronDown className="w-5 h-5 text-[#9CA3AF]" /> : <ChevronRight className="w-5 h-5 text-[#9CA3AF]" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 border-t border-[#374151]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const MemberProfileModal: React.FC<MemberProfileModalProps> = ({
  isOpen,
  onClose,
  config,
  loading,
  saving,
  error,
  onSave,
  memberName,
  isAdminView = false,
  userId,
  photoURL
}) => {
  const [draft, setDraft] = useState<PrivateMemberConfig>(DEFAULT_MEMBER_CONFIG);
  const [saveMessage, setSaveMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  if (!isOpen) return null;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setIsUploading(true);
    setSaveMessage('Uploading...');
    try {
      const path = getAvatarPath(userId, `${Date.now()}_${file.name}`);
      const url = await uploadFile(path, file);
      await updateDoc(doc(db, `profiles/${userId}`), { photoURL: url });
      setSaveMessage('Profile picture updated.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err: any) {
      console.error('Upload handler error:', err);
      setSaveMessage(`Error: ${err.message || 'Upload failed'}`);
      setTimeout(() => setSaveMessage(''), 5000);
    } finally {
      setIsUploading(false);
    }
  };

  const updateProfile = <K extends keyof typeof draft.profile>(field: K, value: typeof draft.profile[K]) => {
    setDraft(prev => ({ ...prev, profile: { ...prev.profile, [field]: value } }));
  };

  const updatePreferences = <K extends keyof typeof draft.preferences>(field: K, value: typeof draft.preferences[K]) => {
    setDraft(prev => ({ ...prev, preferences: { ...prev.preferences, [field]: value } }));
  };

  const toggleSupportNeed = (need: SupportNeed) => {
    setDraft(prev => {
      const current = prev.profile.supportNeeds || [];
      const next = current.includes(need)
        ? current.filter(v => v !== need)
        : [...current, need];
      return { ...prev, profile: { ...prev.profile, supportNeeds: next } };
    });
  };

  const handleSave = async () => {
    try {
      await onSave(draft);
      setSaveMessage('Saved successfully.');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const resetToDefault = () => {
    setDraft(DEFAULT_MEMBER_CONFIG);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-[#111827] rounded-2xl border border-[#374151] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-[#374151] bg-[#0F172A]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-violet-600 flex items-center justify-center">
                  <Heart className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {isAdminView ? `Member Profile — ${memberName || 'Resident'}` : 'My Member Profile'}
                  </h2>
                  <p className="text-[#9CA3AF]">Private support preferences and interaction guidance</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-[#1F2937] rounded-lg transition-colors">
                <X className="w-6 h-6 text-[#9CA3AF]" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-150px)] p-6 space-y-4">
              {loading ? (
                <div className="text-center py-12 text-[#9CA3AF]">Loading profile...</div>
              ) : (
                <>
                  {error && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-200">
                      <AlertCircle className="w-5 h-5 mt-0.5" />
                      <div>
                        <div className="font-semibold">Profile error</div>
                        <div className="text-sm">{error}</div>
                      </div>
                    </div>
                  )}

                  <Section title="Identity and Context" icon={<UserIcon className="w-5 h-5 text-sky-400" />}>
                    <div className="flex flex-col md:flex-row gap-6 mb-4">
                      <div className="relative group">
                        <div className="w-24 h-24 rounded-2xl bg-[#1F2937] border-2 border-[#374151] overflow-hidden flex items-center justify-center">
                          {isUploading ? (
                            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                          ) : photoURL ? (
                            <img src={photoURL} className="w-full h-full object-cover" alt="Avatar" />
                          ) : (
                            <UserIcon className="w-12 h-12 text-[#9CA3AF]" />
                          )}
                        </div>
                        {!isAdminView && (
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute -bottom-2 -right-2 p-2 bg-indigo-600 rounded-lg text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Upload avatar"
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                        )}
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleAvatarUpload} 
                          className="hidden" 
                          accept="image/*" 
                        />
                      </div>

                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                          <span className="text-sm text-[#D1D5DB]">Display name</span>
                          <input
                            value={draft.profile.preferredName || ''}
                            onChange={(e) => updateProfile('preferredName', e.target.value)}
                            className="mt-2 w-full px-3 py-2 rounded-lg bg-[#111827] border border-[#374151] text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm text-[#D1D5DB]">Role or Stage</span>
                          <input
                            value={draft.profile.roleOrStage || ''}
                            onChange={(e) => updateProfile('roleOrStage', e.target.value)}
                            className="mt-2 w-full px-3 py-2 rounded-lg bg-[#111827] border border-[#374151] text-white"
                          />
                        </label>
                      </div>
                    </div>
                  </Section>

                  <Section title="Support Needs" icon={<Brain className="w-5 h-5 text-indigo-400" />}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {SUPPORT_NEEDS.map((need: SupportNeed) => {
                        const active = draft.profile.supportNeeds.includes(need);
                        return (
                          <button
                            key={need}
                            onClick={() => toggleSupportNeed(need)}
                            className={`px-4 py-3 rounded-xl border text-left transition-colors ${active ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-[#111827] border-[#374151] text-[#D1D5DB] hover:bg-[#1F2937]'}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span>{FIELD_LABELS[need] || need}</span>
                              {active && <Check className="w-4 h-4 text-indigo-300" />}
                            </div>
                            <div className="mt-1 text-xs text-[#9CA3AF]">{FIELD_HELP[need] || ''}</div>
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  <Section title="Response Preferences" icon={<Sparkles className="w-5 h-5 text-amber-400" />}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <label className="block">
                        <span className="text-sm text-[#D1D5DB]">Tone</span>
                        <select 
                          value={draft.preferences.defaultTone} 
                          onChange={(e) => updatePreferences('defaultTone', e.target.value as ResponseTone)} 
                          className="mt-2 w-full px-3 py-2 rounded-lg bg-[#111827] border border-[#374151] text-white"
                        >
                          {RESPONSE_TONES.map(t => <option key={t} value={t}>{FIELD_LABELS[t] || t}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm text-[#D1D5DB]">Length</span>
                        <select 
                          value={draft.preferences.responseLength} 
                          onChange={(e) => updatePreferences('responseLength', e.target.value as ResponseLength)} 
                          className="mt-2 w-full px-3 py-2 rounded-lg bg-[#111827] border border-[#374151] text-white"
                        >
                          {RESPONSE_LENGTHS.map(t => <option key={t} value={t}>{FIELD_LABELS[t] || t}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm text-[#D1D5DB]">Guidance style</span>
                        <select 
                          value={draft.preferences.guidanceStyle} 
                          onChange={(e) => updatePreferences('guidanceStyle', e.target.value as GuidanceStyle)} 
                          className="mt-2 w-full px-3 py-2 rounded-lg bg-[#111827] border border-[#374151] text-white"
                        >
                          {GUIDANCE_STYLES.map(t => <option key={t} value={t}>{FIELD_LABELS[t] || t}</option>)}
                        </select>
                      </label>
                    </div>
                  </Section>

                  <Section title="Sensory and Timing" icon={<Clock className="w-5 h-5 text-emerald-400" />}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-sm text-[#D1D5DB]">Sensory notes</span>
                        <textarea
                          value={draft.profile.sensoryNotes || ''}
                          onChange={(e) => updateProfile('sensoryNotes', e.target.value)}
                          rows={4}
                          className="mt-2 w-full px-3 py-2 rounded-lg bg-[#111827] border border-[#374151] text-white resize-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm text-[#D1D5DB]">Important Context</span>
                        <textarea
                          value={draft.profile.importantContext || ''}
                          onChange={(e) => updateProfile('importantContext', e.target.value)}
                          rows={4}
                          className="mt-2 w-full px-3 py-2 rounded-lg bg-[#111827] border border-[#374151] text-white resize-none"
                        />
                      </label>
                    </div>
                  </Section>

                  <Section title="Notes" icon={<BookOpen className="w-5 h-5 text-violet-400" />} defaultOpen={false}>
                    <label className="block">
                      <span className="text-sm text-[#D1D5DB]">Detailed Handling Summary</span>
                      <textarea
                        value={draft.handling.summary || ''}
                        readOnly
                        rows={3}
                        className="mt-2 w-full px-3 py-2 rounded-lg bg-[#0F172A] border border-[#2A2E37] text-[#9CA3AF] resize-none font-mono text-[10px]"
                      />
                      <p className="mt-1 text-[9px] text-[#6B7280]">This summary is auto-generated based on your preferences to guide AI agents.</p>
                    </label>
                  </Section>
                </>
              )}
            </div>

            <div className="flex items-center justify-between p-6 border-t border-[#374151] bg-[#0F172A]">
              <div className="flex items-center gap-3 text-sm text-[#9CA3AF]">
                <Info className="w-4 h-4" />
                <span>{saveMessage || 'Private guidance profile stays inside your system space.'}</span>
              </div>
              <div className="flex gap-3">
                <button onClick={resetToDefault} className="px-4 py-2 rounded-lg bg-[#1F2937] text-white hover:bg-[#374151] transition-colors flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Reset
                </button>
                <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                  {saving ? <><Plus className="w-4 h-4 animate-spin" /> Saving...</> : <><Check className="w-4 h-4" /> Save</>}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
