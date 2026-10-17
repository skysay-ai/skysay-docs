"""Inspect Skysay through OpenAI Agents SDK. Default mode makes no model call."""
import argparse
import asyncio
import os
from agents import Agent, Runner, set_tracing_disabled
from agents.mcp import MCPServerStreamableHttp, create_static_tool_filter

URL = 'https://api.skysay.ai/mcp/read-only'

def connection_params():
    return {'url': URL, 'headers': {'Authorization': f"Bearer {os.environ['SKYSAY_API_KEY']}"}, 'timeout': 15}

async def main(ask_model=False):
    set_tracing_disabled(True)  # Account/tool content must not enter hosted traces.
    async with MCPServerStreamableHttp(name='skysay', params=connection_params(),
            tool_filter=create_static_tool_filter(allowed_tool_names=['account_overview']),
            max_retry_attempts=0) as server:
        tools = await server.list_tools()
        if [tool.name for tool in tools] != ['account_overview']:
            raise RuntimeError('Expected the account_overview tool; check the endpoint and permissions.')
        result = await server.call_tool('account_overview', {})
        if result.is_error:
            raise RuntimeError('Account read refused; check account:read and the workspace credential.')
        print('Connected: account_overview succeeded. No phone action was performed.')
        if ask_model:
            agent = Agent(name='Workspace reader',
                instructions='Use account_overview to confirm the workspace is accessible. Do not repeat private account details.',
                mcp_servers=[server])
            response = await Runner.run(agent, 'Confirm that my Skysay workspace is accessible.', max_turns=3)
            print(response.final_output)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--ask-model', action='store_true', help='Optional model request: requires OPENAI_API_KEY and may incur model charges.')
    asyncio.run(main(parser.parse_args().ask_model))
