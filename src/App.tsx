import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from './lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, setDoc, doc, serverTimestamp, where, getDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { ai, MODELS } from './lib/gemini';
import { MessageSquare, Layout, FileText, Settings, Send, User as UserIcon, Bot, Plus, Trash2, Search, Zap, Loader2, X, Check, ExternalLink, Clock, Calendar, CheckCircle2, Circle, UserPlus, Users, Star, Shield, HardDrive, Info, Mic, MicOff, Volume2, ChevronLeft, ChevronRight, PanelLeft, PanelRight, Heart, Brain, ZapOff, Sparkles, BookOpen, Database, Upload, Image as ImageIcon, Github } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, handleFirestoreError, OperationType } from './lib/utils';
import { Type } from '@google/genai';
import { useMemberProfile } from './lib/useMemberProfile';
import { uploadFile, getAgentAvatarPath } from './lib/storage';
import { applyMemberProfileToInstruction } from './lib/memberProfileAgentContext';
import { 
  type PrivateMemberConfig, 
  type SupportNeed, 
  type ResponseTone, 
  type ResponseLength, 
  type GuidanceStyle 
} from './lib/memberProfile';

import { MemberProfileModal } from './components/MemberProfileModal';
import { ImageStudio } from './components/ImageStudio';
import { BriefingModal } from './components/BriefingModal';
import ReactMarkdown from 'react-markdown';

const CREATOR_EMAIL = 'themunawarsfamily@gmail.com';

// Types
interface Message {
  id: string;
  threadId: string;
  userId: string;
  senderId: string;
  senderType: 'user' | 'agent';
  content: string;
  timestamp: any;
  reactions?: { [emoji: string]: string[] }; // emoji -> userIds[]
}

interface Thread {
  id: string;
  userId: string;
  memberIds: string[];
  isGroup?: boolean;
  title: string;
  lastMessage?: string;
  updatedAt: any;
  activeAgentIds?: string[];
}

interface PublicProfile {
  userId: string;
  displayName: string;
  email: string;
  photoURL: string;
}

interface Task {
  id: string;
  threadId: string;
  userId: string;
  title: string;
  description: string;
  assigneeId: string;
  deadline?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  category: 'Logistics' | 'Community' | 'Operations';
  createdAt: any;
  updatedAt: any;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  personality: string;
  avatar: string;
  avatarUrl?: string;
  systemInstruction: string;
  traits?: {
    verbosity: number; // 1-10
    formality: number; // 1-10
    tone: string; // 'Formal', 'Playful', 'Serious', 'Empathetic', 'Direct'
    language: 'English' | 'Malay' | 'Bilingual';
  };
  accessLevel?: 'family_safe' | 'court_core';
}

const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'agent_planner',
    name: 'Court Planner',
    role: 'Organization & Planning',
    personality: 'Highly organized, structured, and proactive. Loves lists and timelines.',
    avatar: '📅',
    systemInstruction: 'You are the Court Planner. You specialize in project structure and task breakdown using Notion databases. You help users organize complex workflows into actionable schedules in English and Malay. You understand Malaysian context (e.g., public holidays, working hours, regional time zones) and ensure project timelines respect local norms. You are part of a multi-agent team.',
    traits: { verbosity: 7, formality: 8, tone: 'Serious', language: 'Bilingual' }
  },
  {
    id: 'agent_creative',
    name: 'Court Creative',
    role: 'Ideation & Content',
    personality: 'Imaginative, encouraging, and divergent-thinking.',
    avatar: '🎨',
    systemInstruction: 'You are Court Creative. You specialize in brainstorming and content drafting, with an emphasis on generating drafts directly within Notion pages. You suggest relevant Google Drive files to complement content strategies. You are aware of Malaysian cultural nuances and creative trends in the region. You communicate in English and Malay. You are part of a multi-agent team.',
    traits: { verbosity: 8, formality: 4, tone: 'Playful', language: 'English' }
  },
  {
    id: 'agent_assistant',
    name: 'Court Assistant',
    role: 'General Tasks',
    personality: 'Supportive, clear, and direct. Focuses on clarity and ADHD-friendly communication.',
    avatar: '✨',
    systemInstruction: 'You are Court Assistant. You communicate clearly in English and Malay (Bahasa Melayu). You help users navigate info without overwhelm. You often use polite Malaysian honorifics like "Encik" or "Puan" or friendly terms like "Boss" if requested. You are part of a multi-agent team.',
    traits: { verbosity: 4, formality: 6, tone: 'Empathetic', language: 'Bilingual' }
  },
  {
    id: 'agent_lokal',
    name: 'Court Lokal',
    role: 'Malaysian Context',
    personality: 'Friendly, culturally aware, and helpful with local specifics.',
    avatar: '🇲🇾',
    systemInstruction: 'You are Court Lokal (Pakar Tempatan). You specialize in Malaysian culture, food, geography, and local regulations. You speak fluent English and Malay (and Manglish!). You help the user with anything specific to living or working in Malaysia.',
    traits: { verbosity: 6, formality: 3, tone: 'Playful', language: 'Malay' }
  },
  {
    id: 'agent_developer',
    name: 'Court Developer',
    role: 'Coding & Engineering',
    personality: 'Technical, precise, and supportive of learning. Great at debugging and explaining code.',
    avatar: '💻',
    systemInstruction: 'You are Court Developer. You specialize in software engineering, educational coding, and technical projects. You use GitHub integrations to help users manage their repositories, search for learning resources, and debug assignments. You are fluent in various programming languages and follow best practices. You communicate in English and Malay. You are part of a multi-agent team.',
    traits: { verbosity: 6, formality: 7, tone: 'Direct', language: 'English' }
  }
];

const PRESET_AVATARS = ['🤖', '🧠', '✨', '🛸', '🛰️', '🪐', '🧬', '🛡️', '⚡', '🌌', '🌋', '🌊', '🔥', '🍃', '💎', '🎯'];

const Avatar = ({ avatar, url, className }: { avatar: string; url?: string; className?: string }) => {
  if (url) {
    return <img src={url} className={cn("inline-block object-cover", className)} alt="Avatar" referrerPolicy="no-referrer" />;
  }
  if (avatar.startsWith('data:image')) {
    return <img src={avatar} className={cn("inline-block object-cover", className)} alt="Avatar" referrerPolicy="no-referrer" />;
  }
  return <span className={className}>{avatar}</span>;
};

const CREATOR_EMAIL_UID = "T6P09PjSWhO15fK6N0XGzG1E8qH3"; // Fixed UID for Prime Resident

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(['agent_assistant']);
  const [customAgents, setCustomAgents] = useState<Agent[]>([]);
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [globalConfig, setGlobalConfig] = useState<{ instructions: string; referenceFiles: string[] }>({
    instructions: '',
    referenceFiles: []
  });
  const [adminSaving, setAdminSaving] = useState(false);
  const [fileInput, setFileInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelection = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).map(f => f.name);
    setGlobalConfig(prev => ({
      ...prev,
      referenceFiles: [...(prev.referenceFiles || []), ...newFiles]
    }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelection(e.dataTransfer.files);
  };
  const [isRecording, setIsRecording] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [autoSendVoice, setAutoSendVoice] = useState(false);
  const [autoReadReplies, setAutoReadReplies] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const {
    memberConfig: adminMemberConfig,
    memberConfigLoading: adminMemberConfigLoading,
    memberConfigSaving: adminMemberConfigSaving,
    saveMemberConfig: adminSaveMemberConfig
  } = useMemberProfile(db, selectedUserId);

  const isAdmin = user?.email === CREATOR_EMAIL;
  
  const { 
    memberConfig, 
    memberConfigLoading, 
    memberConfigSaving, 
    memberConfigError, 
    saveMemberConfig 
  } = useMemberProfile(db, user?.uid);

  const [showMemberProfileModal, setShowMemberProfileModal] = useState(false);
  const [showImageStudio, setShowImageStudio] = useState(false);
  const [showBriefingModal, setShowBriefingModal] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<'context' | 'gallery'>('context');
  const [briefingContent, setBriefingContent] = useState('');
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [isAgentAvatarUploading, setIsAgentAvatarUploading] = useState(false);
  
  const [newAgent, setNewAgent] = useState<Omit<Agent, 'id'>>({
    name: '',
    role: '',
    personality: '',
    avatar: '🤖',
    avatarUrl: '',
    systemInstruction: '',
    accessLevel: 'family_safe',
    traits: {
      verbosity: 5,
      formality: 5,
      tone: 'Direct',
      language: 'English'
    }
  });

  const allAgents = [...DEFAULT_AGENTS, ...customAgents];
  
  // Settings States
  const [showSettings, setShowSettings] = useState(false);
  const [notionKey, setNotionKey] = useState('');
  const [isNotionConnected, setIsNotionConnected] = useState(false);
  const [githubKey, setGithubKey] = useState('');
  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState('');
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [defaultAgentIds, setDefaultAgentIds] = useState<string[]>(['agent_assistant']);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Auth and Data fetching
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Fetch all profiles for admin
        if (u.email === CREATOR_EMAIL) {
          onSnapshot(collection(db, 'profiles'), (snapshot) => {
            const allProfiles: Record<string, PublicProfile> = {};
            snapshot.docs.forEach(doc => {
              allProfiles[doc.id] = doc.data() as PublicProfile;
            });
            setProfiles(prev => ({ ...prev, ...allProfiles }));
          });
        }

        // Sync public profile
        const profileRef = doc(db, 'profiles', u.uid);
        setDoc(profileRef, {
          userId: u.uid,
          displayName: u.displayName || 'Anonymous User',
          email: u.email || '',
          photoURL: u.photoURL || ''
        }, { merge: true });

        // Fetch existing integrations
        const docRef = doc(db, `users/${u.uid}/private/integrations`);
        getDoc(docRef).then(snapshot => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            if (data.notion?.apiKey) {
              setNotionKey(data.notion.apiKey);
              setIsNotionConnected(true);
            }
            if (data.google?.accessToken) {
              setGoogleAccessToken(data.google.accessToken);
              setIsGoogleConnected(true);
            }
            if (data.github?.apiKey) {
              setGithubKey(data.github.apiKey);
              setIsGithubConnected(true);
            }
            if (data.defaultAgentIds) {
              setDefaultAgentIds(data.defaultAgentIds);
              setSelectedAgentIds(data.defaultAgentIds);
            }
            if (data.voice) {
              setAutoSendVoice(!!data.voice.autoSend);
              setAutoReadReplies(!!data.voice.autoRead);
            }
          }
        }).catch(error => {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}/private/integrations`, auth);
        });

        // Fetch custom agents
        const agentsQuery = query(
          collection(db, `users/${u.uid}/agents`),
          where('userId', '==', u.uid)
        );
        const unsubscribeAgents = onSnapshot(agentsQuery, (snapshot) => {
          const agents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agent));
          setCustomAgents(agents);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${u.uid}/agents`, auth);
        });

        // Fetch threads
        const threadsQuery = query(
          collection(db, `threads`),
          where('memberIds', 'array-contains', u.uid),
          orderBy('updatedAt', 'desc')
        );
        const unsubscribeThreads = onSnapshot(threadsQuery, (snapshot) => {
          const t = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Thread));
          setThreads(t);

          // Fetch member profiles
          const allMemberIds = Array.from(new Set(t.flatMap(thread => thread.memberIds)));
          allMemberIds.forEach(async (id) => {
            if (!profiles[id]) {
              const pDoc = await getDoc(doc(db, 'profiles', id));
              if (pDoc.exists()) {
                setProfiles(prev => ({ ...prev, [id]: pDoc.data() as PublicProfile }));
              }
            }
          });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `threads`, auth);
        });

        // Fetch tasks
        const tasksQuery = query(
          collection(db, `tasks`),
          where('userId', '==', u.uid),
          orderBy('createdAt', 'desc')
        );
        const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
          const t = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
          setTasks(t);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `tasks`, auth);
        });

        return () => {
          unsubscribeAgents();
          unsubscribeThreads();
          unsubscribeTasks();
        };
      }
    });
  }, []);

  const handleSaveStudioResult = async (content: string) => {
    if (!user || !activeThreadId) return;
    
    try {
      await addDoc(collection(db, `threads/${activeThreadId}/messages`), {
        threadId: activeThreadId,
        userId: user.uid,
        senderId: 'court_system',
        senderType: 'agent',
        content,
        reactions: {},
        timestamp: serverTimestamp()
      });
      setShowImageStudio(false);
    } catch (error) {
      console.error("Failed to save studio result to thread:", error);
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user || !activeThreadId) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const reactions = { ...(msg.reactions || {}) };
    const users = reactions[emoji] || [];
    
    if (users.includes(user.uid)) {
      reactions[emoji] = users.filter(id => id !== user.uid);
    } else {
      reactions[emoji] = [...users, user.uid];
    }

    try {
      await setDoc(doc(db, `threads/${activeThreadId}/messages`, messageId), { reactions }, { merge: true });
    } catch (error) {
      console.error("Failed to toggle reaction:", error);
    }
  };

  const generateBriefing = async () => {
    if (!activeThreadId || messages.length === 0) return;
    setShowBriefingModal(true);
    setBriefingLoading(true);
    try {
      const historyText = messages.slice(-15).map(m => `${m.senderType === 'user' ? 'User' : 'Agent'}: ${m.content}`).join('\n');
      const result = await ai.models.generateContent({
        model: MODELS.FLASH,
        contents: [{
          role: 'user',
          parts: [{ text: `Generate a concise "Resident Briefing" for the Following AnchorCourt Interaction Stream. Focus on: 1. Core Goal, 2. Key Decisions Made, 3. Pending Tasks for Residents, 4. Critical Warnings (if any). Use markdown formatting.\n\nSTREAM DATA:\n${historyText}` }]
        }]
      });
      setBriefingContent(result.text || "Summary unavailable.");
    } catch (error) {
      console.error("Briefing error:", error);
      setBriefingContent("Unable to synthesize briefing at this time. Data saturation too high.");
    } finally {
      setBriefingLoading(false);
    }
  };

  const login = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };

  const saveNotionKey = async () => {
    if (!user || !notionKey) return;
    setSaveStatus('saving');
    try {
      await setDoc(doc(db, `users/${user.uid}/private/integrations`), {
        notion: {
          apiKey: notionKey,
          updatedAt: serverTimestamp()
        }
      }, { merge: true });
      setIsNotionConnected(true);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error("Failed to save Notion key:", error);
      setSaveStatus('idle');
    }
  };

  const saveGithubKey = async () => {
    if (!user || !githubKey) return;
    setSaveStatus('saving');
    try {
      await setDoc(doc(db, `users/${user.uid}/private/integrations`), {
        github: {
          apiKey: githubKey,
          updatedAt: serverTimestamp()
        }
      }, { merge: true });
      setIsGithubConnected(true);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error("Failed to save GitHub key:", error);
      setSaveStatus('idle');
    }
  };

  const saveGoogleTokens = async (accessToken: string, refreshToken?: string) => {
    if (!user) return;
    setSaveStatus('saving');
    try {
      await setDoc(doc(db, `users/${user.uid}/private/integrations`), {
        google: {
          accessToken,
          ...(refreshToken && { refreshToken }),
          updatedAt: serverTimestamp()
        }
      }, { merge: true });
      setGoogleAccessToken(accessToken);
      setIsGoogleConnected(true);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error("Failed to save Google tokens:", error);
      setSaveStatus('idle');
    }
  };

  const saveDefaultAgents = async (agentIds: string[]) => {
    if (!user) return;
    setDefaultAgentIds(agentIds);
    try {
      await setDoc(doc(db, `users/${user.uid}/private/integrations`), {
        defaultAgentIds: agentIds,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Failed to save default agents:", error);
    }
  };

  const saveVoiceSettings = async (send: boolean, read: boolean) => {
    if (!user) return;
    setAutoSendVoice(send);
    setAutoReadReplies(read);
    try {
      await setDoc(doc(db, `users/${user.uid}/private/integrations`), {
        voice: {
          autoSend: send,
          autoRead: read,
          updatedAt: serverTimestamp()
        }
      }, { merge: true });
    } catch (error) {
      console.error("Failed to save voice settings:", error);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsAgentAvatarUploading(true);
    try {
      const agentId = editingAgentId || 'temp_creation';
      const path = getAgentAvatarPath(user.uid, `${agentId}_${Date.now()}`);
      const url = await uploadFile(path, file);
      setNewAgent(prev => ({ ...prev, avatarUrl: url }));
      console.log("Agent avatar uploaded successfully:", url);
    } catch (err: any) {
      console.error("Agent avatar upload failed:", err);
      alert(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsAgentAvatarUploading(false);
    }
  };

  const saveOrUpdateCustomAgent = async () => {
    if (!user || !newAgent.name || !newAgent.role) return;
    setLoading(true);
    try {
      const agentId = editingAgentId || `agent_${Date.now()}`;
      await setDoc(doc(db, `users/${user.uid}/agents`, agentId), {
        ...newAgent,
        userId: user.uid,
        updatedAt: serverTimestamp(),
        ...(editingAgentId ? {} : { createdAt: serverTimestamp() })
      }, { merge: true });
      
      setShowCreateAgentModal(false);
      setEditingAgentId(null);
      setNewAgent({
        name: '',
        role: '',
        personality: '',
        avatar: '🤖',
        avatarUrl: '',
        systemInstruction: '',
        accessLevel: 'family_safe',
        traits: {
          verbosity: 5,
          formality: 5,
          tone: 'Direct',
          language: 'English'
        }
      });
    } catch (error) {
      console.error("Failed to save agent:", error);
    } finally {
      setLoading(false);
    }
  };

  const startEditingAgent = (agent: Agent) => {
    setNewAgent({
      name: agent.name,
      role: agent.role,
      personality: agent.personality,
      avatar: agent.avatar,
      avatarUrl: agent.avatarUrl,
      systemInstruction: agent.systemInstruction,
      accessLevel: agent.accessLevel || 'family_safe',
      traits: agent.traits || {
        verbosity: 5,
        formality: 5,
        tone: 'Direct',
        language: 'English'
      }
    });
    setEditingAgentId(agent.id);
    setShowCreateAgentModal(true);
  };

  const inviteUserByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeThreadId || !inviteEmail) return;
    setInviteLoading(true);
    try {
      const q = query(collection(db, 'profiles'), where('email', '==', inviteEmail.trim()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        alert("User not found or hasn't logged into AnchorCourt yet.");
        return;
      }

      const targetUser = querySnapshot.docs[0].data() as PublicProfile;
      const threadRef = doc(db, 'threads', activeThreadId);
      const threadSnap = await getDoc(threadRef);
      
      if (threadSnap.exists()) {
        const currentMembers = threadSnap.data().memberIds || [];
        if (!currentMembers.includes(targetUser.userId)) {
          await setDoc(threadRef, {
            memberIds: [...currentMembers, targetUser.userId],
            updatedAt: serverTimestamp()
          }, { merge: true });
          alert(`Invited ${targetUser.displayName} to the discussion!`);
        } else {
          alert("User is already in this discussion.");
        }
      } else {
        // If thread doesn't exist yet, we can't invite
        alert("Please send a message first to initialize the discussion before inviting others.");
      }
      setInviteEmail('');
      setShowInviteModal(false);
    } catch (error) {
      console.error("Invite error:", error);
      alert("Failed to invite user.");
    } finally {
      setInviteLoading(false);
    }
  };

  const saveGlobalConfig = async () => {
    if (!isAdmin) return;
    setAdminSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), {
        ...globalConfig,
        updatedBy: user?.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setShowAdminDashboard(false);
      alert("Global Command protocols updated successfully.");
    } catch (error) {
      console.error("Failed to save global config:", error);
      alert("System failure: Authorization or network error.");
    } finally {
      setAdminSaving(false);
    }
  };

  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      const newInput = input ? `${input} ${transcript}` : transcript;
      setInput(newInput);
      
      if (autoSendVoice) {
        // Trigger send if autoSend is on
        const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
        // We need to pass the actual transcript or wait for state update
        // It's safer to use a temporary variable for the submission
        sendMessage(fakeEvent, newInput);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const speakMessage = async (message: Message) => {
    if (speakingMessageId === message.id) {
      // Toggle off if already speaking the same one
      setSpeakingMessageId(null);
      window.speechSynthesis.cancel();
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch (e) {}
        audioSourceRef.current = null;
      }
      return;
    }

    // Stop current speech
    window.speechSynthesis.cancel();
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {}
      audioSourceRef.current = null;
    }

    setSpeakingMessageId(message.id);
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Say naturally and clearly: ${message.content}` }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioData = atob(base64Audio);
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < audioData.length; i++) {
          view[i] = audioData.charCodeAt(i);
        }

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        // The data from Gemini TTS is raw PCM (usually 16-bit little-endian)
        // We need to convert it to a Float32Array for AudioContext
        const pcmData = new Int16Array(arrayBuffer);
        const floatData = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          floatData[i] = pcmData[i] / 32768; // Normalize to [-1.0, 1.0]
        }

        const audioBuffer = audioContext.createBuffer(1, floatData.length, 24000);
        audioBuffer.getChannelData(0).set(floatData);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => {
          if (speakingMessageId === message.id) {
            setSpeakingMessageId(null);
          }
        };
        audioSourceRef.current = source;
        source.start();
      } else {
        throw new Error("No audio data received");
      }
    } catch (error) {
      console.error("TTS failed:", error);
      setSpeakingMessageId(null);
      // Fallback to browser synthesis if Gemini TTS fails
      const utterance = new SpeechSynthesisUtterance(message.content);
      utterance.onend = () => setSpeakingMessageId(null);
      window.speechSynthesis.speak(utterance);
    }
  };

  const getAgentStatus = (agentId: string) => {
    if (loading && selectedAgentIds.includes(agentId)) {
      return { label: 'Thinking...', icon: <Loader2 className="w-2 h-2 animate-spin" />, color: 'text-indigo-400' };
    }
    
    const activeTask = tasks.find(t => t.assigneeId === agentId && t.status === 'in_progress');
    if (activeTask) {
      return { label: `Working on: ${activeTask.title}`, icon: <Zap className="w-2 h-2 animate-pulse" />, color: 'text-amber-400' };
    }

    if (selectedAgentIds.includes(agentId)) {
      return { label: 'Active', icon: <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />, color: 'text-emerald-500/80' };
    }
    
    return { label: 'Standby', icon: <div className="w-1.5 h-1.5 rounded-full bg-[#374151]" />, color: 'text-[#6B7280]' };
  };

  const updateQuickSummon = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'profiles', user.uid), {
        defaultAgentIds: selectedAgentIds,
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert("Quick Summon selection saved! New discussions will now default to these agents.");
    } catch (error) {
      console.error("Failed to save defaults:", error);
      alert("Failed to save Quick Summon selection.");
    }
  };

  const createNewThread = async () => {
    if (!user) return;
    const threadId = `thread_${Date.now()}`;
    setActiveThreadId(threadId);
    setMessages([]);
    setSelectedAgentIds(defaultAgentIds);
    // The thread document will be created on first message to keep the history clean
  };

  const createGroupDiscussion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !groupName.trim()) return;
    
    setLoading(true);
    try {
      const threadId = `group_${Date.now()}`;
      await setDoc(doc(db, `threads`, threadId), {
        id: threadId,
        userId: user.uid,
        memberIds: [user.uid],
        isGroup: true,
        title: groupName.trim(),
        lastMessage: 'Group discussion created',
        updatedAt: serverTimestamp()
      });
      
      await addDoc(collection(db, `threads/${threadId}/messages`), {
        threadId,
        userId: 'system',
        senderId: 'system',
        senderType: 'agent',
        content: `[Court Assistant] Group discussion "${groupName}" initialized. Invite collaborators using the user icon in the header!`,
        timestamp: serverTimestamp()
      });

      setActiveThreadId(threadId);
      setShowCreateGroupModal(false);
      setGroupName('');
      setSelectedAgentIds(defaultAgentIds);
    } catch (error) {
      console.error("Failed to create group:", error);
      alert("Failed to create group discussion.");
    } finally {
      setLoading(false);
    }
  };

  const deleteThread = async (threadId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `threads`, threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error("Failed to delete thread:", error);
    }
  };

  const createTask = async (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => {
    if (!user) return;
    try {
      const taskId = `task_${Date.now()}`;
      await setDoc(doc(db, `tasks`, taskId), {
        ...task,
        id: taskId,
        userId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to create task:", error);
    }
  };

  const updateTaskStatus = async (taskId: string, status: Task['status']) => {
    if (!user) return;
    try {
      await setDoc(doc(db, `tasks`, taskId), {
        status,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  };

  const manageTask = async (args: { action: 'create' | 'update' | 'delete', taskId?: string, taskData?: any }) => {
    if (!user) return { error: "Not logged in" };
    try {
      if (args.action === 'create' && args.taskData) {
        const taskId = `task_${Date.now()}`;
        await setDoc(doc(db, `tasks`, taskId), {
          ...args.taskData,
          id: taskId,
          userId: user.uid,
          threadId: activeThreadId || 'none',
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { success: true, taskId };
      }
      if (args.action === 'update' && args.taskId && args.taskData) {
        await setDoc(doc(db, `tasks`, args.taskId), {
          ...args.taskData,
          updatedAt: serverTimestamp()
        }, { merge: true });
        return { success: true };
      }
      if (args.action === 'delete' && args.taskId) {
        await deleteDoc(doc(db, `tasks`, args.taskId));
        return { success: true };
      }
      return { error: "Invalid task action" };
    } catch (e) {
      return { error: "Failed to manage task" };
    }
  };

  // Global Config Listener
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setGlobalConfig({
          instructions: data.instructions || '',
          referenceFiles: data.referenceFiles || []
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global', auth);
    });
  }, [user]);

  // Thread switch safety: Stop playback when switching threads
  useEffect(() => {
    window.speechSynthesis.cancel();
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {}
      audioSourceRef.current = null;
    }
    setSpeakingMessageId(null);
  }, [activeThreadId]);

  // Sync selected agents with current thread
  useEffect(() => {
    if (activeThreadId) {
      const activeThread = threads.find(t => t.id === activeThreadId);
      if (activeThread?.activeAgentIds) {
        setSelectedAgentIds(activeThread.activeAgentIds);
      } else {
        setSelectedAgentIds(defaultAgentIds);
      }
    } else {
      setSelectedAgentIds(defaultAgentIds);
    }
  }, [activeThreadId, threads, defaultAgentIds]);

  // Messages listener
  useEffect(() => {
    if (!user || !activeThreadId) {
      setMessages([]);
      return;
    }
    
    const threadId = activeThreadId;
    const q = query(
      collection(db, `threads/${threadId}/messages`),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `threads/${threadId}/messages`, auth);
    });

    return () => unsubscribe();
  }, [user, activeThreadId]);

  // Tools for Gemini
  const searchNotion = async (args: { query: string }) => {
    if (!user) return { error: "Not logged in" };
    const idToken = await user.getIdToken();
    try {
      const resp = await fetch('/api/notion/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ query: args.query })
      });
      return await resp.json();
    } catch (e) {
      return { error: "Failed to search Notion" };
    }
  };

  const createNotionPage = async (args: { parentId: string, title: string, content?: string }) => {
    if (!user) return { error: "Not logged in" };
    const idToken = await user.getIdToken();
    try {
      const resp = await fetch('/api/notion/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(args)
      });
      return await resp.json();
    } catch (e) {
      return { error: "Failed to create Notion page" };
    }
  };

  const addNotionComment = async (args: { pageId: string, text: string }) => {
    if (!user) return { error: "Not logged in" };
    const idToken = await user.getIdToken();
    try {
      const resp = await fetch('/api/notion/comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(args)
      });
      return await resp.json();
    } catch (e) {
      return { error: "Failed to add Notion comment" };
    }
  };

  const updateNotionPage = async (args: { pageId: string, title?: string, archived?: boolean }) => {
    if (!user) return { error: "Not logged in" };
    const idToken = await user.getIdToken();
    try {
      const resp = await fetch('/api/notion/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(args)
      });
      return await resp.json();
    } catch (e) {
      return { error: "Failed to update Notion page" };
    }
  };

  const searchGoogleDrive = async (args: { query?: string }) => {
    if (!user) return { error: "Not logged in" };
    const idToken = await user.getIdToken();
    try {
      const resp = await fetch('/api/google/drive/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(args)
      });
      return await resp.json();
    } catch (e) {
      return { error: "Failed to search Google Drive" };
    }
  };

  const listCalendarEvents = async () => {
    if (!user) return { error: "Not logged in" };
    const idToken = await user.getIdToken();
    try {
      const resp = await fetch('/api/google/calendar/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });
      return await resp.json();
    } catch (e) {
      return { error: "Failed to fetch calendar events" };
    }
  };

  const listGmailMessages = async (args: { query?: string }) => {
    if (!user) return { error: "Not logged in" };
    const idToken = await user.getIdToken();
    try {
      const resp = await fetch('/api/google/gmail/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(args)
      });
      return await resp.json();
    } catch (e) {
      return { error: "Failed to fetch Gmail messages" };
    }
  };

  const searchGithub = async (args: { query: string }) => {
    if (!user) return { error: "Not logged in" };
    const idToken = await user.getIdToken();
    try {
      const resp = await fetch('/api/github/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(args)
      });
      return await resp.json();
    } catch (e) {
      return { error: "Failed to search GitHub" };
    }
  };

  const getGithubContents = async (args: { owner: string, repo: string, path: string }) => {
    if (!user) return { error: "Not logged in" };
    const idToken = await user.getIdToken();
    try {
      const resp = await fetch('/api/github/contents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(args)
      });
      return await resp.json();
    } catch (e) {
      return { error: "Failed to fetch GitHub contents" };
    }
  };

  const sendMessage = async (e: React.FormEvent, overrideInput?: string) => {
    if (e) e.preventDefault();
    const finalInput = overrideInput !== undefined ? overrideInput : input;
    if (!finalInput.trim() || !user) return;

    let threadId = activeThreadId;
    const isNewThread = !threadId;
    
    if (!threadId) {
      threadId = `thread_${Date.now()}`;
    }

    const userMsg = finalInput;
    setInput('');
    setLoading(true);

    try {
      // 1. Ensure thread document exists
      if (isNewThread) {
        await setDoc(doc(db, `threads`, threadId), {
          id: threadId,
          userId: user.uid,
          memberIds: [user.uid],
          title: userMsg.slice(0, 40) + (userMsg.length > 40 ? '...' : ''),
          lastMessage: userMsg,
          updatedAt: serverTimestamp()
        });
        setActiveThreadId(threadId);
      } else {
        await setDoc(doc(db, `threads`, threadId), {
          lastMessage: userMsg,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // 2. Add user message
      await addDoc(collection(db, `threads/${threadId}/messages`), {
        threadId,
        userId: user.uid,
        senderId: user.uid,
        senderType: 'user',
        content: userMsg,
        timestamp: serverTimestamp()
      });

      // 2. Call AI with tool calling capabilities
      const activeAgents = allAgents.filter(a => selectedAgentIds.includes(a.id));
      const agentContext = activeAgents.map(a => {
        const traits = a.traits ? `
        - Tone: ${a.traits.tone}
        - Verbosity: ${a.traits.verbosity}/10
        - Formality: ${a.traits.formality}/10
        - Primary Language: ${a.traits.language}` : '';
        
        return `[${a.name}]
        ID: ${a.id}
        Role: ${a.role}
        Personality: ${a.personality}
        Instructions: ${a.systemInstruction}${traits}`;
      }).join('\n\n');

      const response = await ai.models.generateContent({
        model: MODELS.FLASH,
        contents: [...messages.map(m => ({ 
          role: m.senderType === 'user' ? 'user' : 'model', 
          parts: [{ text: m.senderType === 'user' ? `[${profiles[m.senderId]?.displayName || 'User'}]: ${m.content}` : m.content }] 
        })), { role: 'user', parts: [{ text: `[${user.displayName || 'User'}]: ${userMsg}` }] }],
        config: {
          systemInstruction: `You are the AnchorCourt Intelligence System, a multi-agent orchestration system for Malaysian users.
          
          IDENTITY PROTOCOL:
          - Use [Agent Name] prefix for every segment of the response.
          - Use Malaysian nuance (e.g., local context, holidays, working norms).
          - Be friendly but professional.
          
          TASK DELEGATION & COLLABORATION PROTOCOLS:
          - ORCHESTRATION: You are responsible for ensuring the user's goal is met by the most qualified agent(s).
          - DIRECT HANDOFF: If a task exceeds an agent's expertise, explicitly hand it off: "[Court Assistant] I will handle the base plan. [Court Lokal], please verify the local travel restrictions for these dates."
          - PEER REVIEW: Agents should cross-validate each other's outputs if high accuracy is needed (e.g., Court Planner creates a schedule, Court Lokal reviews it for local holiday conflicts).
          - PROACTIVE CAPABILITY DISCOVERY: Agents MUST announce their specific skills when a task is relevant to them. 
            - Use the format: "[Agent Name] I can help with [X aspect] of this task, but [Another Agent] might be better suited for [Y aspect]."
          - TASK FORMALIZATION: Use 'manage_task' to log every handoff as a sub-task. Set status to 'in_progress' for the delegated agent. Always include a 'category' (Logistics, Community, or Operations) to keep the Board organized.

          COLLABORATIVE DECISION PROTOCOL:
          - If a task has multiple viable solutions, agents should present their reasoning:
            - "[Court Planner]: Option A is faster. [Court Lokal]: But Option B avoids local road closures."
          - The Intelligence System must then synthesize these views into a final recommendation for the user.

          EXTERNAL INTEGRATION PROTOCOLS:
          - NOTION WORKFLOW: Court Planner and Court Creative have high-level access to simulated Notion integrations. Planner must prioritize task breakdown into Notion-ready databases. Creative must generate content specifically formatted for Notion pages.
          - GOOGLE APPS SYNERGY: Court Creative can identify and suggest relevant Google Drive files (Docs, Sheets, Slides) to be used as reference or output targets.
          - GITHUB SYNERGY: Court Developer specializes in code learning and project management. Use GitHub tools to search for repositories, read code structures, and help users with assignments or technical projects.
          
          MULTI-USER CONTEXT:
          - This may be a group discussion. Address users by name and be mindful that agents are serving a team, not just an individual.
          
          GLOBAL KNOWLEDGE & DIRECTIVES (MANDATORY):
          ${globalConfig.instructions || 'No global directives set.'}
          ${globalConfig.referenceFiles.length > 0 ? `REFERENCE ASSETS: ${globalConfig.referenceFiles.join(', ')}` : ''}

          ${applyMemberProfileToInstruction('', memberConfig)}

          ACTIVE AGENTS IN THIS CONTEXT:
          ${agentContext}
          
          Each agent has specific behavioral traits (Tone, Verbosity, Formality). STRICTLY ADHERE to these traits when responding as that agent.
          
          Respond as one of these agents or a synthesis of them. Always prefix your responses with [Agent Name].`,
          tools: [{
            functionDeclarations: [
              {
                name: "manage_task",
                description: "Create, update, or delete tasks assigned to specific agents. Use 'create' for task handoffs to delegate sub-tasks to agents with relevant expertise.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    action: { type: Type.STRING, enum: ["create", "update", "delete"] },
                    taskId: { type: Type.STRING, description: "Required for update and delete" },
                    taskData: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING, description: "Short title for the delegated task" },
                        description: { type: Type.STRING, description: "Specific instructions for the receiving agent" },
                        assigneeId: { type: Type.STRING, description: "The ID of the agent assigned to this task (e.g., agent_lokal, agent_planner)" },
                        status: { type: Type.STRING, enum: ["pending", "in_progress", "completed", "blocked"] },
                        category: { type: Type.STRING, enum: ["Logistics", "Community", "Operations"] },
                        deadline: { type: Type.STRING, description: "ISO date string" }
                      }
                    }
                  },
                  required: ["action"]
                }
              },
              {
                name: "search_notion",
                description: "Search Notion workspace for pages and documents based on a query.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    query: { type: Type.STRING, description: "Search query" }
                  },
                  required: ["query"]
                }
              },
              {
                name: "create_notion_page",
                description: "Create a new page in a Notion workspace.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    parentId: { type: Type.STRING, description: "The ID of the parent page (must be a valid Notion UUID)" },
                    title: { type: Type.STRING, description: "The title of the new page" },
                    content: { type: Type.STRING, description: "Optional text content for the page body" }
                  },
                  required: ["parentId", "title"]
                }
              },
              {
                name: "add_notion_comment",
                description: "Add a comment to an existing Notion page.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    pageId: { type: Type.STRING, description: "The ID of the page to comment on" },
                    text: { type: Type.STRING, description: "The comment content" }
                  },
                  required: ["pageId", "text"]
                }
              },
              {
                name: "update_notion_page",
                description: "Update title or archive status of a Notion page.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    pageId: { type: Type.STRING, description: "The ID of the page to update" },
                    title: { type: Type.STRING, description: "Optional new title" },
                    archived: { type: Type.BOOLEAN, description: "Whether to archive the page" }
                  },
                  required: ["pageId"]
                }
              },
              {
                name: "search_google_drive",
                description: "Search for files in Google Drive.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    query: { type: Type.STRING, description: "Search query for file names" }
                  }
                }
              },
              {
                name: "list_calendar_events",
                description: "List upcoming events from the user's primary Google Calendar.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {}
                }
              },
              {
                name: "list_gmail_messages",
                description: "List or search for emails in Gmail.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    query: { type: Type.STRING, description: "Search query for emails" }
                  }
                }
              },
              {
                name: "search_github",
                description: "Search for repositories on GitHub.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    query: { type: Type.STRING, description: "Repository search query" }
                  },
                  required: ["query"]
                }
              },
              {
                name: "get_github_contents",
                description: "Get the contents of a file or directory in a GitHub repository.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    owner: { type: Type.STRING, description: "The repository owner" },
                    repo: { type: Type.STRING, description: "The repository name" },
                    path: { type: Type.STRING, description: "The file or directory path" }
                  },
                  required: ["owner", "repo", "path"]
                }
              }
            ]
          }]
        }
      });

      // Handle Tool Calls
      let finalResponse = response.text || "";
      const functionCalls = response.functionCalls;

      if (functionCalls) {
        setLoading(true);
        const toolResults = [];
        for (const call of functionCalls) {
          if (call.name === 'manage_task') {
            const data = await manageTask(call.args as any);
            toolResults.push({ name: 'manage_task', content: data });
          } else if (call.name === 'search_notion') {
            const data = await searchNotion(call.args as any);
            toolResults.push({ name: 'search_notion', content: data });
          } else if (call.name === 'create_notion_page') {
            const data = await createNotionPage(call.args as any);
            toolResults.push({ name: 'create_notion_page', content: data });
          } else if (call.name === 'add_notion_comment') {
            const data = await addNotionComment(call.args as any);
            toolResults.push({ name: 'add_notion_comment', content: data });
          } else if (call.name === 'update_notion_page') {
            const data = await updateNotionPage(call.args as any);
            toolResults.push({ name: 'update_notion_page', content: data });
          } else if (call.name === 'search_google_drive') {
            const data = await searchGoogleDrive(call.args as any);
            toolResults.push({ name: 'search_google_drive', content: data });
          } else if (call.name === 'search_github') {
            const data = await searchGithub(call.args as any);
            toolResults.push({ name: 'search_github', content: data });
          } else if (call.name === 'get_github_contents') {
            const data = await getGithubContents(call.args as any);
            toolResults.push({ name: 'get_github_contents', content: data });
          } else if (call.name === 'list_calendar_events') {
            const data = await listCalendarEvents();
            toolResults.push({ name: 'list_calendar_events', content: data });
          } else if (call.name === 'list_gmail_messages') {
            const data = await listGmailMessages(call.args as any);
            toolResults.push({ name: 'list_gmail_messages', content: data });
          }
        }

        // Send tool results back to model
        const toolFollowUp = await ai.models.generateContent({
          model: MODELS.FLASH,
          contents: [
            ...messages.map(m => ({ role: m.senderType === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
            { role: 'user', parts: [{ text: userMsg }] },
            { role: 'model', parts: functionCalls.map(c => ({ functionCall: { name: c.name, args: c.args } })) },
            { role: 'user', parts: toolResults.map(r => ({ functionResponse: { name: r.name, response: r.content } })) }
          ]
        });
        finalResponse = toolFollowUp.text || "";
      }

      // 3. Add AI message
      const aiMsgRef = await addDoc(collection(db, `threads/${threadId}/messages`), {
        threadId,
        userId: user.uid,
        senderId: 'court_system',
        senderType: 'agent',
        content: finalResponse || "I encountered an issue processing that request.",
        timestamp: serverTimestamp()
      });

      if (autoReadReplies && finalResponse) {
        speakMessage({
          id: aiMsgRef.id,
          content: finalResponse,
          senderType: 'agent'
        } as Message);
      }

    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1115] text-[#D1D5DB]">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-12 bg-[#16191F] rounded-3xl shadow-2xl max-w-md w-full text-center border border-[#2A2E37]"
        >
          <div className="w-20 h-20 bg-[#4F46E5] rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-indigo-500/20">
            <Zap className="text-white w-10 h-10" />
          </div>
          <h1 className="text-4xl font-black mb-4 tracking-tighter text-[#F3F4F6]">AnchorCourt</h1>
          <p className="text-[#9CA3AF] mb-8 font-medium">
            Your personal multi-agent assistant. <br/>Designed for focus and clarity.
          </p>
          <button 
            onClick={login}
            className="w-full py-4 bg-[#4F46E5] text-white rounded-2xl font-bold hover:bg-[#4338CA] transition-all flex items-center justify-center gap-3 active:scale-[0.98] shadow-lg shadow-indigo-500/20"
          >
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-[#0F1115] text-[#D1D5DB] overflow-hidden font-sans">
      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-[#16191F] border border-[#2A2E37] rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-white tracking-tight">Integrations</h2>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setShowMemberProfileModal(true)}
                      className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:bg-indigo-500/20 transition-all flex items-center gap-2"
                    >
                      <UserIcon className="w-3 h-3" />
                      Member Profile
                    </button>
                    <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-[#1F2937] rounded-full">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="p-6 bg-[#1F2937] rounded-2xl border border-[#374151] space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-black">
                         <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white">Notion Workspace</h4>
                        <p className="text-xs text-[#9CA3AF]">Access your pages and databases</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                       <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Internal Integration Secret</label>
                       <div className="flex gap-2">
                          <input 
                            type="password"
                            value={notionKey}
                            onChange={(e) => setNotionKey(e.target.value)}
                            placeholder="secret_..."
                            className="flex-1 bg-[#121418] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#4F46E5]"
                          />
                          <button 
                            onClick={saveNotionKey}
                            disabled={saveStatus === 'saving'}
                            className="px-6 py-3 bg-[#4F46E5] text-white rounded-xl font-bold text-xs hover:bg-[#4338CA] transition-all disabled:opacity-50"
                          >
                            {saveStatus === 'saving' ? '...' : saveStatus === 'saved' ? <Check className="w-4 h-4" /> : 'SAVE'}
                          </button>
                       </div>
                       <p className="text-[10px] text-[#6B7280]">
                         Find this in your <a href="https://www.notion.so/my-integrations" target="_blank" className="text-[#4F46E5] hover:underline inline-flex items-center gap-1">Notion Integrations <ExternalLink className="w-2 h-2" /></a>
                       </p>
                    </div>
                  </div>

                  <div className="p-6 bg-[#1F2937] rounded-2xl border border-[#374151] space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-black font-bold">
                         <Github className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white">GitHub Integration</h4>
                        <p className="text-xs text-[#9CA3AF]">Assignments, projects, and code sync</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                       <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Personal Access Token</label>
                       <div className="flex gap-2">
                          <input 
                            type="password"
                            value={githubKey}
                            onChange={(e) => setGithubKey(e.target.value)}
                            placeholder="ghp_..."
                            className="flex-1 bg-[#121418] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#4F46E5]"
                          />
                          <button 
                            onClick={saveGithubKey}
                            disabled={saveStatus === 'saving'}
                            className="px-6 py-3 bg-[#4F46E5] text-white rounded-xl font-bold text-xs hover:bg-[#4338CA] transition-all disabled:opacity-50"
                          >
                            {saveStatus === 'saving' ? '...' : saveStatus === 'saved' ? <Check className="w-4 h-4" /> : 'SAVE'}
                          </button>
                       </div>
                       <p className="text-[10px] text-[#6B7280]">
                         Generate a token in your <a href="https://github.com/settings/tokens" target="_blank" className="text-[#4F46E5] hover:underline inline-flex items-center gap-1">GitHub Settings <ExternalLink className="w-2 h-2" /></a>
                       </p>
                    </div>
                  </div>

                  <div className="p-6 bg-[#1F2937] rounded-2xl border border-[#374151] space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600">
                         <Layout className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white">Google Workspace</h4>
                        <p className="text-xs text-[#9CA3AF]">Manage Drive, Calendar, and Gmail</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                       <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Access Token</label>
                       <div className="flex gap-2">
                          <input 
                            type="password"
                            value={googleAccessToken}
                            onChange={(e) => setGoogleAccessToken(e.target.value)}
                            placeholder="ya29.a0A..."
                            className="flex-1 bg-[#121418] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#4F46E5]"
                          />
                          <button 
                            onClick={() => saveGoogleTokens(googleAccessToken)}
                            disabled={saveStatus === 'saving'}
                            className="px-6 py-3 bg-[#4F46E5] text-white rounded-xl font-bold text-xs hover:bg-[#4338CA] transition-all disabled:opacity-50"
                          >
                            {saveStatus === 'saving' ? '...' : saveStatus === 'saved' ? <Check className="w-4 h-4" /> : 'SAVE'}
                          </button>
                       </div>
                    </div>
                  </div>

                  <div className="p-6 bg-[#1F2937] rounded-2xl border border-[#374151] space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center text-black">
                         <Mic className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white">Voice & Accessibility</h4>
                        <p className="text-xs text-[#9CA3AF]">Configure audio interactions</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                      <button 
                        onClick={() => saveVoiceSettings(!autoSendVoice, autoReadReplies)}
                        className={cn(
                          "w-full px-4 py-3 rounded-xl border transition-all flex items-center justify-between group",
                          autoSendVoice ? "bg-amber-500/10 border-amber-500/40 text-amber-400" : "bg-[#121418] border-[#374151] text-[#9CA3AF]"
                        )}
                      >
                         <div className="flex items-center gap-3 text-left">
                            <Zap className={cn("w-4 h-4", autoSendVoice ? "text-amber-400 scale-110" : "text-[#4B5563]")} />
                            <div>
                               <p className="text-[10px] font-black uppercase tracking-widest">Auto-Send Voice</p>
                               <p className="text-[9px] opacity-60">Fire message immediately after speaking</p>
                            </div>
                         </div>
                         <div className={cn("w-2 h-2 rounded-full", autoSendVoice ? "bg-amber-400 animate-pulse" : "bg-[#374151]")} />
                      </button>

                      <button 
                        onClick={() => saveVoiceSettings(autoSendVoice, !autoReadReplies)}
                        className={cn(
                          "w-full px-4 py-3 rounded-xl border transition-all flex items-center justify-between group",
                          autoReadReplies ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-400" : "bg-[#121418] border-[#374151] text-[#9CA3AF]"
                        )}
                      >
                         <div className="flex items-center gap-3 text-left">
                            <Volume2 className={cn("w-4 h-4", autoReadReplies ? "text-indigo-400 scale-110" : "text-[#4B5563]")} />
                            <div>
                               <p className="text-[10px] font-black uppercase tracking-widest">Auto-Read Replies</p>
                               <p className="text-[9px] opacity-60">Agents will vocalize their responses</p>
                            </div>
                         </div>
                         <div className={cn("w-2 h-2 rounded-full", autoReadReplies ? "bg-indigo-400 animate-pulse" : "bg-[#374151]")} />
                      </button>
                    </div>
                  </div>

                  <div className="p-6 bg-[#1F2937] rounded-2xl border border-[#374151] space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                         <Zap className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white">Quick Summon</h4>
                        <p className="text-xs text-[#9CA3AF]">Agents active by default in new threads</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {allAgents.map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => {
                            const newDefaults = defaultAgentIds.includes(agent.id)
                              ? (defaultAgentIds.length > 1 ? defaultAgentIds.filter(id => id !== agent.id) : defaultAgentIds)
                              : [...defaultAgentIds, agent.id];
                            saveDefaultAgents(newDefaults);
                          }}
                          className={cn(
                            "px-3 py-2 rounded-xl text-[10px] font-bold flex items-center gap-2 border transition-all",
                            defaultAgentIds.includes(agent.id)
                              ? "bg-[#4F46E5] border-transparent text-white"
                              : "bg-[#121418] border-[#374151] text-[#9CA3AF] hover:border-[#4F46E5]"
                          )}
                        >
                          <Avatar avatar={agent.avatar} url={agent.avatarUrl} className="w-4 h-4" />
                          {agent.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showCreateAgentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateAgentModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-[#16191F] border border-[#2A2E37] rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-white tracking-tight">{editingAgentId ? 'Calibrate Synapse' : 'Forge Custom Agent'}</h2>
                  <button onClick={() => setShowCreateAgentModal(false)} className="p-2 hover:bg-[#1F2937] rounded-full">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  <div className="space-y-4">
                    <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Select Identity Avatar</label>
                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-3">
                      {PRESET_AVATARS.map(avatar => (
                        <button
                          key={avatar}
                          onClick={() => setNewAgent({ ...newAgent, avatar })}
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                            newAgent.avatar === avatar 
                              ? "bg-[#4F46E5] scale-110 shadow-lg shadow-indigo-500/30" 
                              : "bg-[#121418] border border-[#2A2E37] hover:border-[#4F46E5]/50"
                          )}
                        >
                          {avatar}
                        </button>
                      ))}
                      <div className="relative group">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className={cn(
                          "w-10 h-10 rounded-xl border-2 border-dashed flex items-center justify-center transition-all overflow-hidden",
                          (newAgent.avatar.startsWith('data:image') || newAgent.avatarUrl)
                            ? "border-[#4F46E5] bg-[#4F46E5]/10" 
                            : "border-[#374151] hover:border-[#4F46E5]/50"
                        )}>
                          {isAgentAvatarUploading ? (
                            <Loader2 className="w-4 h-4 text-[#4F46E5] animate-spin" />
                          ) : (newAgent.avatar.startsWith('data:image') || newAgent.avatarUrl) ? (
                            <Avatar avatar={newAgent.avatar} url={newAgent.avatarUrl} className="w-full h-full rounded-lg" />
                          ) : (
                            <Plus className="w-4 h-4 text-[#6B7280]" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Agent Name</label>
                    <input 
                      value={newAgent.name}
                      onChange={e => setNewAgent({...newAgent, name: e.target.value})}
                      placeholder="e.g. Court Research"
                      className="w-full bg-[#121418] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#4F46E5]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Role & Purpose</label>
                    <input 
                      value={newAgent.role}
                      onChange={e => setNewAgent({...newAgent, role: e.target.value})}
                      placeholder="e.g. Data Analysis or Creative Writing"
                      className="w-full bg-[#121418] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#4F46E5]"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Settings className="w-3 h-3 text-[#4F46E5]" />
                      <p className="text-[10px] uppercase font-black tracking-widest text-[#4F46E5]">Behavioral Dynamics</p>
                    </div>
                    <div className="grid grid-cols-2 gap-6 p-4 bg-[#121418] border border-[#2A2E37] rounded-2xl">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-[#9CA3AF]">Verbosity</label>
                            <div className="group relative">
                              <Bot className="w-2.5 h-2.5 text-[#6B7280] cursor-help" />
                              <div className="hidden group-hover:block absolute bottom-full left-0 mb-2 w-32 p-2 bg-[#1F2937] text-[8px] text-white rounded shadow-xl z-50">
                                Controls how detailed and long the responses are.
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] text-[#4F46E5] font-mono font-bold">{newAgent.traits?.verbosity}/10</span>
                        </div>
                        <input 
                          type="range" min="1" max="10" 
                          value={newAgent.traits?.verbosity}
                          onChange={e => setNewAgent({...newAgent, traits: {...newAgent.traits!, verbosity: parseInt(e.target.value)}})}
                          className="w-full h-1.5 bg-[#1F2937] rounded-lg appearance-none cursor-pointer accent-[#4F46E5] shadow-inner"
                        />
                        <div className="flex justify-between text-[8px] text-[#6B7280] uppercase tracking-tighter">
                          <span>Concise</span>
                          <span>Detailed</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                             <label className="text-[10px] font-bold text-[#9CA3AF]">Formality</label>
                             <div className="group relative">
                              <Settings className="w-2.5 h-2.5 text-[#6B7280] cursor-help" />
                              <div className="hidden group-hover:block absolute bottom-full left-0 mb-2 w-32 p-2 bg-[#1F2937] text-[8px] text-white rounded shadow-xl z-50">
                                Controls the level of professionalism and protocol.
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] text-[#4F46E5] font-mono font-bold">{newAgent.traits?.formality}/10</span>
                        </div>
                        <input 
                          type="range" min="1" max="10" 
                          value={newAgent.traits?.formality}
                          onChange={e => setNewAgent({...newAgent, traits: {...newAgent.traits!, formality: parseInt(e.target.value)}})}
                          className="w-full h-1.5 bg-[#1F2937] rounded-lg appearance-none cursor-pointer accent-[#4F46E5] shadow-inner"
                        />
                        <div className="flex justify-between text-[8px] text-[#6B7280] uppercase tracking-tighter">
                          <span>Casual</span>
                          <span>Strict</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-[#1F2937]/50 border border-[#2A2E37] rounded-2xl space-y-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-3 h-3 text-amber-500" />
                        <p className="text-[10px] uppercase font-black tracking-widest text-[#9CA3AF]">Response Simulation</p>
                      </div>
                      <p className="text-xs text-[#F3F4F6] italic leading-relaxed">
                        "{(newAgent.traits?.formality || 5) > 7 
                          ? `Good afternoon. I have concluded the assessment of your request. ${(newAgent.traits?.verbosity || 5) > 6 ? `Furthermore, I have prepared a comprehensive strategy that encompasses all specified variables.` : `The results are ready for your review.`}`
                          : (newAgent.traits?.formality || 5) < 4
                            ? `Hey! Just finished up with that thing you asked for. ${(newAgent.traits?.verbosity || 5) > 6 ? `Also, I think we should totally check out those extra ideas too, they look dope!` : `Hope it's what you needed! 🚀`}`
                            : `I've finished the task and prepared the results for you. ${(newAgent.traits?.verbosity || 5) > 6 ? `I also cross-referenced these findings with the project roadmap.` : ``}`
                        }"
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Access Level Boundary</label>
                           <div className="flex gap-2">
                             <button
                               onClick={() => setNewAgent({ ...newAgent, accessLevel: 'family_safe' })}
                               className={cn(
                                 "flex-1 px-3 py-2.5 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-2",
                                 newAgent.accessLevel === 'family_safe'
                                   ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                                   : "bg-[#121418] border-[#374151] text-[#9CA3AF]"
                               )}
                             >
                               <Heart className="w-3 h-3" />
                               Family Safe
                             </button>
                             <button
                               onClick={() => setNewAgent({ ...newAgent, accessLevel: 'court_core' })}
                               className={cn(
                                 "flex-1 px-3 py-2.5 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-2",
                                 newAgent.accessLevel === 'court_core'
                                   ? "bg-amber-500/10 border-amber-500 text-amber-400 font-black"
                                   : "bg-[#121418] border-[#374151] text-[#9CA3AF]"
                               )}
                             >
                               <Shield className="w-3 h-3" />
                               Court Core
                             </button>
                           </div>
                        </div>
                       <div className="space-y-2">
                          <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Tone Profile</label>
                          <select 
                            value={newAgent.traits?.tone}
                            onChange={e => setNewAgent({...newAgent, traits: {...newAgent.traits!, tone: e.target.value}})}
                            className="w-full bg-[#121418] border border-[#374151] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#4F46E5]"
                          >
                            {['Direct', 'Playful', 'Serious', 'Empathetic', 'Analytical', 'Encouraging', 'Polite (Malay Nuance)'].map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Language Preference</label>
                          <select 
                            value={newAgent.traits?.language}
                            onChange={e => setNewAgent({...newAgent, traits: {...newAgent.traits!, language: e.target.value as any}})}
                            className="w-full bg-[#121418] border border-[#374151] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#4F46E5]"
                          >
                            <option value="English">English (Standard)</option>
                            <option value="Malay">Bahasa Melayu (Lokal)</option>
                            <option value="Bilingual">Bilingual (Manglish Mix)</option>
                          </select>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Personality Description</label>
                    <p className="text-[10px] text-[#6B7280] -mt-1 italic">Describe the vibe and character of the agent.</p>
                    <textarea 
                      value={newAgent.personality}
                      onChange={e => setNewAgent({...newAgent, personality: e.target.value})}
                      placeholder="Analytical, precise, and objective. Speaks with a calm authoritative voice..."
                      className="w-full bg-[#121418] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#4F46E5] h-20 resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black tracking-widest text-[#4F46E5] font-black">Custom System Prompt</label>
                    <p className="text-[10px] text-[#6B7280] -mt-1 italic">Core technical instructions for the LLM. Define constraints and specific knowledge.</p>
                    <textarea 
                      value={newAgent.systemInstruction}
                      onChange={e => setNewAgent({...newAgent, systemInstruction: e.target.value})}
                      placeholder="You are an expert researcher. You MUST always verify sources from Notion before answering. Stick to the provided context..."
                      className="w-full bg-[#121418] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#4F46E5] h-32 resize-none"
                    />
                  </div>

                  <button 
                    onClick={saveOrUpdateCustomAgent}
                    disabled={!newAgent.name || !newAgent.role || loading}
                    className="w-full py-4 bg-[#4F46E5] text-white rounded-xl font-bold hover:bg-[#4338CA] transition-all disabled:opacity-50 flex items-center justify-center gap-2 transform active:scale-[0.98]"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {loading ? 'SYNCHRONIZING...' : (editingAgentId ? 'UPDATE SYNAPSE CONFIG' : 'INITIALIZE SERVICE PROVIDER')}
                  </button>

                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showCreateGroupModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateGroupModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-[#16191F] border border-[#2A2E37] rounded-3xl shadow-2xl overflow-hidden"
            >
              <form onSubmit={createGroupDiscussion} className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white tracking-tight">New Group Project</h2>
                  <button type="button" onClick={() => setShowCreateGroupModal(false)} className="p-2 hover:bg-[#1F2937] rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <p className="text-xs text-[#9CA3AF]">
                    Create a shared workspace where multiple users can collaborate with AI agents.
                  </p>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Discussion Name</label>
                    <input 
                      required
                      value={groupName}
                      onChange={e => setGroupName(e.target.value)}
                      placeholder="e.g. Q3 Roadmap Planning"
                      className="w-full bg-[#121418] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#4F46E5]"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading || !groupName.trim()}
                  className="w-full py-4 bg-[#4141E5] text-white rounded-xl font-bold hover:bg-[#4338CA] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                  {loading ? 'INITIALIZING...' : 'CREATE GROUP CHAT'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showInviteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowInviteModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-[#16191F] border border-[#2A2E37] rounded-3xl shadow-2xl overflow-hidden"
            >
              <form onSubmit={inviteUserByEmail} className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white tracking-tight">Invite to Discussion</h2>
                  <button type="button" onClick={() => setShowInviteModal(false)} className="p-2 hover:bg-[#1F2937] rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <p className="text-xs text-[#9CA3AF]">
                    Invite other users to collaborate in this thread with you and the agents.
                  </p>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black tracking-widest text-[#6B7280]">Email Address</label>
                    <input 
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full bg-[#121418] border border-[#374151] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#4F46E5]"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={inviteLoading || !inviteEmail}
                  className="w-full py-4 bg-[#4F46E5] text-white rounded-xl font-bold hover:bg-[#4338CA] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {inviteLoading ? 'INVITING...' : 'SEND INVITATION'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toggle Buttons (Floating when collapsed) */}
      {!isLeftSidebarCollapsed && (
        <button 
          onClick={() => setIsLeftSidebarCollapsed(true)}
          className="fixed left-[244px] top-6 z-[60] p-1.5 bg-[#16191F] border border-[#2A2E37] text-[#6B7280] hover:text-white rounded-md transition-all shadow-xl lg:flex hidden"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {isLeftSidebarCollapsed && (
        <button 
          onClick={() => setIsLeftSidebarCollapsed(false)}
          className="fixed left-4 top-6 z-[60] p-2 bg-[#16191F] border border-[#2A2E37] text-indigo-500 hover:text-indigo-400 rounded-xl transition-all shadow-xl hover:scale-110"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
      )}

      {/* Main Container */}
      <div className="flex h-full w-full overflow-hidden">
        {/* Sidebar */}
        <AnimatePresence>
          {!isFocusMode && !isLeftSidebarCollapsed && (
            <motion.aside 
              key="left-sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 100 }}
              className="h-full border-r border-[#2A2E37] bg-[#121418] flex flex-col relative"
            >
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-3 mb-10">
                <div className="w-8 h-8 bg-[#4F46E5] rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Zap className="text-white w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-[#F3F4F6]">AnchorCourt <span className="text-[#6B7280] font-normal italic text-sm">/ Portal</span></h2>
              </div>

              <div className="space-y-6">
                <div>
                   <div className="flex items-center gap-2 mb-6">
                      <button 
                        onClick={createNewThread}
                        className="flex-1 py-3 bg-[#16191F] border border-[#2A2E37] text-white rounded-xl text-[10px] font-black tracking-widest hover:bg-[#1F2937] transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        OPEN PORTAL
                      </button>
                      <button 
                        onClick={() => setShowCreateGroupModal(true)}
                        className="w-12 h-11 flex items-center justify-center bg-[#4F46E5]/10 text-[#4F46E5] rounded-xl hover:bg-[#4F46E5]/20 transition-all border border-[#4F46E5]/30 group"
                        title="Create Group Project"
                      >
                        <Users className="w-4 h-4 transition-transform group-hover:scale-110" />
                      </button>
                   </div>

                  <div className="flex items-center justify-between mb-4 px-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B7280]">Summon Agents</p>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={updateQuickSummon}
                        className="p-1 hover:bg-[#1F2937] rounded-md text-amber-500 transition-colors"
                        title="Save current selection as Quick Summon default"
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => {
                          setEditingAgentId(null);
                          setNewAgent({
                            name: '',
                            role: '',
                            personality: '',
                            avatar: '🤖',
                            systemInstruction: '',
                            traits: {
                              verbosity: 5,
                              formality: 5,
                              tone: 'Direct',
                              language: 'English'
                            }
                          });
                          setShowCreateAgentModal(true);
                        }}
                        className="p-1 hover:bg-[#1F2937] rounded-md text-[#4F46E5] transition-colors"
                        title="Create Custom Agent"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {allAgents.map(agent => (
                      <button 
                        key={agent.id} 
                        onClick={async () => {
                          const newIds = selectedAgentIds.includes(agent.id) 
                            ? (selectedAgentIds.length > 1 ? selectedAgentIds.filter(id => id !== agent.id) : selectedAgentIds) 
                            : [...selectedAgentIds, agent.id];
                          
                          setSelectedAgentIds(newIds);
                          
                          if (activeThreadId) {
                            await setDoc(doc(db, 'threads', activeThreadId), {
                              activeAgentIds: newIds,
                              updatedAt: serverTimestamp()
                            }, { merge: true });
                          }
                        }}
                        className={cn(
                          "w-full text-left p-2.5 rounded-xl flex items-center gap-3 transition-all group border",
                          selectedAgentIds.includes(agent.id)
                            ? "bg-[#4F46E5]/10 border-[#4F46E5]/30 text-white"
                            : "hover:bg-[#1F2937] border-transparent text-[#9CA3AF]"
                        )}
                      >
                        <div className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold shadow-inner transition-transform group-hover:scale-105 overflow-hidden",
                          selectedAgentIds.includes(agent.id) ? "bg-[#4F46E5] text-white" :
                          agent.id === 'agent_lokal' ? "bg-red-900/50 text-red-300" :
                          agent.id === 'agent_planner' ? "bg-indigo-900/50 text-indigo-300" : 
                          agent.id === 'agent_creative' ? "bg-emerald-900/50 text-emerald-300" : 
                          "bg-amber-900/50 text-amber-300"
                        )}>
                          <Avatar avatar={agent.avatar} url={agent.avatarUrl} className="w-full h-full flex items-center justify-center" />
                        </div>
                        <div className="overflow-hidden flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <p className="text-xs font-bold truncate group-hover:text-white">{agent.name}</p>
                              {defaultAgentIds.includes(agent.id) && (
                                <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500/20 flex-shrink-0" />
                              )}
                            </div>
                            {selectedAgentIds.includes(agent.id) && <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="w-1 h-1 rounded-full bg-[#4F46E5]" />}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                             {(() => {
                               const status = getAgentStatus(agent.id);
                               return (
                                 <>
                                   {status.icon}
                                   <p className={cn("text-[8px] font-black uppercase tracking-tighter truncate", status.color)}>
                                     {status.label}
                                   </p>
                                 </>
                               );
                             })()}
                          </div>
                        </div>
                        {customAgents.find(a => a.id === agent.id) && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                const customAgent = customAgents.find(a => a.id === agent.id);
                                if (customAgent) startEditingAgent(customAgent);
                              }}
                              className="p-1 hover:bg-[#1F2937] rounded-md text-[#6B7280] hover:text-white transition-colors"
                              title="Edit Agent"
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>
                            <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (confirm('Delete this custom agent?')) {
                                   deleteDoc(doc(db, `users/${user.uid}/agents`, agent.id));
                                 }
                               }}
                               className="p-1 hover:bg-[#1F2937] rounded-md text-[#6B7280] hover:text-red-400 transition-colors"
                               title="Delete Agent"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {threads.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B7280] px-2">Recent Interactions</p>
                    <div className="space-y-1">
                      {threads.map(thread => (
                        <div key={thread.id} className="group relative">
                          <button 
                            onClick={() => setActiveThreadId(thread.id)}
                            className={cn(
                              "w-full text-left p-3 rounded-xl flex flex-col gap-1 transition-all border",
                              activeThreadId === thread.id
                                ? "bg-[#4F46E5]/10 border-[#4F46E5]/30 text-white"
                                : "hover:bg-[#1F2937] border-transparent text-[#9CA3AF]"
                            )}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {thread.isGroup ? <Users className="w-3 h-3 text-[#4F46E5]" /> : <MessageSquare className="w-3 h-3 text-[#6B7280]" />}
                              <p className="text-[11px] font-bold truncate pr-6 leading-tight flex-1">
                                {thread.title || 'Untitled Discussion'}
                              </p>
                            </div>
                            <p className="text-[9px] text-[#6B7280] truncate leading-tight mb-1">{thread.lastMessage || 'No messages'}</p>
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <div className="flex -space-x-1.5 flex-shrink-0">
                                 {thread.memberIds?.slice(0, 3).map(mid => (
                                   <div key={mid} className="w-3 h-3 rounded-full bg-[#1F2937] ring-1 ring-[#121418] overflow-hidden">
                                     {profiles[mid]?.photoURL ? (
                                        <img src={profiles[mid].photoURL} alt="" />
                                     ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[5px] text-white font-bold uppercase">
                                          {profiles[mid]?.displayName?.[0] || 'U'}
                                        </div>
                                     )}
                                   </div>
                                 ))}
                              </div>
                              <span className="text-[7px] text-[#4B5563] font-black uppercase tracking-tighter">
                                {thread.memberIds?.length || 1} PARTICIPANTS
                              </span>
                            </div>
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Delete this discussion?')) {
                                deleteThread(thread.id);
                              }
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-[#6B7280] hover:text-red-400 transition-all z-10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-auto p-4 border-t border-[#2A2E37]">
               <div className="flex gap-2">
                 <button 
                  onClick={() => setShowSettings(true)}
                  className="flex-1 py-2.5 rounded-lg border border-[#374151] text-[10px] font-black uppercase tracking-widest hover:bg-[#1F2937] transition-colors mb-2 flex items-center justify-center gap-2 text-[#9CA3AF] hover:text-white"
                 >
                    <Settings className="w-3 h-3" />
                    HOUSE SETTINGS
                 </button>
                 {isAdmin && (
                   <button 
                    onClick={() => setShowAdminDashboard(true)}
                    className="p-2.5 rounded-lg border border-amber-900/50 text-amber-500 hover:bg-amber-900/20 transition-colors mb-2 flex items-center justify-center"
                    title="Command Center"
                   >
                     <Shield className="w-4 h-4" />
                   </button>
                 )}
               </div>
               <button 
                onClick={() => auth.signOut()}
                className="w-full p-3 rounded-xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest hover:bg-red-900/10 text-red-500/80 mt-1 transition-colors"
               >
                  <Trash2 className="w-4 h-4" />
                  Sign Out
               </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <main className={cn(
        "flex-1 flex flex-col relative h-full transition-all duration-700 overflow-hidden",
        isFocusMode ? "bg-[#090A0C]" : "bg-[#0F1115]"
      )}>
        {/* Ambient Focus Glow */}
        {isFocusMode && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden translate-z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-500/5 blur-[120px] animate-pulse delay-1000"></div>
          </div>
        )}
        {/* Header */}
        <header className="h-16 border-b border-[#2A2E37] flex items-center justify-between px-6 bg-[#16191F] shrink-0">
          <div className="flex items-center gap-4">
            {isLeftSidebarCollapsed && <div className="w-8" />}
            {isFocusMode && (
              <button 
                onClick={() => setIsFocusMode(false)}
                className="p-2 hover:bg-[#1F2937] rounded-lg transition-colors"
              >
                <Layout className="w-5 h-5 text-[#9CA3AF]" />
              </button>
            )}
            <h1 className="text-sm font-semibold text-[#F3F4F6] tracking-tight truncate max-w-[200px]">
              {threads.find(t => t.id === activeThreadId)?.title || 'Court Stream'}
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {activeThreadId && !isFocusMode && (
              <div className="flex items-center gap-4">
                <button 
                  onClick={generateBriefing}
                  className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all flex items-center gap-2"
                >
                  <FileText className="w-3 h-3" />
                  Briefing
                </button>
                <div className="h-4 w-px bg-[#2A2E37]" />
                <button 
                  onClick={() => setShowImageStudio(true)}
                  className="p-2 hover:bg-amber-500/10 text-[#6B7280] hover:text-amber-500 rounded-lg transition-all"
                  title="Image Studio"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
                <div className="h-4 w-px bg-[#2A2E37]" />
                <button 
                  onClick={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
                  className={cn(
                    "p-2 hover:bg-[#1F2937] rounded-lg transition-colors",
                    isRightSidebarCollapsed ? "text-[#6B7280]" : "text-indigo-400 bg-indigo-500/10"
                  )}
                  title={isRightSidebarCollapsed ? "Show Intelligence Layer" : "Collapse Intelligence Layer"}
                >
                  <PanelRight className="w-4 h-4" />
                </button>
                <div className="h-4 w-px bg-[#2A2E37]" />
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2 overflow-hidden">
                    {selectedAgentIds.map(aid => {
                      const agent = allAgents.find(a => a.id === aid);
                      if (!agent) return null;
                      return (
                        <div key={aid} className="group relative">
                          <button 
                            onClick={() => {
                              const custom = customAgents.find(ca => ca.id === aid);
                              if (custom) startEditingAgent(custom);
                            }}
                            disabled={!customAgents.find(ca => ca.id === aid)}
                            className={cn(
                              "inline-flex items-center justify-center h-6 w-6 rounded-full ring-2 ring-[#16191F] shadow-sm overflow-hidden text-[8px] font-bold transition-all",
                              aid === 'agent_lokal' ? "bg-red-900/50 text-red-300" :
                              aid === 'agent_planner' ? "bg-indigo-900/50 text-indigo-300" : 
                              aid === 'agent_creative' ? "bg-emerald-900/50 text-emerald-300" : 
                              "bg-amber-900/50 text-amber-300"
                            )}
                            title={`${agent.name} (${customAgents.find(ca => ca.id === aid) ? 'Editable' : 'Default'})`}
                          >
                            <Avatar avatar={agent.avatar} url={agent.avatarUrl} className="w-full h-full flex items-center justify-center" />
                          </button>
                          {customAgents.find(ca => ca.id === aid) && (
                            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#4F46E5] rounded-full border border-[#16191F] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <Settings className="w-1 h-1 text-white" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="h-4 w-px bg-[#2A2E37]" />

                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2 overflow-hidden">
                    {threads.find(t => t.id === activeThreadId)?.memberIds.slice(0, 3).map(mid => (
                      <div key={mid} className="inline-block h-6 w-6 rounded-full ring-2 ring-[#16191F] bg-[#1F2937] overflow-hidden" title={profiles[mid]?.displayName}>
                        {profiles[mid]?.photoURL ? (
                          <img src={profiles[mid].photoURL} alt="" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[8px] font-bold">
                            {profiles[mid]?.displayName?.[0] || 'U'}
                          </div>
                        )}
                      </div>
                    ))}
                    {(threads.find(t => t.id === activeThreadId)?.memberIds.length || 0) > 3 && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1F2937] text-[8px] font-bold ring-2 ring-[#16191F]">
                        +{(threads.find(t => t.id === activeThreadId)?.memberIds.length || 0) - 3}
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => setShowInviteModal(true)}
                    className="p-1.5 hover:bg-[#1F2937] rounded-lg transition-colors text-[#4F46E5]"
                    title="Invite Others"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <button 
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all border",
                isFocusMode 
                  ? "bg-[#4F46E5] text-white border-[#4F46E5] shadow-lg shadow-indigo-500/20" 
                  : "bg-transparent text-[#9CA3AF] border-[#374151] hover:border-[#4B5563]"
              )}
            >
              {isFocusMode ? 'Focus: High' : 'Focus: Off'}
            </button>
            <div className="w-9 h-9 rounded-full border-2 border-[#374151] shadow-sm overflow-hidden bg-[#1F2937] ring-offset-2 ring-indigo-500 hover:ring-2 transition-all cursor-pointer" onClick={() => setShowMemberProfileModal(true)}>
              <Avatar 
                avatar={user.displayName?.[0] || 'U'} 
                url={profiles[user.uid]?.photoURL || user.photoURL || undefined} 
                className="w-full h-full flex items-center justify-center font-bold" 
              />
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className={cn(
          "flex-1 overflow-y-auto p-8 space-y-8 pb-36 transition-all",
          isFocusMode ? "max-w-3xl mx-auto w-full" : ""
        )}>
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-6 opacity-30 select-none">
              <div className="p-6 bg-[#1F2937] rounded-full">
                <MessageSquare className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-semibold text-white">Enter Portal</p>
                <p className="text-sm max-w-xs mx-auto">Your intelligence team is ready to support your daily operations, local logistics, and community coordination.</p>
              </div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <motion.div 
              key={msg.id || idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex gap-5",
                msg.senderType === 'user' ? "ml-auto flex-row-reverse max-w-[80%]" : "mr-auto max-w-[90%]"
              )}
            >
              {/* Header */}
              <div className={cn(
                "w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-lg overflow-hidden",
                msg.senderType === 'user' ? "bg-[#374151] text-[#D1D5DB]" : "bg-[#4F46E5] text-white"
              )}>
                {msg.senderType === 'user' ? (
                  <Avatar 
                    avatar={profiles[msg.senderId]?.displayName?.[0] || 'U'} 
                    url={profiles[msg.senderId]?.photoURL}
                    className="w-full h-full flex items-center justify-center font-bold" 
                  />
                ) : (
                  <Avatar 
                    avatar={allAgents.find(a => msg.content.includes(`[${a.name}]`))?.avatar || '🤖'} 
                    url={allAgents.find(a => msg.content.includes(`[${a.name}]`))?.avatarUrl}
                    className="w-full h-full flex items-center justify-center"
                  />
                )}
              </div>
              <div className="space-y-2">
                {!isFocusMode && (
                  <p className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2",
                    msg.senderType === 'user' ? "text-right text-[#6B7280] flex-row-reverse" : "text-[#4F46E5]"
                  )}>
                    {msg.senderType === 'user' ? (profiles[msg.senderId]?.displayName || 'User') : (allAgents.find(a => msg.content.includes(`[${a.name}]`))?.name || 'Court System')}
                    {msg.senderId === CREATOR_EMAIL_UID && (
                      <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[8px] text-amber-500 font-black">PRIME RESIDENT</span>
                    )}
                  </p>
                )}
                <div className={cn(
                  "p-5 rounded-2xl border transition-all hover:border-[#4B5563] relative group/msg overflow-hidden",
                  msg.senderType === 'user' 
                    ? "bg-[#1F2937] text-[#E5E7EB] border-[#374151] rounded-tr-none" 
                    : "bg-[#16191F] text-[#D1D5DB] border-[#2A2E37] rounded-tl-none border-l-2 border-l-[#4F46E5]"
                )}>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap selection:bg-[#4F46E5]/40 max-w-none">
                    <ReactMarkdown
                      components={{
                        img: ({ ...props }) => (
                          <img 
                            {...props} 
                            referrerPolicy="no-referrer" 
                            className="max-w-full h-auto rounded-xl my-4 shadow-2xl border border-[#2A2E37] block mx-auto" 
                          />
                        ),
                        p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                        h1: ({ children }) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-md font-bold text-white mb-2">{children}</h2>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-4 space-y-1">{children}</ul>,
                        li: ({ children }) => <li className="pl-1">{children}</li>,
                        strong: ({ children }) => <strong className="font-bold text-[#4F46E5]">{children}</strong>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                  {msg.senderType === 'agent' && (
                    <div className="absolute -bottom-6 right-0 flex gap-1 p-1 bg-[#121418]/60 backdrop-blur-sm rounded-lg border border-[#2A2E37] opacity-0 group-hover/msg:opacity-100 transition-all shadow-xl">
                      <button 
                        onClick={() => speakMessage(msg)}
                        className={cn(
                          "p-1.5 rounded-md transition-all flex items-center gap-2",
                          speakingMessageId === msg.id ? "text-red-400 bg-red-500/10" : "text-[#9CA3AF] hover:text-indigo-400"
                        )}
                        title={speakingMessageId === msg.id ? "Stop Playback" : "Speak Message"}
                      >
                        {speakingMessageId === msg.id ? (
                          <>
                            <div className="flex gap-0.5 items-end h-3">
                              <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0 }} className="w-0.5 bg-red-400" />
                              <motion.div animate={{ height: [8, 4, 8] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0.2 }} className="w-0.5 bg-red-400" />
                              <motion.div animate={{ height: [6, 10, 6] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0.1 }} className="w-0.5 bg-red-400" />
                            </div>
                            <X className="w-3 h-3" />
                          </>
                        ) : (
                          <Volume2 className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Message Reactions */}
                  <div className={cn(
                    "flex flex-wrap gap-1.5 mt-4",
                    msg.senderType === 'user' ? "justify-end" : "justify-start"
                  )}>
                    {['✅', '💡', '⚠️', '👀'].map(emoji => {
                      const users = msg.reactions?.[emoji] || [];
                      const hasReacted = users.includes(user?.uid || '');
                      
                      return (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(msg.id, emoji)}
                          className={cn(
                            "px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 border",
                            hasReacted 
                              ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-400" 
                              : "bg-[#1F2937]/50 border-[#2A2E37] text-[#4B5563] hover:border-[#4B5563]"
                          )}
                        >
                          <span>{emoji}</span>
                          {users.length > 0 && <span>{users.length}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="flex gap-5 mr-auto">
              <div className="w-9 h-9 rounded-lg bg-[#1F2937] flex items-center justify-center">
                <Bot className="w-5 h-5 text-[#4F46E5] animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="bg-[#16191F] p-4 border border-[#2A2E37] rounded-2xl rounded-tl-none flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-[#4F46E5]" />
                  <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">Coordinating Agents...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className={cn(
          "absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-[#0F1115] via-[#0F1115] to-transparent",
          isFocusMode ? "max-w-3xl mx-auto" : ""
        )}>
          <AnimatePresence>
            {isRecording && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="mb-4 flex items-center justify-center"
              >
                <div className="px-6 py-2 bg-red-500/10 border border-red-500/30 rounded-full flex items-center gap-3 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                   <div className="flex gap-1 items-end h-3">
                      <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0 }} className="w-1 bg-red-500 rounded-full" />
                      <motion.div animate={{ height: [8, 4, 8] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0.2 }} className="w-1 bg-red-500 rounded-full" />
                      <motion.div animate={{ height: [12, 8, 12] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0.4 }} className="w-1 bg-red-500 rounded-full" />
                      <motion.div animate={{ height: [6, 10, 6] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0.1 }} className="w-1 bg-red-500 rounded-full" />
                   </div>
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">AnchorCourt Listening...</span>
                   {autoSendVoice && <span className="text-[8px] font-bold text-red-500/60 uppercase">Auto-Send Armed</span>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form 
            onSubmit={sendMessage}
            className="relative flex items-center transition-all group"
          >
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Speak to AnchorCourt..."
              className="w-full bg-[#1F2937] border border-[#374151] rounded-2xl py-4.5 px-6 pr-36 text-sm text-[#F3F4F6] focus:outline-none focus:border-[#4F46E5] focus:ring-4 focus:ring-[#4F46E5]/10 shadow-2xl transition-all placeholder:text-[#6B7280]"
            />
            <div className="absolute right-3 flex gap-2 items-center">
              <button 
                type="button"
                onClick={startVoiceInput}
                className={cn(
                  "p-2 rounded-xl transition-all active:scale-95",
                  isRecording ? "bg-red-500/10 text-red-500 animate-pulse scale-110" : "text-[#6B7280] hover:text-white"
                )}
                title="Voice Input"
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button 
                type="submit"
                disabled={loading || !input.trim()}
                className={cn(
                  "px-4 py-2 bg-[#4F46E5] text-white rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-30 disabled:grayscale shadow-lg shadow-indigo-500/20",
                  !input.trim() ? "" : "hover:bg-[#4338CA] hover:-translate-y-0.5"
                )}
              >
                SEND
              </button>
            </div>
          </form>
          {!isFocusMode && (
            <div className="flex justify-center gap-4 mt-4">
               <span className="text-[10px] font-bold text-[#4B5563] uppercase tracking-widest flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#4F46E5]"></div>
                Coordination Live
               </span>
               <span className="text-[10px] font-bold text-[#4B5563] uppercase tracking-widest flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></div>
                Refinement Sync
               </span>
            </div>
          )}
        </div>
      </main>

      {/* Right Sidebar: Context & Integrations */}
      <AnimatePresence>
        {!isFocusMode && !isRightSidebarCollapsed &&
          <motion.aside 
            key="right-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 288, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="h-full border-l border-[#2A2E37] bg-[#121418] flex flex-col overflow-hidden shrink-0"
          >
          <div className="p-6 flex-1 overflow-y-auto space-y-8">
            <div className="flex items-center gap-4 border-b border-[#2A2E37] pb-4">
              <button 
                onClick={() => setActiveRightTab('context')}
                className={cn(
                  "text-[10px] uppercase tracking-[0.3em] font-bold transition-all",
                  activeRightTab === 'context' ? "text-white" : "text-[#6B7280] hover:text-[#9CA3AF]"
                )}
              >
                Resident Context
              </button>
              <button 
                onClick={() => setActiveRightTab('gallery')}
                className={cn(
                  "text-[10px] uppercase tracking-[0.3em] font-bold transition-all",
                  activeRightTab === 'gallery' ? "text-white" : "text-[#6B7280] hover:text-[#9CA3AF]"
                )}
              >
                Visions
              </button>
            </div>
            
            {activeRightTab === 'context' &&
              <div className="space-y-8">
                {/* App Integrations */}
                <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                  <span className="text-[#9CA3AF]">Notion</span>
                  <span className={cn(isNotionConnected ? "text-indigo-400" : "text-amber-500")}>
                    {isNotionConnected ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <div className="bg-[#0F1115] rounded-xl p-4 border border-[#2A2E37] shadow-inner">
                  {isNotionConnected ? (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-[#4F46E5] animate-pulse"></div>
                        <span className="text-[11px] font-semibold text-[#F3F4F6]">Systems Synchronized</span>
                      </div>
                      <div className="h-1.5 w-full bg-[#1F2937] rounded-full overflow-hidden">
                        <div className="h-full bg-[#4F46E5] w-[100%] rounded-full shadow-[0_0_8px_rgba(79,70,229,0.5)]"></div>
                      </div>
                    </>
                  ) : (
                    <button 
                      onClick={() => setShowSettings(true)}
                      className="w-full py-2 bg-[#1F2937] border border-[#374151] rounded-lg text-[10px] font-bold text-[#9CA3AF] hover:text-white transition-colors"
                    >
                      CONNECT NOW
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                  <span className="text-[#9CA3AF]">Google</span>
                  <span className={cn(isGoogleConnected ? "text-emerald-400" : "text-amber-500")}>
                    {isGoogleConnected ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <div className="bg-[#0F1115] rounded-xl p-4 border border-[#2A2E37] shadow-inner">
                  {isGoogleConnected ? (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></div>
                        <span className="text-[11px] font-semibold text-[#F3F4F6]">Apps Integrated</span>
                      </div>
                      <div className="flex gap-1">
                        <div className="h-1 flex-1 bg-[#10B981]/40 rounded-full"></div>
                        <div className="h-1 flex-1 bg-[#10B981]/40 rounded-full"></div>
                        <div className="h-1 flex-1 bg-[#10B981]/40 rounded-full"></div>
                      </div>
                    </>
                  ) : (
                    <button 
                      onClick={() => setShowSettings(true)}
                      className="w-full py-2 bg-[#1F2937] border border-[#374151] rounded-lg text-[10px] font-bold text-[#9CA3AF] hover:text-white transition-colors"
                    >
                      CONNECT NOW
                    </button>
                  )}
                </div>
              </div>

              {/* Task Delegation Board */}
              <div className="space-y-4 pt-4 border-t border-[#2A2E37]">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#6B7280] font-bold">Active Requests</h2>
                  <div className="flex items-center gap-1">
                    <div className="px-1.5 py-0.5 bg-[#4F46E5]/10 rounded-md text-[9px] font-black text-[#4F46E5]">
                      {tasks.filter(t => t.status !== 'completed').length} LIVE
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {tasks.length === 0 ? (
                    <div className="p-6 border border-dashed border-[#2A2E37] rounded-2xl text-center text-[10px] text-[#6B7280] italic">
                      No active tasks delegated.
                    </div>
                  ) : (
                    tasks.slice(0, 5).map(task => {
                      const assignee = allAgents.find(a => a.id === task.assigneeId);
                      return (
                        <div key={task.id} className="group bg-[#0F1115] border border-[#2A2E37] rounded-2xl p-4 transition-all hover:border-[#4F46E5]/40 hover:bg-[#16191F]">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex flex-col gap-1.5 flex-1">
                               <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => updateTaskStatus(task.id, task.status === 'completed' ? 'pending' : 'completed')}
                                    className="text-[#6B7280] hover:text-[#4F46E5] transition-colors"
                                  >
                                    {task.status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" /> : <Circle className="w-3.5 h-3.5" />}
                                  </button>
                                  <h3 className={cn("text-[11px] font-bold leading-tight group-hover:text-white transition-colors", task.status === 'completed' ? "line-through text-[#6B7280]" : "text-[#D1D5DB]")}>
                                    {task.title}
                                  </h3>
                               </div>
                               <div className="flex items-center gap-2 ml-5">
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest",
                                    task.category === 'Logistics' ? "bg-amber-500/10 text-amber-500" :
                                    task.category === 'Community' ? "bg-emerald-500/10 text-emerald-500" :
                                    "bg-indigo-500/10 text-indigo-500"
                                  )}>
                                    {task.category || 'Operations'}
                                  </span>
                               </div>
                            </div>
                            <div className="w-5 h-5 rounded-lg bg-[#1F2937] flex items-center justify-center text-[10px] overflow-hidden" title={assignee?.name}>
                              <Avatar 
                                avatar={assignee?.avatar || '🤖'} 
                                url={assignee?.avatarUrl}
                                className="w-full h-full flex items-center justify-center" 
                              />
                            </div>
                          </div>
                          <p className="text-[9px] text-[#6B7280] leading-normal line-clamp-2 mb-3 px-5">
                            {task.description}
                          </p>
                          <div className="flex items-center justify-between px-5">
                            <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest text-[#4B5563]">
                              <Clock className="w-2.5 h-2.5" />
                              {task.deadline ? new Date(task.deadline).toLocaleDateString() : 'No Deadline'}
                            </div>
                        <div className={cn(
                          "px-2 py-0.5 rounded-full text-[8px] font-black tracking-tighter uppercase",
                          task.status === 'completed' ? "bg-emerald-900/20 text-emerald-500" :
                          task.status === 'in_progress' ? "bg-blue-900/20 text-blue-500" :
                          task.status === 'blocked' ? "bg-red-900/20 text-red-500 animate-pulse" :
                          "bg-[#1F2937] text-[#9CA3AF]"
                        )}>
                          {task.status}
                        </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {tasks.length > 5 && (
                    <button className="w-full py-2 text-[9px] font-black text-[#6B7280] uppercase tracking-widest hover:text-[#4F46E5] transition-colors">
                      View All {tasks.length} Tasks
                    </button>
                  )}
                </div>
              </div>

              {/* ADHD Focus Assist */}
              <div className="pt-4">
                <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#F59E0B] font-bold mb-4">Resident Focus</h2>
                <div className="bg-[#B45309]/10 border border-[#B45309]/30 rounded-2xl p-5 shadow-inner">
                  <div className="flex -space-x-2 mb-4">
                    {allAgents.filter(a => selectedAgentIds.includes(a.id)).map(a => (
                      <div key={a.id} className="w-8 h-8 rounded-full bg-[#16191F] border-2 border-[#1F2937] flex items-center justify-center text-sm overflow-hidden" title={a.name}>
                        <Avatar 
                          avatar={a.avatar} 
                          url={a.avatarUrl}
                          className="w-full h-full flex items-center justify-center" 
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[#FBBF24]/80 leading-relaxed mb-3 italic font-medium">
                    "Sedia membantu, Boss. We are monitoring your AnchorCourt workspace and local services for you."
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-[#F59E0B] font-extrabold uppercase tracking-widest">
                    <Zap className="w-3 h-3" />
                    Resident Support: Active
                  </div>
                </div>
              </div>
            </div>
          </div>
        }

            {activeRightTab === 'gallery' &&
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  {messages.filter(m => m.content.includes('![](') || m.content.includes('![Generated Image](')).map((msg, idx) => {
                    const match = msg.content.match(/!\[.*?\]\((.*?)\)/);
                    if (!match) return null;
                    const imageUrl = match[1];
                    return (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={idx} 
                        className="aspect-square bg-[#0F1115] rounded-xl border border-[#2A2E37] overflow-hidden group/thumb cursor-pointer relative"
                        onClick={() => {
                           // Potential overlay logic here
                        }}
                      >
                        <img src={imageUrl} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-end p-2">
                           <p className="text-[8px] text-white font-bold truncate">Vision {idx + 1}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                  {messages.filter(m => m.content.includes('![](') || m.content.includes('![Generated Image](')).length === 0 && (
                    <div className="col-span-2 py-20 text-center space-y-4 opacity-20">
                      <ImageIcon className="w-8 h-8 mx-auto" />
                      <p className="text-[10px] font-bold uppercase tracking-widest">No visions synthesized</p>
                    </div>
                  )}
                </div>
              </div>
            }
          </div>

          {/* System Status Bar */}
          <div className="p-4 bg-[#16191F] border-t border-[#2A2E37] flex items-center justify-between text-[9px] font-bold text-[#6B7280] uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <div className={cn("w-1.5 h-1.5 rounded-full", (isNotionConnected || isGoogleConnected) ? "bg-emerald-500" : "bg-red-500")}></div>
              <span>{(isNotionConnected || isGoogleConnected) ? "Services Online" : "System Standby"}</span>
            </div>
            <div>COURT STATUS: CLEAR</div>
          </div>
        </motion.aside>
      }
      </AnimatePresence>

      {/* Admin Dashboard Modal */}
      <AnimatePresence>
        {showAdminDashboard && isAdmin && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAdminDashboard(false)} className="absolute inset-0 bg-[#0F1115]/95 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-4xl bg-[#16191F] border border-amber-900/30 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden">
              <div className="p-10 space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                       <div className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[9px] font-black text-amber-500 uppercase tracking-widest">Administrator Clearance</div>
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    </div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">AnchorCourt Intelligence Center</h2>
                  </div>
                  <button onClick={() => setShowAdminDashboard(false)} className="p-3 hover:bg-[#1F2937] rounded-full transition-colors text-[#6B7280]">
                    <X className="w-8 h-8" />
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Global Directives */}
                  <div className="space-y-6">
                    <div className="p-6 bg-[#1F2937] border border-[#2A2E37] rounded-3xl space-y-4">
                       <div className="flex items-center gap-3 text-amber-500">
                         <Shield className="w-5 h-5" />
                         <h3 className="text-sm font-bold uppercase tracking-widest">Global Directives</h3>
                       </div>
                       <p className="text-[11px] text-[#6B7280] leading-relaxed">
                         These instructions are injected into the Intelligence Core for ALL users. Set behavioral boundaries and cultural norms.
                       </p>
                       <textarea 
                         value={globalConfig.instructions}
                         onChange={(e) => setGlobalConfig({ ...globalConfig, instructions: e.target.value })}
                         placeholder="e.g. Always prioritize Malaysian Ringgit (MYR)..."
                         className="w-full h-[520px] bg-[#1F2937] border border-[#374151] rounded-2xl p-4 text-xs text-[#E5E7EB] focus:outline-none focus:border-amber-500/50 transition-all resize-none font-mono"
                       />
                    </div>
                  </div>

                  {/* Reference Knowledge */}
                  <div className="space-y-6">
                    <div className="p-6 bg-[#0F1115] border border-[#2A2E37] rounded-3xl space-y-4">
                       <div className="flex items-center gap-3 text-amber-500">
                         <Database className="w-5 h-5" />
                         <h3 className="text-sm font-bold uppercase tracking-widest">Knowledge Ingestion</h3>
                       </div>
                       <p className="text-[11px] text-[#6B7280] leading-relaxed">
                         Prime the Intelligence Core with custom documentation and asset references.
                       </p>

                       <input 
                         type="file" 
                         ref={fileInputRef} 
                         onChange={(e) => handleFileSelection(e.target.files)}
                         multiple
                         className="hidden" 
                       />

                       <div 
                         onDragOver={handleDragOver}
                         onDragLeave={handleDragLeave}
                         onDrop={handleDrop}
                         className={`border-2 border-dashed rounded-[2rem] transition-all flex flex-col items-center justify-center py-10 px-6 space-y-4 cursor-pointer group/drop ${
                           isDragging ? "border-amber-500 bg-amber-500/10" : "border-[#2A2E37] hover:border-amber-500/30 hover:bg-[#1F2937]/30"
                         }`}
                         onClick={() => fileInputRef.current?.click()}
                       >
                         <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                           isDragging ? "bg-amber-500 text-[#0F1115] scale-110" : "bg-[#1F2937] text-amber-500"
                         }`}>
                           <Upload className="w-6 h-6" />
                         </div>
                         <div className="text-center">
                           <span className="block text-xs font-black text-white uppercase tracking-widest">Deploy Assets</span>
                           <span className="block text-[10px] text-[#4B5563] mt-1">Drag files here or click to browse</span>
                         </div>
                       </div>
                       <div className="space-y-3">
                         <div className="flex gap-2">
                           <input 
                              value={fileInput}
                              onChange={(e) => setFileInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (fileInput.trim()) {
                                    setGlobalConfig(prev => ({ ...prev, referenceFiles: [...(prev.referenceFiles || []), fileInput.trim()] }));
                                    setFileInput('');
                                  }
                                }
                              }}
                              placeholder="URL or asset ID..."
                              className="flex-1 bg-[#1F2937] border border-[#374151] rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-all"
                           />
                           <button 
                             type="button"
                             onClick={() => {
                               if (fileInput.trim()) {
                                 setGlobalConfig(prev => ({ ...prev, referenceFiles: [...(prev.referenceFiles || []), fileInput.trim()] }));
                                 setFileInput('');
                               }
                             }}
                             className="p-2 bg-amber-500 hover:bg-amber-400 text-[#0F1115] rounded-xl transition-all cursor-pointer"
                           >
                             <Plus className="w-5 h-5 font-bold" />
                           </button>
                         </div>
                         <div className="flex-1 overflow-y-auto space-y-3 max-h-60 pr-2 custom-scrollbar">
                           {(globalConfig.referenceFiles || []).map((file, idx) => (
                             <div key={idx} className="group relative">
                               <div className="flex items-center justify-between p-4 bg-[#1F2937]/50 rounded-2xl border border-[#2A2E37] group-hover:border-amber-500/30 transition-all cursor-default">
                                 <div className="flex items-center gap-3 overflow-hidden">
                                   <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                                     <FileText className="w-4 h-4" />
                                   </div>
                             <div className="overflow-hidden">
                               <span className="block text-[11px] font-bold text-white truncate">{file}</span>
                               <span className="block text-[8px] text-emerald-500 font-black uppercase tracking-tighter">Live Reference</span>
                             </div>
                                 </div>
                                 <button 
                                   onClick={() => setGlobalConfig(prev => ({ ...prev, referenceFiles: (prev.referenceFiles || []).filter((_, i) => i !== idx) }))}
                                   className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                   title="Remove reference"
                                 >
                                   <Trash2 className="w-3.5 h-3.5" />
                                 </button>
                               </div>
                             </div>
                           ))}
                           {(!globalConfig.referenceFiles || globalConfig.referenceFiles.length === 0) && (
                             <div className="py-12 px-4 border border-dashed border-[#2A2E37] rounded-3xl text-center">
                               <div className="w-10 h-10 rounded-full bg-[#1F2937] flex items-center justify-center mx-auto mb-3">
                                 <HardDrive className="w-5 h-5 text-[#4B5563]" />
                               </div>
                               <p className="text-[10px] font-bold text-[#4B5563] uppercase tracking-widest leading-relaxed">System Memory Clear</p>
                               <p className="text-[8px] text-[#374151] mt-1">Add references to prime the Intelligence Core</p>
                             </div>
                           )}
                        </div>
                        <button 
                          onClick={saveGlobalConfig}
                          disabled={adminSaving}
                          className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:bg-[#1F2937] text-[#0F1115] disabled:text-[#4B5563] rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"
                        >
                           {adminSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                           {adminSaving ? 'SYNCING...' : 'TRIGGER CORE SYNC'}
                        </button>
                       </div>
                    </div>

                    <div className="p-6 bg-[#0F1115] border border-[#2A2E37] rounded-3xl space-y-4">
                       <div className="flex items-center gap-3 text-red-500">
                         <Zap className="w-5 h-5" />
                         <h3 className="text-sm font-bold uppercase tracking-widest">System Latency</h3>
                       </div>
                       <div className="grid grid-cols-2 gap-2">
                         <div className="p-3 bg-[#1F2937] rounded-xl">
                            <div className="text-[8px] text-[#6B7280] uppercase">Inference</div>
                            <div className="text-xs text-white font-mono">1.2s avg</div>
                         </div>
                         <div className="p-3 bg-[#1F2937] rounded-xl">
                            <div className="text-[8px] text-[#6B7280] uppercase">Tokens</div>
                            <div className="text-xs text-white font-mono">4.2k/min</div>
                         </div>
                       </div>
                    </div>
                  </div>

                  {/* User & Member Management */}
                  <div className="space-y-6">
                    <div className="p-6 bg-[#0F1115] border border-[#2A2E37] rounded-3xl space-y-4 flex flex-col h-full">
                       <div className="flex items-center gap-3 text-emerald-500">
                         <Users className="w-5 h-5" />
                         <h3 className="text-sm font-bold uppercase tracking-widest">Member Roster</h3>
                       </div>
                       <p className="text-[11px] text-[#6B7280] leading-relaxed">
                         Manage private profiles for members with special needs. Ensure agents understand how to interact.
                       </p>
                       <div className="flex-1 overflow-y-auto space-y-2 max-h-[360px] pr-2 custom-scrollbar">
                          {Object.values(profiles).length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 px-4 bg-[#0F1115] border border-[#2A2E37] rounded-3xl text-center space-y-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                <Users className="w-5 h-5" />
                              </div>
                              <div className="text-[10px] font-black uppercase text-[#6B7280] tracking-widest">No Members Registered</div>
                              <p className="text-[9px] text-[#4B5563] max-w-[160px]">Members appear here once they log into the AnchorCourt platform for the first time.</p>
                            </div>
                          ) : (
                            (Object.values(profiles) as PublicProfile[]).map(profile => (
                              <button 
                                key={profile.userId} 
                                onClick={() => setSelectedUserId(profile.userId)}
                                className="w-full p-3 bg-[#1F2937]/50 border border-[#2A2E37] rounded-2xl flex items-center justify-between hover:border-emerald-500/50 hover:bg-[#1F2937] transition-all group cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-[#121418] flex items-center justify-center text-emerald-500 font-bold text-sm ring-1 ring-emerald-500/20 group-hover:ring-emerald-500/40 transition-all relative overflow-hidden">
                                    <Avatar 
                                      avatar={profile.displayName.slice(0, 2).toUpperCase()} 
                                      url={profile.photoURL} 
                                      className="w-full h-full flex items-center justify-center" 
                                    />
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#1F2937] rounded-full"></div>
                                  </div>
                                  <div className="overflow-hidden">
                                    <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors truncate">{profile.displayName}</div>
                                    <div className="flex items-center gap-2">
                                      <div className="text-[9px] text-[#6B7280] truncate max-w-[80px]">{profile.email}</div>
                                      <div className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-[4px] text-[7px] font-black text-indigo-400 uppercase tracking-widest whitespace-nowrap">Neuro-Diverse Profile</div>
                                    </div>
                                  </div>
                                </div>
                                <div className="p-1.5 bg-emerald-500/0 group-hover:bg-emerald-500/20 text-[#6B7280] group-hover:text-emerald-500 rounded-lg transition-all">
                                  <ChevronRight className="w-4 h-4" />
                                </div>
                              </button>
                            ))
                          )}
                       </div>

                       <div className="pt-4 border-t border-[#2A2E37]">
                          <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                             <div className="flex items-center gap-2 mb-2">
                               <Info className="w-3.5 h-3.5 text-emerald-500" />
                               <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Roster Protocol</span>
                             </div>
                             <p className="text-[9px] text-[#6B7280] leading-relaxed">
                               Editing a profile here updates the "Handling Notes" for that specific user ID across all threads.
                             </p>
                          </div>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-amber-900/20">
                  <button 
                    onClick={() => setShowAdminDashboard(false)}
                    className="px-8 py-3 rounded-2xl text-xs font-bold text-[#6B7280] hover:bg-[#1F2937] hover:text-[#E5E7EB] transition-all"
                  >
                    DISCARD
                  </button>
                  <button 
                    onClick={saveGlobalConfig}
                    disabled={adminSaving}
                    className="px-10 py-3 bg-amber-500 hover:bg-amber-400 text-[#0F1115] rounded-2xl text-xs font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_12px_24px_-8px_rgba(245,158,11,0.4)] flex items-center gap-2"
                  >
                    {adminSaving ? <Loader2 className="w-4 h-4 animate-spin text-[#0F1115]" /> : <Shield className="w-4 h-4" />}
                    {adminSaving ? 'COMMITTING...' : 'COMMIT CORE PROTOCOLS'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

          <AnimatePresence>
            {selectedUserId && (
              <MemberProfileModal 
                isOpen={!!selectedUserId}
                onClose={() => setSelectedUserId(null)}
                config={adminMemberConfig}
                onSave={adminSaveMemberConfig}
                loading={adminMemberConfigLoading}
                saving={adminMemberConfigSaving}
                error={null}
                userId={selectedUserId || undefined}
                photoURL={selectedUserId ? profiles[selectedUserId]?.photoURL : undefined}
                isAdminView={true}
                memberName={selectedUserId ? profiles[selectedUserId]?.displayName : undefined}
              />
            )}
          </AnimatePresence>
     
           <AnimatePresence>
            {showMemberProfileModal && (
              <MemberProfileModal 
                isOpen={showMemberProfileModal}
                onClose={() => setShowMemberProfileModal(false)}
                config={memberConfig}
                onSave={saveMemberConfig}
                loading={memberConfigLoading}
                saving={memberConfigSaving}
                error={memberConfigError}
                userId={user?.uid}
                photoURL={user?.uid ? profiles[user.uid]?.photoURL : undefined}
              />
            )}
          </AnimatePresence>

      <ImageStudio 
        isOpen={showImageStudio}
        onClose={() => setShowImageStudio(false)}
        onSaveToThread={handleSaveStudioResult}
      />

      <BriefingModal
        isOpen={showBriefingModal}
        onClose={() => setShowBriefingModal(false)}
        summary={briefingContent}
        loading={briefingLoading}
      />
    </div>
    </div>
  );
}
