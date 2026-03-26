export type PanelMode = 'voice' | 'chat';
export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
};

export const voiceStates: Record<
  VoiceState,
  {
    label: string;
    hint: string;
  }
> = {
  idle: {
    label: 'tap to start live chat',
    hint: 'tap to start live chat',
  },
  listening: {
    label: 'listening',
    hint: 'listening',
  },
  thinking: {
    label: 'thinking',
    hint: 'thinking',
  },
  speaking: {
    label: 'speaking',
    hint: 'speaking',
  },
};

export const nextVoiceState: Record<VoiceState, VoiceState> = {
  idle: 'listening',
  listening: 'thinking',
  thinking: 'speaking',
  speaking: 'idle',
};

export const mockConversation: ChatMessage[] = [
  {
    id: 'm1',
    role: 'assistant',
    text: 'Ask about this page or anything on the web. Voice stays first, but text is always here when you need it.',
    meta: 'Opening note',
  },
  {
    id: 'm2',
    role: 'user',
    text: 'Can you tell me what this page is about?',
    meta: 'Current tab',
  },
  {
    id: 'm3',
    role: 'assistant',
    text: 'That flow will stay seamless. The agent should only pull page context when the question actually needs it.',
    meta: 'Planned behavior',
  },
];
