// Numbers → Import a number: supported carriers or your own SIP trunk.
// Labels, hints and buttons are the workspace's own wording. Skysay's SIP
// address is the `skysay` block every workspace gets from
// GET /v1/sip-connections (a reserved IP; there is no host name for it).

const SIP_HOST = "168.144.8.195";
const SIP_PORT = "5060";
const NUM = "+44 20 XXXX XXXX";
const NUM2 = "+44 161 XXX XXXX";
const NUM3 = "+44 121 XXX XXXX";

const NOW = "Now, at your carrier";
const ADDRESS_NOTE =
  "Your workspace shows the address for your connection when you create it; use that one if it differs.";

const sipSide = (tip) => ({
  label: "At your carrier",
  title: "Set these in your carrier's portal",
  tip: { title: NOW, text: tip },
  blocks: [
    { type: "copy", label: "Send incoming calls to", value: `${SIP_HOST}:${SIP_PORT}` },
    { type: "value", label: "Transport", value: "UDP or TCP, the one you chose", mono: false },
    { type: "copy", label: "Skysay's calls come from", value: SIP_HOST },
    { type: "hint", text: ADDRESS_NOTE },
    {
      type: "hint",
      text: "Skysay signs in with your SIP username and password. If you chose **By IP address (no password)**, or your carrier also checks addresses, allow this address.",
    },
    { type: "value", label: "Called number format", value: "With + and country code · Country code, no +", mono: false },
    {
      type: "list",
      ordered: true,
      items: [
        "Find the SIP trunk (or SIP forwarding) settings for your numbers.",
        "Send incoming calls to Skysay's SIP server on the port and transport shown above.",
        "Send the called number in one of the formats shown above.",
        "Copy your SIP username and password into the form, or allow Skysay's addresses.",
      ],
    },
    {
      type: "text",
      text: "[Setup guide, with examples for common carriers](/docs/sip-trunk-setup#where-to-find-it-in-your-carriers-portal)",
    },
    { type: "note", text: "Carriers that require Skysay to register (log in) aren't supported yet." },
  ],
});

const sipTrunk = {
  id: "sip",
  label: "Your own SIP trunk",
  title: "Your own SIP trunk",
  lede: "Use numbers you already have at your carrier. Your carrier bills the line and its minutes; Skysay charges platform and AI minutes only.",
  steps: [
    {
      label: "Connect",
      title: "Connect your carrier",
      intro:
        "Copy these from your carrier's SIP trunk settings. Any carrier works if it can send calls to an address and accept calls with a username and password or from a fixed IP address.",
      main: [
        {
          type: "fields",
          fields: [
            { label: "Connection name", value: "Main trunk" },
            {
              label: "Carrier's country",
              value: "United Kingdom",
              hint: "Used for numbers your carrier writes without the country code.",
            },
          ],
        },
        {
          type: "checks",
          label: "What this trunk carries",
          items: [
            { text: "Calls out: Skysay places calls through your carrier", checked: true },
            { text: "Incoming calls: your carrier sends calls to Skysay", checked: true },
          ],
          hint: "A SIP trunk carries voice only, so these numbers can't send or receive SMS.",
        },
        { type: "heading", text: "Calls out" },
        {
          type: "fields",
          fields: [
            {
              label: "Carrier SIP server",
              value: "sip.carrier.example",
              mono: true,
              hint: "A host name or a public IPv4 address.",
            },
            { label: "Port", value: "5060", mono: true },
          ],
        },
        {
          type: "choice",
          label: "Transport",
          options: ["UDP", "TCP"],
          selected: "UDP",
          hint: "Encrypted (TLS and SRTP) trunks aren't supported yet.",
        },
        {
          type: "choice",
          label: "How Skysay signs in for calls out",
          options: ["Username and password", "By IP address (no password)"],
          selected: "Username and password",
        },
        {
          type: "fields",
          fields: [
            { label: "SIP username", value: "your-sip-user", mono: true },
            { label: "SIP password", value: "••••••••", hint: "Stored encrypted and never shown again." },
          ],
        },
        { type: "heading", text: "Incoming calls" },
        {
          type: "fields",
          fields: [
            {
              label: "Your carrier's IP addresses",
              value: "203.0.113.0/28",
              mono: true,
              hint: "Only calls from these addresses reach this connection. One per line: a single address (a.b.c.d) or a range (a.b.c.d/29). Host names, ranges wider than /16, and private or documentation addresses are refused. The example is a documentation range: use your carrier's own.",
            },
          ],
        },
        {
          type: "details",
          summary: "Number formats and audio (advanced)",
          blocks: [
            {
              type: "fields",
              fields: [
                { label: "Number format for calls out", value: "With + and country code · +44XXXXXXXXXX" },
                { label: "Caller ID format", value: "With + and country code · +44XXXXXXXXXX" },
              ],
            },
            {
              type: "checks",
              label: "Number formats your carrier sends on incoming calls",
              items: [
                { text: "With + and country code · +44XXXXXXXXXX", checked: true },
                { text: "Country code, no + · 44XXXXXXXXXX", checked: true },
                { text: "National · 0XXXXXXXXXX", checked: false },
                { text: "With 00 and country code · 0044XXXXXXXXXX", checked: false },
              ],
              hint: "Choose every format your carrier may use for the number that was called.",
            },
            {
              type: "fields",
              fields: [
                { label: "Audio codecs", value: "PCMA, then PCMU" },
                {
                  label: "Channel limit (optional)",
                  value: "",
                  hint: "How many calls your trunk carries at once. Recorded for you; your carrier enforces it.",
                },
              ],
            },
            {
              type: "choice",
              label: "How your carrier's incoming calls are checked",
              options: ["By IP address only", "IP address plus username and password"],
              selected: "By IP address only",
            },
            { type: "hint", text: "Not sure? Keep the defaults, or ask your carrier which formats it uses." },
          ],
        },
        { type: "buttons", items: [{ text: "Save and check connection", primary: true }] },
      ],
      side: sipSide(
        "Find your carrier's SIP server, port and transport, your SIP username and password (or turn on IP sign-in), and the public IPv4 addresses it sends calls from. Turn trunk registration off.",
      ),
    },
    {
      label: "Check",
      title: "Check the connection",
      intro: "Each check stands on its own. A passed check doesn't promise that a call works.",
      main: [
        {
          type: "rows",
          rows: [
            { title: "Settings", detail: "Your settings are valid and set up.", badges: [{ text: "Saved", tone: "ok" }] },
            {
              title: "Skysay is open to your carrier",
              detail: "Opens automatically for 203.0.113.0/28 once you add a number for incoming calls.",
              badges: [{ text: "Opening…" }],
            },
            {
              title: "Calls out",
              detail:
                "Skysay sends calls to sip.carrier.example:5060 over UDP. Each number can call out once its ownership is confirmed.",
              badges: [{ text: "Set" }],
            },
            {
              title: "Skysay can reach your carrier",
              detail:
                "Your carrier answered 401: it asks for credentials, which is normal. This shows only whether the server answers. The test calls in step 4 show whether calls work.",
              badges: [{ text: "Answered", tone: "ok" }],
            },
          ],
        },
        { type: "buttons", items: [{ text: "Check reachability" }] },
        { type: "buttons", items: [{ text: "Back to settings" }, { text: "Add numbers", primary: true }] },
      ],
      side: sipSide(
        "If reachability says your carrier seems to want Skysay to register, ask it for calls by IP address or username and password instead.",
      ),
    },
    {
      label: "Numbers",
      title: "Add your numbers",
      intro:
        "When you add a number, Skysay calls it once through the phone network to confirm it's yours. Nobody needs to answer: the call comes back to Skysay through your carrier, and the check usually takes under a minute. Calls out always show that number as caller ID.",
      main: [
        {
          type: "rows",
          rows: [
            {
              title: NUM,
              detail: "Front desk · SMS: not available on SIP trunks",
              badges: [{ text: "Confirmed", tone: "ok" }, { text: "Calls out: On" }],
            },
            { title: NUM2, detail: "Front desk", badges: [{ text: "Checking…" }, { text: "Calls out: After the check" }] },
          ],
        },
        {
          type: "text",
          muted: true,
          text: "Ownership reads **Confirmed**, **Checking…**, **Not confirmed** (the row says why; fix it at your carrier, then **Check again**) or **Needs support** (the number takes no incoming calls here).",
        },
        { type: "heading", text: "Add a number" },
        {
          type: "fields",
          fields: [
            {
              label: "Number",
              value: "+44 · Number at your carrier",
              placeholder: true,
              hint: "A number you hold at your carrier. Premium-rate and shared-cost numbers can't be added.",
            },
            {
              label: "Incoming calls go to",
              value: "Front desk",
              hint: "Skysay-hosted AI agents and outside AI agents that stream audio can answer on your own trunk.",
            },
          ],
        },
        {
          type: "checks",
          items: [{ text: "Calls out with this number", checked: true }],
          hint: "Turns on once ownership is confirmed.",
        },
        { type: "buttons", items: [{ text: "+ Add number" }] },
        { type: "buttons", items: [{ text: "Back" }, { text: "Test calls", primary: true }] },
      ],
      side: sipSide(
        "Before you add a number, send its incoming calls to Skysay's SIP server. Skysay calls the number through the phone network and the call must come back through your carrier, with keypad tones (DTMF) passed on.",
      ),
    },
    {
      label: "Test calls",
      title: "Test calls",
      intro:
        "Optional, but this is how a number gets its **Verified** badge. Test calls are ordinary calls, billed like any other.",
      main: [
        { type: "heading", text: "Call out through your carrier" },
        {
          type: "fields",
          fields: [
            { label: "From", value: NUM },
            { label: "AI agent on the call", value: "Front desk" },
            {
              label: "Call this phone (yours)",
              value: "Your own phone number",
              placeholder: true,
              hint: "Use a phone you own. It should show the number you call from.",
            },
          ],
        },
        { type: "buttons", items: [{ text: "Place test call", primary: true }] },
        {
          type: "status",
          tone: "ok",
          title: "Answered",
          lines: [
            "Your phone should have shown the number you called from.",
            "Number format: With + and country code. Select **Save this number format** to use it for every call.",
          ],
        },
        { type: "heading", text: "Call in to your number" },
        { type: "fields", fields: [{ label: "Number", value: NUM }] },
        { type: "buttons", items: [{ text: "I'm calling now" }] },
        {
          type: "status",
          lines: [`Call ${NUM} from any phone in the next 3 minutes. The call is answered as usual.`],
        },
        {
          type: "hint",
          text: "Skysay notes the next call to this number; you see only the caller's last four digits. Test calls are billed like normal calls.",
        },
        { type: "buttons", items: [{ text: "Back" }, { text: "Finish", primary: true }] },
      ],
      side: sipSide(
        "If a test call out isn't answered, try the next number format. If every format fails, ask your carrier which format it expects.",
      ),
    },
    {
      label: "Done",
      title: "Ready",
      main: [
        { type: "text", text: "Main trunk is connected. Your AI agents can call out and answer on these numbers." },
        {
          type: "rows",
          rows: [
            {
              title: NUM,
              detail: "Front desk · On",
              badges: [
                { text: "Confirmed", tone: "ok" },
                { text: "Verified", tone: "ok" },
              ],
            },
          ],
        },
        {
          type: "text",
          muted: true,
          text: "Billing: your carrier bills the line and its minutes. Skysay charges platform and AI minutes only; there is no monthly number fee.",
        },
        { type: "buttons", items: [{ text: "Manage numbers" }, { text: "Edit connection" }] },
      ],
      side: sipSide(
        "Changing your carrier's IP addresses or SIP server later means each number's ownership is checked again.",
      ),
    },
  ],
};

const numberList = (action, incoming) => ({
  type: "rows",
  rows: [NUM, NUM2, NUM3].map((n) => ({
    title: n,
    detail: `United Kingdom · ${action}`,
    badges: [{ text: "Billed by your carrier" }, ...(incoming ? [{ text: "Incoming available" }] : [])],
  })),
});

const keyFields = (carrier) => ({
  type: "fields",
  fields: [
    { label: "Carrier", value: carrier },
    {
      label: `${carrier} API key`,
      value: "••••••••••••",
      hint: "Used during setup and cleared when you finish or close this dialog.",
    },
  ],
});

const didwwSide = (tip) => ({
  label: "At DIDWW",
  tip: { title: "Now, at DIDWW", text: tip },
  blocks: [
    {
      type: "value",
      mono: false,
      label: "What Skysay sets up for you",
      value:
        "When you confirm, Skysay creates dedicated SIP trunks in your DIDWW account and sets their credentials, destination and caller ID. You never enter a SIP username, password or host.",
    },
    {
      type: "value",
      mono: false,
      label: "Incoming route",
      value:
        "Connecting incoming calls replaces the number's existing DIDWW incoming route, including a trunk group. Other numbers and unrelated trunks are left alone.",
    },
    {
      type: "value",
      mono: false,
      label: "Outgoing trunk",
      value: "Permits only this number as caller ID and one call at a time.",
    },
    {
      type: "note",
      text: "**Disconnect from Skysay** doesn't delete the number or its trunks and doesn't restore the previous route: reroute the number at DIDWW. Voice only: this import doesn't connect SMS.",
    },
  ],
});

const didww = {
  id: "didww",
  label: "From DIDWW",
  title: "Import a number you own",
  lede: "Connect a DIDWW number with one API key. Skysay sets up the trunks at DIDWW for you.",
  steps: [
    {
      label: "API key",
      title: "Import from your carrier",
      intro: "Connect a number you already own. Your carrier keeps billing the number and carrier traffic.",
      main: [
        keyFields("DIDWW"),
        {
          type: "details",
          summary: "Where do I get my API key?",
          blocks: [
            {
              type: "list",
              ordered: true,
              items: [
                "Sign in to your own DIDWW account.",
                "Open APIs → DIDWW API 3 → Create new API Key.",
                "Name the key Skysay, click Create, then paste the key here. This grants account access.",
              ],
            },
            {
              type: "hint",
              text: "IP-restricted keys are not supported in this version. Keep existing restrictions; contact support if your account requires them.",
            },
          ],
        },
        { type: "buttons", items: [{ text: "List my numbers", primary: true }] },
      ],
      side: didwwSide(
        "Sign in to DIDWW, open **APIs → DIDWW API 3 → Create new API Key**, name it Skysay and copy it. The key gives API access to your whole DIDWW account; Skysay uses it only during each setup and does not keep it.",
      ),
    },
    {
      label: "Choose a number",
      title: "Choose a number",
      intro: "To find one number, type the complete number into the search box. On a large account, use **Next page**.",
      main: [
        { type: "fields", fields: [{ label: "Search", value: "Full phone number", placeholder: true }] },
        { type: "hint", text: "Page 1 · 3 numbers" },
        numberList("Select", true),
        { type: "buttons", items: [{ text: "Back" }, { text: "Next page" }] },
      ],
      side: didwwSide("Nothing changes at DIDWW yet: Skysay only reads the numbers on your account."),
    },
    {
      label: "What it does",
      title: "Choose what it should do",
      main: [
        { type: "text", text: `**${NUM}**` },
        {
          type: "fields",
          fields: [
            {
              label: "AI agent for incoming calls",
              value: "Front desk",
              hint: "Incoming calls to this number will move to the selected AI agent in Skysay. Other numbers will not change. Or choose **Set up incoming later**: calls keep going where they go today.",
            },
          ],
        },
        {
          type: "checks",
          items: [{ text: "Connect outgoing calls", checked: true }],
          hint: "Skysay creates a dedicated outgoing trunk. DIDWW must allow outbound calling on your account.",
        },
        { type: "text", muted: true, text: "SMS is not connected through this voice import." },
        { type: "buttons", items: [{ text: "Back" }, { text: "Review setup", primary: true }] },
      ],
      side: didwwSide(
        "DIDWW must already have approved the number for the calls you want. Connecting it to Skysay does not get around DIDWW's verification, outbound permission, balance or restrictions.",
      ),
    },
    {
      label: "Review",
      title: "Review and confirm",
      main: [
        { type: "text", text: `**${NUM}**` },
        { type: "value", mono: false, label: "Current incoming route", value: "The route DIDWW reports today" },
        {
          type: "text",
          text: "Incoming calls to this number will move to the selected AI agent in Skysay. Other numbers will not change. Outgoing: create a dedicated trunk for this number.",
        },
        {
          type: "text",
          muted: true,
          text: "Skysay creates dedicated calling trunks in your carrier account and securely stores the SIP credentials needed for calling. DIDWW bills the number and carrier traffic directly. Skysay bills AI/platform usage at your workspace rates.",
        },
        {
          type: "checks",
          items: [{ text: "Replace this number's incoming route with the selected Skysay AI agent.", checked: true }],
        },
        { type: "buttons", items: [{ text: "Back" }, { text: "Connect this number", primary: true }] },
      ],
      side: didwwSide(
        "Don't edit this number's route at DIDWW while you connect it. Skysay checks the route again just before it switches and stops if it sees a change.",
      ),
    },
    {
      label: "Result",
      title: "Check the result",
      main: [
        {
          type: "status",
          tone: "ok",
          title: "Number connected",
          lines: ["Incoming setup complete", "Outgoing configured", "SMS is not connected through this voice import."],
        },
        {
          type: "text",
          muted: true,
          text: "Configuration was checked just now. Calls use your DIDWW permissions and balance, plus Skysay usage controls. Re-enter the API key to connect another direction or change setup.",
        },
        { type: "buttons", items: [{ text: "Re-enter API key to manage setup" }, { text: "Disconnect from Skysay" }] },
      ],
      side: didwwSide(
        "Skysay checked the saved setup at DIDWW at that moment. It doesn't mean a call has gone through, and Skysay doesn't keep checking your DIDWW permissions.",
      ),
    },
  ],
};

const didlogicSide = (tip) => ({
  label: "At DIDLogic",
  tip: { title: "Now, at DIDLogic", text: tip },
  blocks: [
    {
      type: "list",
      label: "Set up at DIDLogic first",
      ordered: true,
      items: [
        "The number is purchased and active on your account.",
        "A SIP account for the number, with its caller ID set to the number.",
        `The number's only active destination points at Skysay's SIP server, \`${SIP_HOST}\`.`,
      ],
    },
    { type: "hint", text: ADDRESS_NOTE },
    { type: "note", text: "DIDLogic keeps billing the rental and carrier traffic. DIDLogic imports are voice-only." },
  ],
});

const didlogic = {
  id: "didlogic",
  label: "From DIDLogic",
  title: "Import a number you own",
  lede: "Connect a DIDLogic number with its API token. Skysay checks its existing SIP setup.",
  steps: [
    {
      label: "API key",
      title: "Import from your carrier",
      intro: "Connect a number you already own. Your carrier keeps billing the number and carrier traffic.",
      main: [keyFields("DIDLogic"), { type: "buttons", items: [{ text: "List my numbers", primary: true }] }],
      side: didlogicSide("Have your DIDLogic API token ready. Skysay uses it during setup and does not store it."),
    },
    {
      label: "Choose a number",
      title: "Choose a number and confirm its type",
      main: [
        numberList("Import", false),
        {
          type: "choice",
          label: "Number type",
          options: ["Local", "Mobile", "National", "Toll-free"],
          selected: "Local",
        },
        { type: "buttons", items: [{ text: "Back" }] },
      ],
      side: didlogicSide("Skysay reads the numbers on your DIDLogic account. Choose the number and confirm its type."),
    },
    {
      label: "Result",
      title: "Check the result",
      main: [
        {
          type: "status",
          tone: "ok",
          title: "Number connected",
          lines: ["If the check at DIDLogic doesn't pass yet, the number reads **Number saved · setup pending**."],
        },
      ],
      side: didlogicSide("Skysay checks the number's existing SIP setup at DIDLogic before it activates it."),
    },
  ],
};

const telnyxSide = (text) => ({ label: "At Telnyx", blocks: [{ type: "note", text }] });
const telnyx = {
  id: "telnyx", label: "From Telnyx", title: "Import a number you own",
  lede: "Connect an active Telnyx voice number with one API key. Your carrier keeps billing its number and traffic.",
  steps: [
    {
      label: "API key", title: "Import from your carrier",
      main: [keyFields("Telnyx"), { type: "details", summary: "Where do I get my API key?", blocks: [
        { type: "list", ordered: true, items: ["Sign in to your own Telnyx account.", "Open API Keys → Create API Key.", "Name the key Skysay, copy it, then paste it here. This grants account access."] },
      ] }, { type: "buttons", items: [{ text: "List my numbers", primary: true }] }],
      side: telnyxSide("Use the key for your own Telnyx account. Skysay does not keep it after setup. Account and balance restrictions still apply."),
    },
    {
      label: "Choose a number", title: "Choose a number",
      intro: "Search for a complete number or use the next page.",
      main: [numberList("Select", true), { type: "buttons", items: [{ text: "Next page" }] }],
      side: telnyxSide("Listing is read-only. No number is purchased and no route changes at this step."),
    },
    {
      label: "What it does", title: "Choose what it should do",
      main: [{ type: "fields", fields: [{ label: "AI agent for incoming calls", value: "Front desk" }] },
        { type: "checks", items: [{ text: "Connect outgoing calls", checked: true }] },
        { type: "note", text: "SMS is not connected through this voice import." },
        { type: "buttons", items: [{ text: "Review setup", primary: true }] }],
      side: telnyxSide("Choose a published AI agent, or set up incoming later to preserve the current route. Both directions use an existing enabled global outbound voice profile."),
    },
    {
      label: "Review", title: "Review setup",
      main: [{ type: "value", mono: false, label: "Current incoming route", value: "The connection Telnyx reports today" },
        { type: "note", text: "Connecting incoming moves only this number to Skysay. Outgoing uses a separate dedicated connection. Telnyx bills the number, carrier traffic and applicable programmable voice usage directly; Skysay bills AI/platform usage." },
        { type: "checks", items: [{ text: "Replace this number’s incoming route with the selected Skysay AI agent.", checked: true }] },
        { type: "buttons", items: [{ text: "Connect this number", primary: true }] }],
      side: telnyxSide("Do not edit the route at the same time. Existing number translation or forwarding can prevent safe setup. Other numbers and messaging profiles stay unchanged."),
    },
    {
      label: "Result", title: "Check the result",
      main: [{ type: "status", tone: "ok", title: "Number connected", lines: ["Incoming setup complete", "Outgoing configured", "SMS is not connected through this voice import."] }],
      side: telnyxSide("Configuration checked does not mean a call has connected: test both directions. Disconnect blocks Skysay calling but leaves the Telnyx route and number unchanged; reroute at Telnyx and remove its dedicated outgoing connection to revoke carrier authorization."),
    },
  ],
};

const walkthrough = {
  id: "import-a-number",
  title: "Import a number",
  crumb: "Numbers / Import a number",
  defaultTab: "sip",
  note: "Example values only. Your workspace shows your own numbers and AI agents.",
  tabs: [didww, didlogic, telnyx, sipTrunk],
};

export default walkthrough;
