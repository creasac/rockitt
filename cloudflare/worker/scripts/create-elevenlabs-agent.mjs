import {
  buildElevenLabsAgentBody,
  elevenLabsApiBaseUrl,
  getElevenLabsAgentSettings,
  readElevenLabsErrorMessage,
} from './lib/elevenlabs-agent-config.mjs';

const apiKey = process.env.ELEVENLABS_API_KEY;

if (!apiKey) {
  console.error('Set ELEVENLABS_API_KEY before creating the agent.');
  process.exit(1);
}

const { voiceLabel } = getElevenLabsAgentSettings();

const response = await fetch(`${elevenLabsApiBaseUrl}/convai/agents/create`, {
  body: JSON.stringify(buildElevenLabsAgentBody()),
  headers: {
    'Content-Type': 'application/json',
    'xi-api-key': apiKey,
  },
  method: 'POST',
});

const payload = await response.json().catch(() => null);

if (!response.ok) {
  console.error(
    readElevenLabsErrorMessage(
      payload,
      `Unable to create the ElevenLabs agent (${response.status}).`,
    ),
  );
  process.exit(1);
}

const agentId = payload?.agent_id || payload?.agentId || payload?.agent?.agent_id;

if (!agentId) {
  console.error('ElevenLabs did not return an agent ID.');
  process.exit(1);
}

console.log(`Created ElevenLabs agent ${agentId}`);
console.log(`Set ELEVENLABS_AGENT_ID=${agentId} in your Worker vars.`);
console.log(`Voice label: ${voiceLabel}`);
