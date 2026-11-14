import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { verifyConnection, SUCCESS } from './verify-connection.mjs';

const key = 'dummy-test-workspace-key';

async function fixture(t, { missingTool = false, toolError = false, rpcError = false } = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    calls.push(message);
    if (req.headers.authorization !== `Bearer ${key}`) {
      res.writeHead(401).end();
      return;
    }
    if (message.id === undefined) { res.writeHead(202).end(); return; }
    let result;
    if (message.method === 'initialize') {
      result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'test', version: '1' } };
    } else if (message.method === 'tools/list') {
      const tool = name => ({ name, description: `Test ${name}`, inputSchema: { type: 'object', properties: {}, additionalProperties: false } });
      result = { tools: missingTool ? [tool('other_tool')] : [tool('account_overview'), tool('other_tool')] };
    } else if (message.method === 'tools/call') {
      assert.equal(message.params.name, 'account_overview');
      assert.deepEqual(message.params.arguments, {});
      if (rpcError) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'Test tool failure' } }));
        return;
      }
      result = { content: [{ type: 'text', text: 'Private test workspace details' }], isError: toolError };
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unknown test method' } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { url: `http://127.0.0.1:${server.address().port}/mcp/read-only`, calls };
}

test('pinned MCP adapter executes only the allowed read and discards private content', async t => {
  const { url, calls } = await fixture(t);
  assert.equal(await verifyConnection({ key, url }), SUCCESS);
  assert.equal(calls.filter(c => c.method === 'tools/call').length, 1);
});

test('invalid key fails without a tool invocation', async t => {
  const { url, calls } = await fixture(t);
  await assert.rejects(verifyConnection({ key: 'dummy-invalid-key', url }));
  assert.ok(calls.length > 0, 'fixture must observe the refused request');
  assert.equal(calls.filter(c => c.method === 'tools/call').length, 0);
});

test('missing key is rejected before any connection', async () => {
  await assert.rejects(verifyConnection({ key: '', url: 'http://127.0.0.1:1' }));
});

test('missing expected tool cannot silently select another tool', async t => {
  const { url, calls } = await fixture(t, { missingTool: true });
  await assert.rejects(verifyConnection({ key, url }));
  assert.equal(calls.filter(c => c.method === 'tools/call').length, 0);
});

test('MCP tool error is not successful connection acceptance', async t => {
  const { url } = await fixture(t, { toolError: true });
  await assert.rejects(verifyConnection({ key, url }));
});

function model(content) {
  return new MockLanguageModelV4({ doGenerate: {
    content,
    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
    warnings: [],
  } });
}

test('AI SDK dispatches a deterministic model tool call through MCP without provider traffic', async t => {
  const { url, calls } = await fixture(t);
  const stub = model([{ type: 'tool-call', toolCallId: 'test-call', toolName: 'account_overview', input: '{}' }]);
  assert.equal(await verifyConnection({ key, url, model: stub }), SUCCESS);
  assert.equal(stub.doGenerateCalls.length, 1);
  assert.deepEqual(stub.doGenerateCalls[0].tools.map(tool => tool.name), ['account_overview']);
  assert.equal(calls.filter(c => c.method === 'tools/call').length, 1);
});

test('model text alone is not proof of a tool result', async t => {
  const { url } = await fixture(t);
  await assert.rejects(verifyConnection({ key, url, model: model([{ type: 'text', text: 'Connected!' }]) }));
});

test('model tool errors do not count as acceptance', async t => {
  const { url } = await fixture(t, { toolError: true });
  const stub = model([{ type: 'tool-call', toolCallId: 'test-call', toolName: 'account_overview', input: '{}' }]);
  await assert.rejects(verifyConnection({ key, url, model: stub }));
});

test('JSON-RPC tool errors fail both the direct and model-mediated paths', async t => {
  const { url } = await fixture(t, { rpcError: true });
  await assert.rejects(verifyConnection({ key, url }));
  const stub = model([{ type: 'tool-call', toolCallId: 'test-call', toolName: 'account_overview', input: '{}' }]);
  await assert.rejects(verifyConnection({ key, url, model: stub }));
});

test('CLI fails privately with absent configuration', () => {
  const result = spawnSync(process.execPath, ['verify-connection.mjs'], {
    cwd: import.meta.dirname, encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^Connection failed\./);
  assert.doesNotMatch(result.stderr, /Error:|Bearer|stack|Private test/);
});
