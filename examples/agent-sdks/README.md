# Skysay with OpenAI Agents SDK and Claude Agent SDK

These public samples start on `https://api.skysay.ai/mcp/read-only`, using a
workspace API key with `account:read`. Store `SKYSAY_API_KEY` in your local
process environment or secret manager; never put it in the source or a chat.
This is a scoped workspace read, not a phone call or number purchase.

Use Python 3.13 and uv:

```sh
uv venv --python 3.13.13
uv pip sync --require-hashes requirements.lock
uv run --no-sync python openai_agent.py
uv run --no-sync python claude_agent.py
```

The OpenAI probe initializes the real MCP connection and calls
`account_overview` without an OpenAI key or model request. The Claude probe
registers the configured HTTP server through Claude Agent SDK and checks its
connection status. It does **not** prove that Claude used a tool. The bundled
Claude CLI may require supported account authentication to initialize.

Optional model-mediated read (model charges can apply):

```sh
# Configure OPENAI_API_KEY securely first.
uv run --no-sync python openai_agent.py --ask-model
# Configure a supported Claude API/provider account securely first.
uv run --no-sync python claude_agent.py --ask-model
```

The transport tests were run against an actual local Skysay handler with a
synthetic workspace and disposable key. No hosted credentials, model requests,
calls, SMS or number purchases were used. Model-mediated runs remain untested.

See the public guides:
- https://skysay.ai/docs/openai-agents-sdk
- https://skysay.ai/docs/claude-agent-sdk
- https://skysay.ai/docs/regulated-numbers

Do not change the endpoint to enable writes as part of initial setup. Review
capabilities, verification, scopes, prices and explicit recipient/action approval
before separately enabling paid actions. An SDK tool allowlist limits model tool
use; it does not grant Skysay permissions or replace an application approval flow.
