"""Run one scoped Skysay read from a LangGraph node. No model or paid action."""
import asyncio
import os
from typing import TypedDict

from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph import END, START, StateGraph

URL = "https://api.skysay.ai/mcp/read-only"


class State(TypedDict):
    connection_verified: bool


async def verify_connection(_state: State) -> State:
    key = os.environ.get("SKYSAY_API_KEY")
    if not key:
        raise RuntimeError("Set SKYSAY_API_KEY securely before running the graph.")
    client = MultiServerMCPClient({
        "skysay": {
            "transport": "streamable_http",
            "url": URL,
            "headers": {"Authorization": f"Bearer {key}"},
        }
    }, handle_tool_errors=False)
    tools = await client.get_tools()
    matches = [tool for tool in tools if tool.name == "account_overview"]
    if len(matches) != 1:
        raise RuntimeError("Expected one account_overview tool; check the endpoint and scope.")
    # Invoke only this allowlisted read. Do not print or persist the account payload.
    await matches[0].ainvoke({})
    return {"connection_verified": True}


def build_graph():
    builder = StateGraph(State)
    builder.add_node("verify_connection", verify_connection)
    builder.add_edge(START, "verify_connection")
    builder.add_edge("verify_connection", END)
    return builder.compile()


async def main():
    result = await build_graph().ainvoke({"connection_verified": False})
    if result["connection_verified"] is not True:
        raise RuntimeError("Connection check did not complete.")
    print("Verified: LangGraph completed a scoped Skysay account read. No call or SMS sent.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception:
        # Avoid printing a dependency exception that might contain auth or account data.
        raise SystemExit("Connection failed. Check the endpoint, account:read scope and key privately.") from None
