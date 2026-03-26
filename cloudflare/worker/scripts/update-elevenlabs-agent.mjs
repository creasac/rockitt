import {
  buildElevenLabsAgentBody,
  elevenLabsApiBaseUrl,
  getElevenLabsAgentSettings,
  readElevenLabsErrorMessage,
} from './lib/elevenlabs-agent-config.mjs';

const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_ID;
const branchId = process.env.ELEVENLABS_AGENT_BRANCH_ID?.trim();

if (!apiKey) {
  console.error('Set ELEVENLABS_API_KEY before updating the agent.');
  process.exit(1);
}

if (!agentId) {
  console.error('Set ELEVENLABS_AGENT_ID before updating the agent.');
  process.exit(1);
}

const { voiceLabel } = getElevenLabsAgentSettings();
const search = new URLSearchParams();

if (branchId) {
  search.set('branch_id', branchId);
}

const response = await fetch(
  `${elevenLabsApiBaseUrl}/convai/agents/${agentId}${search.size ? `?${search.toString()}` : ''}`,
  {
    body: JSON.stringify(buildElevenLabsAgentBody()),
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    method: 'PATCH',
  },
);

const payload = await response.json().catch(() => null);

if (!response.ok) {
  console.error(
    readElevenLabsErrorMessage(
      payload,
      `Unable to update the ElevenLabs agent (${response.status}).`,
    ),
  );
  process.exit(1);
}

console.log(`Updated ElevenLabs agent ${agentId}`);

if (branchId) {
  console.log(`Branch: ${branchId}`);
}

console.log(`Voice label: ${voiceLabel}`);
