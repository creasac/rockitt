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
    label: 'Ready',
    hint: 'Tap to begin a live voice session.',
  },
  listening: {
    label: 'Listening',
    hint: 'The orb is active and waiting for your question.',
  },
  thinking: {
    label: 'Thinking',
    hint: 'This is where the agent will reason over fetched context.',
  },
  speaking: {
    label: 'Replying',
    hint: 'Voice answers will land here once ElevenLabs is wired in.',
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
