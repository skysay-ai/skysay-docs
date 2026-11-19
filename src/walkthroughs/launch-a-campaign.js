// Launch a campaign: the workspace wizard's steps and the same path over the
// API. Wizard labels are the workspace's own wording; limits and presets are
// the released campaign service's.

const WEBHOOKS = ["campaign.launched", "campaign.contact.completed", "campaign.completed"];

const workspace = {
  id: "workspace",
  label: "In the workspace",
  steps: [
    {
      label: "Contacts",
      title: "Who are you calling?",
      intro:
        "Only your own customers or people who explicitly agreed to be contacted. Purchased, scraped or cold lists are not permitted.",
      main: [
        {
          type: "choice",
          options: ["Upload a CSV or Excel file", "Use an existing list"],
          selected: "Upload a CSV or Excel file",
          hint: "One row per person. Extra columns become variables your AI agent can use.",
        },
        {
          type: "fields",
          fields: [
            {
              label: "CSV or Excel file",
              value: "september-renewals.xlsx",
              hint: ".csv or .xlsx. Needs a phone column in international format.",
            },
          ],
        },
        {
          type: "fields",
          fields: [
            { label: "Phone column", value: "phone", mono: true },
            { label: "Name column", value: "name", mono: true },
            { label: "First name column", value: "first_name", mono: true },
            { label: "Language column", value: "language", mono: true },
            { label: "Time zone column", value: "Not mapped", placeholder: true },
            { label: "Reference column", value: "account_ref", mono: true },
          ],
        },
        {
          type: "hint",
          text: "Every other column is available to the AI agent as `{{column}}`. Turn on **Several rows per phone number** when the sheet has one row per loan: rows sharing a number become one contact.",
        },
        {
          type: "table",
          label: "3 of 3 rows ready",
          head: ["Row", "Phone", "Name", "Language", "plan", ""],
          rows: [
            ["1", "+44 20 … 0101", "Ama", "en", "gold", "Ready"],
            ["2", "+44 20 … 0102", "Kofi", "en", "silver", "Ready"],
            ["3", "+44 20 … 0103", "Mari", "en", "gold", "Ready"],
          ],
        },
        {
          type: "choice",
          label: "Consent basis",
          options: ["Existing customers", "Explicit consent"],
          selected: "Existing customers",
          hint: "Existing customers: people with an active relationship with your business. Explicit consent: people who agreed in writing to be called by you.",
        },
        {
          type: "status",
          title: "Import check",
          lines: [
            "Numbers on your do-not-call list are skipped, never dialed. Their count shows once this list is saved.",
            "Language `en`: 3 contacts, published.",
          ],
        },
        { type: "buttons", items: [{ text: "Cancel" }, { text: "Continue", primary: true }] },
      ],
      side: {
        label: "Your list",
        title: "What the import checks",
        blocks: [
          { type: "value", label: "Rows per import", value: "10,000", mono: false },
          { type: "value", label: "Values per contact", value: "32 · 512 characters each · 4 KB", mono: false },
          { type: "value", label: "Phone column", value: "+44 20 …  (international format)", mono: false },
          {
            type: "list",
            items: [
              "Duplicates are skipped; invalid numbers are reported row by row.",
              "Numbers on your do-not-call register are never dialled.",
              "A contact in a language the AI agent hasn't published ends as “language not published” when it is dialled. A value like “English” instead of `en` fails before dialling.",
              "Keep account references and phone numbers in **text-formatted** columns: a spreadsheet rounds numbers past 15 digits.",
              "No secrets in columns.",
            ],
          },
          { type: "note", text: "A workbook is read in your browser: the first sheet, with the first row as column names." },
        ],
      },
    },
    {
      label: "AI agent & numbers",
      title: "AI agent and caller ID",
      intro: "The hosted AI agent makes every call; the caller ID rotates across the numbers you pick.",
      main: [
        {
          type: "fields",
          fields: [
            { label: "Campaign name", value: "September renewal offer" },
            { label: "AI agent", value: "Renewals agent", hint: "Only published hosted AI agents can run campaigns." },
          ],
        },
        {
          type: "choice",
          label: "Caller ID numbers",
          options: ["+44 20 … 0100", "+44 20 … 0200"],
          selected: ["+44 20 … 0100", "+44 20 … 0200"],
          hint: "Pick one or more of your numbers. Calls rotate across them.",
        },
        {
          type: "fields",
          fields: [
            {
              label: "Purpose",
              value: "customer_outreach",
              mono: true,
              hint: "Free-form label, shown on the campaign and recorded on every call.",
            },
            {
              label: "Language",
              value: "en",
              mono: true,
              hint: "Optional default; a contact's own language column wins.",
            },
          ],
        },
        {
          type: "table",
          label: "How calls open",
          rows: [
            ["Who speaks first", "The AI agent, as soon as the call is answered."],
            [
              "Opening line",
              "`Hi{{#contact.first_name}} {{contact.first_name}}{{/contact.first_name}}, this is Acme about your plan renewal.`",
            ],
          ],
        },
        {
          type: "status",
          title: "What this AI agent says",
          lines: [
            "Rendered for the first contact on the chosen list, the way the call will say it.",
            "“Hi Ama, this is Acme about your plan renewal.”",
          ],
        },
        { type: "buttons", items: [{ text: "Back" }, { text: "Continue", primary: true }] },
      ],
      side: {
        label: "From the AI agent",
        title: "What a call says comes from the agent",
        blocks: [
          {
            type: "list",
            items: [
              "A campaign has no opening or script of its own. To change what a call says, edit the AI agent.",
              "Each contact's columns become that call's variables: a line's `{{plan}}` says that contact's value. `contact.*` and `campaign.*` come for free.",
              "A value that doesn't fit its declaration stops that contact's call before it is placed, naming the variable.",
              "A protected value, such as a balance, is said only after the caller is confirmed.",
            ],
          },
          {
            type: "list",
            label: "Watch for",
            items: [
              "An agent that waits for the person to speak first and has no opening line: if the person waits too, the call can stay silent. Add an opening line, or let the agent speak first.",
              "An agent that isn't published yet: its calls would be refused.",
            ],
          },
        ],
      },
    },
    {
      label: "Schedule & retries",
      title: "When may we call?",
      intro: "Calls only go out inside these local hours. Everything else waits for the next window.",
      main: [
        {
          type: "fields",
          fields: [
            { label: "Start", value: "", hint: "Leave empty to start on launch." },
            { label: "End", value: "" },
            {
              label: "Time zone",
              value: "Europe/London",
              mono: true,
              hint: "IANA zone for the schedule and for contacts without their own.",
            },
          ],
        },
        {
          type: "choice",
          options: ["Each contact's local time", "One fixed time zone"],
          selected: "Each contact's local time",
        },
        {
          type: "table",
          label: "Calling hours",
          rows: [
            ...["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => [d, "09:00 – 18:00"]),
            ["Sunday", "No calls"],
          ],
        },
        {
          type: "choice",
          label: "Retries",
          options: ["Sales", "Collections", "Single attempt", "Custom"],
          selected: "Sales",
        },
        {
          type: "table",
          head: ["Outcome", "Attempts", "Waits between them"],
          rows: [
            ["No answer", "up to 4", "2 h, 24 h, 72 h"],
            ["Busy", "up to 3", "30 min, 4 h"],
            ["Voicemail", "up to 2", "24 h"],
            ["Technical failure", "up to 2", "15 min"],
            ["Carrier rejected", "1", "not retried"],
          ],
        },
        {
          type: "hint",
          text: "A completed conversation, a wrong party, a refusal or a do-not-call request is never redialed.",
        },
        {
          type: "fields",
          fields: [
            { label: "Concurrent calls: 2", value: "2", hint: "Your workspace allows up to 5 concurrent calls." },
            {
              label: "Keep free for other calls: 1",
              value: "1",
              hint: "Lines the campaign never uses, so inbound and other calls always get through.",
            },
          ],
        },
        { type: "buttons", items: [{ text: "Back" }, { text: "Review", primary: true }] },
      ],
      side: {
        label: "How calling works",
        title: "Hours, retries and lines",
        blocks: [
          {
            type: "list",
            items: [
              "A contact outside its window waits for the next open one. It is never dropped.",
              "At most four windows a day, never across midnight.",
              "With one country in the list, the hours default to that country's: Ghana 08:00–19:00 Monday to Saturday; Sri Lanka 09:00–17:00 Monday to Friday and 09:00–13:00 Saturday. Anywhere else, 09:00–18:00 Monday to Saturday.",
            ],
          },
          {
            type: "list",
            label: "What uses an attempt",
            items: [
              "Only an attempt that reached the line counts.",
              "Paused, hours closed since it was claimed, or every line busy: the contact waits and no attempt is used.",
              "A callback the agent recorded with a time is dialled at that time.",
            ],
          },
        ],
      },
    },
    {
      label: "Review & launch",
      title: "Review September renewal offer",
      intro: "Nothing has been called yet. Launching authorizes the campaign against your workspace capabilities.",
      main: [
        {
          type: "table",
          rows: [
            ["Contacts", "3"],
            ["AI agent", "Renewals agent"],
            ["Caller ID numbers", "2"],
            ["Consent basis", "Existing customers"],
            ["Calling hours", "6 days per week · Each contact's local time"],
            ["Retries", "Sales"],
            ["Start", "On launch"],
          ],
        },
        {
          type: "status",
          title: "Estimated spend",
          lines: ["3 contacts × 2 minutes at … per hosted-AI minute, first attempt only."],
        },
        { type: "heading", text: "Launch checks" },
        {
          type: "hint",
          text: "What the launch will be checked against, read from your workspace capabilities. The launch itself is the final decision.",
        },
        {
          type: "rows",
          rows: [
            { title: "No sanctioned destination", badges: [{ text: "OK", tone: "ok" }] },
            { title: "Workspace active", badges: [{ text: "OK", tone: "ok" }] },
            { title: "Voice enabled", badges: [{ text: "OK", tone: "ok" }] },
            {
              title: "Destinations allowed",
              detail: "Every destination is in your allowlist.",
              badges: [{ text: "OK", tone: "ok" }],
            },
            { title: "Consent basis", badges: [{ text: "OK", tone: "ok" }] },
          ],
        },
        { type: "checks", items: [{ text: "Launch immediately after creating", checked: true }] },
        { type: "buttons", items: [{ text: "Create draft" }, { text: "Create and launch", primary: true }] },
      ],
      side: {
        label: "Before you launch",
        title: "Test it first",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Talk to the agent in your browser**, up to 180 seconds: voice, recognition, latency, interruptions.",
              "**Run a simulation suite** in the Simulations Lab, with your own pass and fail rules.",
              "**Create draft**, then on its page choose **Call one contact now**: one real, billed call with this campaign's agent, caller ID and that contact's values.",
            ],
          },
          {
            type: "list",
            items: [
              "Only the draft test call proves the carrier route.",
              "The test call checks do-not-call, calling hours, your workspace limits and your balance.",
              "The draft stays a draft, and the contact is not marked done, so the launch calls them again. Add your own number as a row to call yourself.",
            ],
          },
          {
            type: "rows",
            rows: [
              { title: "OK", detail: "Calling starts, or waits for its start time.", badges: [{ text: "OK", tone: "ok" }] },
              {
                title: "Held for review",
                detail: "For example a destination not on your allowlist yet.",
                badges: [{ text: "Held for review" }],
              },
              { title: "Blocked", detail: "For example a sanctioned destination.", badges: [{ text: "Blocked", tone: "warn" }] },
            ],
          },
        ],
      },
    },
    {
      label: "Watch results",
      title: "September renewal offer",
      intro: "The campaign page: audience, remaining, pick-up rate, outcomes and spend.",
      main: [
        {
          type: "choice",
          options: ["All 3", "To call 1", "Done 2", "Not called 0"],
          selected: "All 3",
        },
        {
          type: "table",
          head: ["Contact", "Status", "Call outcome", "Result"],
          rows: [
            ["Ama", "completed", "`connected_completed`", "renewing: yes"],
            ["Kofi", "scheduled", "`voicemail`", "tried again in 24 h"],
            ["Mari", "completed", "`connected_completed`", "not stated"],
          ],
        },
        {
          type: "hint",
          text: "Click an outcome or a result to filter. Each row opens its call: recording, transcript and results.",
        },
        { type: "buttons", items: [{ text: "Review inbox (1)" }, { text: "Pause" }, { text: "Export CSV", primary: true }] },
      ],
      side: {
        label: "While it runs",
        title: "Read, pause, change",
        blocks: [
          {
            type: "list",
            items: [
              "**Pause** keeps the remaining contacts. **Cancel** ends the run and skips them.",
              "While paused you can change calling hours, caller IDs, retries, concurrency and the end date.",
              "The list, AI agent, purpose and consent are locked after launch. Duplicate the campaign to change them.",
              "**Export CSV** downloads exactly the rows the table shows.",
              "The **Calls** page filters by campaign.",
            ],
          },
          { type: "list", label: "Webhooks for the run", items: WEBHOOKS.map((w) => `\`${w}\``) },
          {
            type: "note",
            text: "Result fields are AI estimates read from each contact's last call. A field the agent left empty shows “not stated”, never “no”.",
          },
        ],
      },
    },
  ],
};

const api = {
  id: "api",
  label: "Over the API",
  steps: [
    {
      label: "Create the list",
      title: "Create a contact list",
      intro:
        "One request creates the list and imports its rows. A row needs `phone_e164`; every other field is optional.",
      main: [
        {
          type: "code",
          label: "Create a list",
          code: `curl -X POST https://api.skysay.ai/v1/contact-lists \\
  -H "Authorization: Bearer $SKYSAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "project_id": "proj_123",
    "name": "September renewals",
    "contacts": [
      {"phone_e164": "+15550100", "name": "Ama",
       "external_reference": "crm-4812",
       "variables": {"plan": "gold", "renewal_date": "2026-09-30"}}
    ]
  }'`,
        },
      ],
      side: {
        label: "What comes back",
        title: "A per-row report",
        blocks: [
          {
            type: "list",
            items: [
              "`accepted`, `rejected`, `skipped_duplicates` and `rejections[]` with each row number and reason.",
              "At most 10,000 rows per request. Re-uploading the same numbers is idempotent.",
              "`variables`: at most 32 keys and 4 KB, never secrets. A row that wouldn't fit is rejected at import, never at dial time.",
              "Append later with `POST /v1/contact-lists/{id}/contacts`.",
            ],
          },
        ],
      },
    },
    {
      label: "Create the campaign",
      title: "Create the campaign",
      intro: "The wizard's Agent, Schedule and Retries settings, as API fields. This example uses its own values.",
      main: [
        {
          type: "code",
          label: "Create a campaign",
          code: `curl -X POST https://api.skysay.ai/v1/campaigns \\
  -H "Authorization: Bearer $SKYSAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "project_id": "proj_123",
    "name": "September renewals",
    "agent_id": "agent_123",
    "from_number_ids": ["num_123", "num_456"],
    "contact_list_id": "clist_123",
    "purpose": "customer_outreach",
    "consent_basis": "existing_customer",
    "time_zone_mode": "contact",
    "time_zone": "Africa/Accra",
    "calling_windows": {"monday": [{"start": "08:00", "end": "19:00"}]},
    "retry_policy_preset": "sales",
    "max_concurrency": 2,
    "reserved_concurrency": 1
  }'`,
        },
      ],
      side: {
        label: "The fields",
        title: "What each one decides",
        blocks: [
          {
            type: "list",
            items: [
              "`consent_basis`: `existing_customer` or `explicit_consent`.",
              "`calling_windows`: at most four windows a day in `HH:MM`, never across midnight.",
              "`time_zone_mode`: `contact` uses each contact's zone, with `time_zone` as the fallback; `fixed` uses one zone for everyone.",
              "`retry_policy_preset`: `sales`, `collections` or `single_attempt`, or your own `retry_policy`.",
              "`max_concurrency` never exceeds your workspace limit; `reserved_concurrency` keeps lines free.",
            ],
          },
        ],
      },
    },
    {
      label: "Test call",
      title: "Call one contact on the draft",
      intro: "One real, billed call to one contact, before you launch.",
      main: [
        {
          type: "code",
          label: "Test call",
          code: `curl -X POST https://api.skysay.ai/v1/campaigns/camp_123/test-call \\
  -H "Authorization: Bearer $SKYSAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"contact_id": "contact_123"}'`,
        },
      ],
      side: {
        label: "What it checks",
        title: "An ordinary outbound call",
        blocks: [
          {
            type: "list",
            items: [
              "Every check `POST /v1/calls` makes: do-not-call register (403), your policy and caps, your balance.",
              "Calling hours first, in the contact's zone: outside them, 409 `outside_calling_window` with `next_window_at`.",
              "Only a draft can do this (409 `campaign_not_draft`), one test call at a time (409 `test_call_in_progress`).",
              "The contact is not marked done: the launch calls them again.",
            ],
          },
        ],
      },
    },
    {
      label: "Launch",
      title: "Launch",
      intro: "After launch the audience and authorization are fixed.",
      main: [
        {
          type: "code",
          label: "Launch",
          code: `curl -X POST https://api.skysay.ai/v1/campaigns/camp_123/launch \\
  -H "Authorization: Bearer $SKYSAY_TOKEN"`,
        },
      ],
      side: {
        label: "What comes back",
        title: "authorization.decision",
        blocks: [
          { type: "value", label: "Allowed", value: "allowed" },
          { type: "value", label: "Held for review", value: "needs_review" },
          { type: "value", label: "Blocked", value: "blocked" },
          {
            type: "list",
            items: [
              "The response also carries `reason_code`, the run and its counters.",
              "`pause`, `resume` and `cancel` control the run.",
              "`POST /v1/campaigns/{id}/duplicate` copies it into a new draft for a new audience.",
            ],
          },
        ],
      },
    },
    {
      label: "Read progress",
      title: "Read progress",
      intro: "The run, its contacts and their outcomes.",
      main: [
        {
          type: "code",
          label: "Read",
          code: `GET /v1/campaigns/camp_123
GET /v1/campaigns/camp_123/contacts?status=completed
GET /v1/campaigns/camp_123/results
GET /v1/campaigns/camp_123/export?group=done`,
        },
      ],
      side: {
        label: "What you get",
        title: "Counters, outcomes, a CSV",
        blocks: [
          {
            type: "list",
            items: [
              "Contact counters: `pending`, `scheduled`, `dispatched`, `completed`, `failed`, `skipped`, `pre_dial_failed`, `do_not_call`.",
              "Each contact's last call id opens the ordinary call evidence.",
              "The export has one row per contact and up to 50,000 rows, with `X-Skysay-Truncated` when rows were left out.",
            ],
          },
          { type: "list", label: "Webhooks", items: WEBHOOKS.map((w) => `\`${w}\``) },
          {
            type: "note",
            text: "Per-call events carry the contact's `external_reference` and the campaign id as `external_group_reference`.",
          },
        ],
      },
    },
  ],
};

const walkthrough = {
  id: "launch-a-campaign",
  title: "Launch a campaign",
  crumb: "Campaigns / New campaign",
  lede: "Upload your customers, pick the AI agent and caller ID, set calling hours and retries, then launch.",
  note: "Example values only. The real wizard shows your own rates and workspace limits.",
  tabs: [workspace, api],
};

export default walkthrough;
