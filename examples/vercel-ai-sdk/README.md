# Skysay with Vercel AI SDK

Node 22 or newer. Run `npm ci` in this directory; the lockfile pins the
example's dependencies, including @ai-sdk/mcp 2.0.77 and ai 7.0.142.

Set SKYSAY_API_KEY securely in the launching environment. The key needs
account:read. Then run:

```bash
npm run verify
```

The sample connects to https://api.skysay.ai/mcp/read-only, discovers tools,
executes only account_overview and prints a generic success line. It does not
print the returned workspace information or contact a model provider. It does
not place a call, send SMS or buy a number. No Vercel deployment is required.

## Optional model-mediated read

Configure your own AI_GATEWAY_API_KEY and AI_SDK_MODEL (an available model ID
in your AI Gateway account), then run:

```bash
node verify-connection.mjs --ask-model
```

This requests model inference through Vercel AI Gateway and may incur model
charges. Only account_overview is exposed to the model; one generation step
is allowed. The program reports success only if the SDK receives the expected
tool result. It prints neither model text nor private tool output. Run on a
server, never in a browser bundle. Do not enable request/tool tracing without
reviewing the data it records. Provider credentials and the Skysay key are
separate.

The optional hosted model path has not been verified with a paid provider.
`npm test` uses the real pinned AI SDK with a deterministic model stub and a
local MCP protocol fixture. The sample was also exercised against the actual
local Skysay handler with disposable credentials, without model/phone usage.

For real phone actions, follow https://skysay.ai/docs/make-first-outbound-call,
https://skysay.ai/docs/receive-inbound-calls and
https://skysay.ai/docs/send-sms. Those need their own capabilities, permissions,
funding and approval. Changing the URL or tool allowlist is not a safe approval
system. This example deliberately implements no billable action.
