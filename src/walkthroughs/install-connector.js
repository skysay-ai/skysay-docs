// Connect an AI assistant to Skysay's hosted MCP server: one tab per client,
// API key or OAuth. The steps follow quickstart, claude-code, codex and
// grok-bot; the key dialog and consent screen use the workspace's own wording.

const RO = "https://api.skysay.ai/mcp/read-only";
const FULL = "https://api.skysay.ai/mcp";
const PROMPT = "Use Skysay account_overview and summarize the result.\nDo not perform writes, place calls or send SMS.";

const NAMES = { claude: "Claude Code", codex: "Codex", grok: "Grok Bot" };

function createKey(client) {
  const keyName = { claude: "Claude Code read-only", codex: "Codex read-only", grok: "Grok Bot read" }[client];
  const main = [
    {
      type: "fields",
      fields: [{ label: "Key name", value: keyName, hint: "An example name. Any label works." }],
    },
    {
      type: "checks",
      label: "Scopes",
      items: [
        {
          text: "account:read",
          mono: true,
          checked: true,
          detail: "Workspace profile, activation state, and the signed-in user.",
        },
        {
          text: "all-read",
          mono: true,
          checked: false,
          tag: "not for this check",
          detail: "Every customer-grantable read scope, including scopes added later.",
        },
        {
          text: "calls:write",
          mono: true,
          checked: false,
          tag: "later, if approved",
          detail: "Place and cancel calls, including web calls.",
        },
      ],
    },
    { type: "hint", text: "The full token is shown once at creation; revoke is immediate." },
    { type: "buttons", items: [{ text: "Create key", primary: true }] },
  ];
  const side =
    client === "grok"
      ? {
          label: "In Grok Bot",
          title: "Only in a secure credential field",
          blocks: [
            { type: "value", label: "Credential header", value: "Authorization: Bearer YOUR_SKYSAY_API_KEY" },
            {
              type: "list",
              label: "Where the key goes",
              ordered: true,
              items: [
                "Into the connection's secure credential field, and nowhere else.",
                "This connects an existing workspace. It is not a sign-up route; OAuth clients don't need it.",
              ],
            },
            {
              type: "status",
              tone: "warn",
              lines: [
                "Never paste the key into the chat or commit it. If the connection can't take it securely, use OAuth or a supported client instead.",
              ],
            },
          ],
        }
      : {
          label: "In your assistant",
          title: "Keep the key out of the chat",
          blocks: [
            { type: "copy", label: "Environment variable", value: "SKYSAY_API_KEY" },
            {
              type: "list",
              label: "Where the key goes",
              ordered: true,
              items: [
                "Keep the value in your local secret store or the `SKYSAY_API_KEY` environment variable.",
                `Set it in the environment of the process that launches ${NAMES[client]}.`,
                ...(client === "codex"
                  ? [
                      "A terminal export reaches only programs started from that terminal. For an app launched from Finder, use OAuth instead.",
                    ]
                  : []),
              ],
            },
            {
              type: "status",
              tone: "warn",
              lines: [
                "Never paste the key into a prompt, commit it or show it in a screenshot. A program that can read your environment can read it too.",
              ],
            },
          ],
        };
  return {
    label: "Get a key",
    title: "Create a key in Skysay",
    intro: "In your workspace, open **API keys** and choose **New API key**. For the first check, select only `account:read`.",
    main,
    side,
  };
}

function addServer(client, oauth) {
  if (client === "claude") {
    const main = oauth
      ? [
          { type: "code", label: "Terminal", code: `claude mcp add --transport http skysay ${RO}` },
          {
            type: "hint",
            text: "Then start Claude Code, open `/mcp`, select Skysay and follow its authentication flow.",
          },
        ]
      : [
          {
            type: "code",
            label: ".mcp.json",
            code: `{\n  "mcpServers": {\n    "skysay": {\n      "type": "http",\n      "url": "${RO}",\n      "headers": {\n        "Authorization": "Bearer \${SKYSAY_API_KEY}"\n      }\n    }\n  }\n}`,
          },
          {
            type: "hint",
            text: "The `type` field is required: a URL-only entry is not an HTTP server. The variable reference stays literal; the file holds no key.",
          },
        ];
    return {
      label: "Add the connector",
      title: oauth ? "Add the connector" : "Add the connector to .mcp.json",
      intro: oauth
        ? "Without an API-key entry, add the read-only server from your terminal:"
        : "In the project where you run Claude Code, merge this entry into `.mcp.json`. Keep any other server entries.",
      main,
      side: {
        label: "In Claude Code",
        title: "Approve only the right entry",
        blocks: [
          { type: "copy", label: "Server URL", value: RO },
          ...(oauth ? [] : [{ type: "value", label: "Header", value: "Authorization: Bearer ${SKYSAY_API_KEY}" }]),
          {
            type: "list",
            label: "Check",
            items: oauth
              ? [
                  "Use one method: don't combine this entry with another one named `skysay`.",
                  "If you configured one before, update or remove it using its original scope first.",
                ]
              : [
                  "The URL is exactly the read-only address above.",
                  "The header references `${SKYSAY_API_KEY}`.",
                  "Don't approve an untrusted project entry that sends that variable to another host.",
                ],
          },
        ],
      },
    };
  }
  if (client === "codex") {
    const main = oauth
      ? [{ type: "code", label: "Terminal", code: `codex mcp add skysay --url ${RO}\ncodex mcp login skysay --scopes account:read` }]
      : [
          {
            type: "code",
            label: "Terminal",
            code: `codex mcp add skysay --url ${RO} \\\n  --bearer-token-env-var SKYSAY_API_KEY`,
          },
          { type: "hint", text: "or" },
          {
            type: "code",
            label: "config.toml",
            code: `[mcp_servers.skysay]\nurl = "${RO}"\nbearer_token_env_var = "SKYSAY_API_KEY"`,
          },
        ];
    return {
      label: "Add the connector",
      title: oauth ? "Add the connector and log in" : "Add the connector",
      intro: oauth
        ? "Use a `skysay` entry without `bearer_token_env_var`:"
        : "Use the CLI command **or** edit `config.toml`, not both. Keep other server entries intact.",
      main,
      side: {
        label: "In Codex",
        title: "One definition, one method",
        blocks: [
          { type: "copy", label: "Server URL", value: RO },
          {
            type: "list",
            label: "Check",
            items: oauth
              ? [
                  "Don't run this on top of an existing API-key entry; remove or update that entry first.",
                  "The login opens Skysay in your browser; review the workspace and permission there.",
                ]
              : [
                  "`SKYSAY_API_KEY` must be present in the process that runs Codex.",
                  "An already running desktop app doesn't pick up a new terminal export.",
                ],
          },
        ],
      },
    };
  }
  return {
    label: "Add the connector",
    title: "Add the connector in Grok Bot",
    intro:
      "Ask Grok Bot to add a custom remote MCP server named Skysay with these values. Complete the connection card's sign-in flow if it appears.",
    main: [
      {
        type: "fields",
        fields: [
          { label: "Name", value: "Skysay" },
          { label: "Server URL", value: FULL, mono: true },
          { label: "Transport", value: "Streamable HTTP" },
        ],
      },
      {
        type: "choice",
        label: "Authentication",
        options: ["OAuth", "API key"],
        selected: oauth ? "OAuth" : "API key",
        hint: oauth
          ? "OAuth authorization code with PKCE S256."
          : "Only in a secure connection credential field: `Authorization: Bearer YOUR_SKYSAY_API_KEY`",
      },
    ],
    side: {
      label: "In Grok Bot",
      title: "Check the connection",
      blocks: [
        { type: "copy", label: "Server URL", value: FULL },
        { type: "value", label: "Transport", value: "Streamable HTTP", mono: false },
        { type: "copy", label: "Fixed read-only resource (optional)", value: RO },
        {
          type: "list",
          label: "Check",
          items: [
            "Open **Connect apps → Your plugins → Skysay** to see the URL and connected status.",
            "Installed connectors are shared across your account's Bots, so a fresh Bot can use an existing connection.",
            "If the connection can't be added or authenticated, stop and use a supported MCP client. Never paste a secret into the chat.",
          ],
        },
      ],
    },
  };
}

function consent(client) {
  return {
    label: "Sign in and allow",
    title: "Sign in and allow access",
    intro:
      "Your assistant opens Skysay in the browser. Sign in to Skysay (email code, Google, GitHub or password), then review the request.",
    main: [
      { type: "text", text: `**${NAMES[client]} wants to access your Skysay workspace**` },
      { type: "fields", fields: [{ label: "Workspace", value: "Acme Dental" }] },
      {
        type: "checks",
        label: `${NAMES[client]} will be able to`,
        items: [
          {
            text: "Workspace overview",
            checked: true,
            detail:
              "See your workspace overview: balance, usage and setup progress; your AI agents and their settings; your numbers and number requests, including the verification details you submitted; your calls and SMS conversations, without message text; and the agent ambience catalogue",
          },
        ],
      },
      { type: "hint", text: "You can disconnect it at any time on the API keys page, under Connected apps." },
      { type: "buttons", items: [{ text: "Deny" }, { text: "Allow access", primary: true }] },
    ],
    side: {
      label: "In Skysay",
      title: "Check before you allow",
      blocks: [
        {
          type: "list",
          label: "Check",
          items: [
            "The workspace is the one you mean.",
            "What is ticked is exactly what the app gets. For this check, Workspace overview is enough.",
            client === "grok"
              ? "Some clients request several scopes together. Decline if the bundle grants more access than you accept."
              : "The read-only address accepts at most workspace, AI agent, call and number reads: no calls, writes or transcripts.",
          ],
        },
        {
          type: "list",
          label: "Afterwards",
          items: [
            "Disconnect under **Connected apps** on the API keys page.",
            "API keys are separate: revoke them separately.",
          ],
        },
      ],
    },
  };
}

function verify(client, oauth) {
  const lead = {
    claude: "Use `/mcp` in Claude Code to inspect the connection, then ask:",
    codex: "Run `codex mcp list` to check the configuration, start a new Codex session, then ask:",
    grok: "Then ask Grok Bot:",
  }[client];
  const r401 =
    client === "grok"
      ? "Complete OAuth again, or check the key. Tokens for the two MCP addresses are separate."
      : oauth
        ? "Complete OAuth again. A token for another Skysay address won't work."
        : `Export the key before starting ${NAMES[client]}. A revoked key won't work.`;
  const rows = [
    ["401", r401],
    ["Missing scopes", "Read the named scope. `account:read` is enough here; don't grant `all`."],
    ...(client === "grok"
      ? [["Coverage refused", "Coverage needs the full address with `coverage:read`."]]
      : [
          ["Write tool refused", "Expected: read-only exposes five workspace read tools."],
          ["GET 405", "MCP uses POST. Opening the URL in a browser is not a test."],
        ]),
  ];
  return {
    label: "Try it",
    title: "Try a real read",
    intro: lead,
    main: [
      { type: "code", label: "Ask your assistant", code: PROMPT },
      {
        type: "status",
        tone: "ok",
        title: "skysay · account_overview returned a result",
        lines: ["Empty collections are normal in a new workspace."],
      },
      { type: "text", muted: true, text: "A successful tool result proves an authenticated read. It does not prove a working phone line." },
    ],
    side: {
      label: "In your assistant",
      title: "A tool result, not a setting",
      blocks: [
        {
          type: "list",
          label: "Not proof",
          items: [
            "A server marked “configured” or a saved connection.",
            "An answer from the assistant's own knowledge.",
            ...(client === "grok"
              ? ["A new Bot that reuses an existing account-wide connection: that is not a fresh sign-up."]
              : []),
          ],
        },
        { type: "table", label: "If it fails", head: ["What you see", "What to do"], rows },
      ],
    },
  };
}

function enable(client, oauth) {
  const coverageDetail =
    client === "grok"
      ? "Lets get_coverage and get_number_catalog run."
      : 'Lets get_coverage run, for example with countries: ["GB"].';
  const scopes = {
    type: "checks",
    label: "Example: coverage",
    items: [
      { text: "account:read", mono: true, checked: true, detail: "Already granted." },
      { text: "coverage:read", mono: true, checked: true, tag: "add", detail: coverageDetail },
    ],
  };
  const main =
    client === "grok"
      ? [
          scopes,
          {
            type: "status",
            tone: "warn",
            lines: [
              `If you connected the fixed read-only address, reconnect at \`${FULL}\`: its OAuth resource and token are separate.`,
            ],
          },
        ]
      : [
          { type: "value", label: "From", value: RO },
          { type: "copy", label: "To", value: FULL },
          scopes,
          oauth
            ? {
                type: "status",
                tone: "warn",
                lines: [
                  "OAuth grants belong to one address. Reconnect for `/mcp`: a token for the read-only address is not a token for the full one.",
                ],
              }
            : {
                type: "status",
                tone: "ok",
                lines: ["Change the URL and use a key that carries the extra scopes. Revoke keys you no longer use."],
              },
        ];
  return {
    label: "Enable more",
    title: "Enable only what you need",
    intro:
      client === "grok"
        ? "Start the workspace read with `account:read`. Add `coverage:read` for coverage checks, and specific write scopes only when you decide to enable those actions."
        : "To check coverage or configure a phone agent, switch to the full address and grant only the extra scopes that workflow needs.",
    main,
    side: {
      label: "In Skysay",
      title: "Before any billable action",
      blocks: [
        {
          type: "list",
          label: "Every time",
          ordered: true,
          items: [
            "Confirm the exact recipient, action and expected cost with the person. Consent to a tool is not approval of a particular call, SMS or number order.",
            "Use only the scopes that action needs.",
            "Review the workspace's destination restrictions and spending safeguards.",
            "Follow recipient-permission, AI-disclosure and recording rules.",
          ],
        },
        {
          type: "hint",
          text: "A browser audio test uses browser credit. A number, a real call or an SMS needs purchased funds.",
        },
      ],
    },
  };
}

function tab(client) {
  return {
    id: client,
    label: NAMES[client],
    methods: [
      {
        id: "api-key",
        label: "API key",
        steps: [createKey(client), addServer(client, false), verify(client, false), enable(client, false)],
      },
      {
        id: "oauth",
        label: "OAuth",
        steps: [addServer(client, true), consent(client), verify(client, true), enable(client, true)],
      },
    ],
  };
}

const walkthrough = {
  id: "install-connector",
  title: "Connect your AI assistant",
  lede: "Connect your assistant directly to hosted Skysay MCP. No private checkout or local bridge, and the connection alone doesn't provision a number or place a call.",
  methodsLabel: "Sign in with",
  note: "Example values only. Never paste a real key into a page, a prompt or a chat.",
  tabs: [tab("claude"), tab("codex"), tab("grok")],
};

export default walkthrough;
