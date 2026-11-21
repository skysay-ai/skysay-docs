import { createMCPClient } from '@ai-sdk/mcp';
import { generateText, stepCountIs } from 'ai';
import { pathToFileURL } from 'node:url';

const URL = 'https://api.skysay.ai/mcp/read-only';
export const SUCCESS = 'Verified: Vercel AI SDK completed a scoped Skysay account read. No call or SMS sent.';

// Dependency injection is for local acceptance; the CLI always uses the fixed HTTPS URL.
export async function verifyConnection({
  key = process.env.SKYSAY_API_KEY,
  url = URL,
  model,
} = {}) {
  if (!key?.trim()) throw new Error('A scoped Skysay key is required.');
  const client = await createMCPClient({
    transport: { type: 'http', url, headers: { Authorization: `Bearer ${key}` } },
    initializationOptions: { timeout: 15000 },
    maxRetries: 0,
  });
  try {
    const discovered = await client.tools();
    if (!Object.hasOwn(discovered, 'account_overview')) {
      throw new Error('Expected account_overview; verify the MCP resource and scope.');
    }
    const account = discovered.account_overview;
    if (model) {
      const result = await generateText({
        model,
        tools: { account_overview: account },
        toolChoice: { type: 'tool', toolName: 'account_overview' },
        stopWhen: stepCountIs(1),
        maxOutputTokens: 256,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(30000),
        prompt: 'Use account_overview once to verify this workspace. Do not repeat account details.',
      });
      const outputs = result.steps.flatMap(step => step.toolResults);
      if (outputs.length !== 1 || outputs[0].toolName !== 'account_overview' || outputs[0].output?.isError) {
        throw new Error('The model did not complete the expected account read.');
      }
    } else {
      const result = await account.execute({}, { toolCallId: 'connection-check', messages: [], abortSignal: AbortSignal.timeout(15000) });
      if (result?.isError) throw new Error('Skysay refused the account read.');
    }
    // Do not return or log tool content, credentials, model text or account details.
    return SUCCESS;
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 1 && args[0] === '--ask-model')) throw new Error('Unknown argument.');
    const askModel = args[0] === '--ask-model';
    if (askModel && (!process.env.AI_SDK_MODEL || !process.env.AI_GATEWAY_API_KEY)) {
      throw new Error('Configure the optional model separately.');
    }
    console.log(await verifyConnection({ model: askModel ? process.env.AI_SDK_MODEL : undefined }));
  } catch {
    // Raw transport/provider exceptions can contain private response data.
    console.error('Connection failed. Check the key, account:read scope, endpoint and optional model settings privately.');
    process.exitCode = 1;
  }
}
