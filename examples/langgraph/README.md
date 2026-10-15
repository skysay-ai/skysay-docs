# Skysay from LangGraph

A deterministic LangGraph node calls exactly one read-only MCP tool. It does
not need an LLM key and does not place a call, send an SMS or buy a number.

Use Python 3.13 and uv in this directory:

```sh
uv venv --python 3.13.13
uv pip sync --require-hashes requirements.lock
# Supply SKYSAY_API_KEY through your secret manager or a silent prompt.
uv run --no-sync python verify_connection.py
```

The workspace key needs `account:read`. The URL is fixed to
`https://api.skysay.ai/mcp/read-only`; do not put a key in source or a URL.
The requirements lock pins all transitive packages, with hashes.

The printed success means the MCP tool returned successfully, not that a
phone line is activated. No account payload is printed or kept in graph state.
API errors fail the graph; the executable prints only a generic error.

Guide: https://skysay.ai/docs/langgraph (published only after its PR is approved).
