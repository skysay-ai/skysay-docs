"""Configure Claude Agent SDK for one read-only Skysay tool."""
import argparse
import asyncio
import os
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, ResultMessage, query

URL = 'https://api.skysay.ai/mcp/read-only'

def options():
    return ClaudeAgentOptions(
        mcp_servers={'skysay': {'type': 'http', 'url': URL,
            'headers': {'Authorization': f"Bearer {os.environ['SKYSAY_API_KEY']}"}}},
        tools=[],  # No built-in shell, file, browser or search tools.
        allowed_tools=['mcp__skysay__account_overview'],
        setting_sources=[],  # Do not inherit project or user tool configuration.
        max_turns=3,
    )

async def main(ask_model=False):
    if ask_model:
        async for message in query(prompt='Use account_overview to confirm my Skysay workspace is accessible. Do not repeat private account details.', options=options()):
            if isinstance(message, ResultMessage):
                if message.is_error:
                    raise RuntimeError('Agent run failed; inspect authentication and tool permissions privately.')
                print(message.result)
        return
    async with ClaudeSDKClient(options=options()) as client:
        # The CLI can report pending while its HTTP handshake finishes.
        deadline = asyncio.get_running_loop().time() + 20
        while True:
            status = await client.get_mcp_status()
            server = next((s for s in status.get('mcpServers', []) if s['name'] == 'skysay'), None)
            if server and server['status'] == 'connected':
                break
            if server and server['status'] not in ('pending',):
                raise RuntimeError('MCP connection refused; check authentication and the workspace key.')
            if asyncio.get_running_loop().time() >= deadline:
                raise RuntimeError('MCP connection timed out; check network and client authentication.')
            await asyncio.sleep(0.2)
        print('Connected: Skysay MCP registered. Run the OpenAI probe to verify a tool result without a model request.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--ask-model', action='store_true', help='Optional Claude request: requires a supported Claude API account and may incur model charges.')
    asyncio.run(main(parser.parse_args().ask_model))
