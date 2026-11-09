// Simulations Lab walkthrough: "Set up a run, then read the result".
// UI strings are copied from the released workspace (frontend/messages/en.json).
// Values such as names, tools and timings are examples only.

const policyMain = [
  {
    type: "fields",
    fields: [
      { label: "Quality pass rate needed (%)", value: "95", hint: "Advisory only: it never rescues a critical failure." },
      { label: "Spend limit per run (USD)", value: "0.00", hint: "0 means no money limit; the model-call limit still applies." },
      { label: "Keep recordings (days)", value: "7", hint: "1 to 90 days." },
      { label: "Keep transcripts (days)", value: "30", hint: "1 to 365 days." },
    ],
  },
  {
    type: "choice",
    label: "Test against",
    options: ["Draft (unpublished changes)", "Published AI agent"],
    selected: "Draft (unpublished changes)",
    hint: "Each run pins the exact snapshot it tested.",
  },
  {
    type: "fields",
    fields: [{ label: "Compare runs against", value: "No baseline", hint: "A finished run of this suite." }],
  },
  {
    type: "buttons",
    items: [{ text: "Save as revision 4", primary: true }, { text: "Discard draft" }],
  },
  {
    type: "hint",
    text: "If someone else saved the suite in the meantime, you see their revision and can reapply. Nothing is overwritten.",
  },
  { type: "heading", text: "Suite policy" },
  {
    type: "list",
    items: [
      "Critical rules are deterministic and must pass on every attempt.",
      "Quality rubrics are advisory above 95.0% and can never override a critical rule.",
      "Read tools return fixtures and mutation tools are unreachable, so a run changes nothing.",
      "Audio is kept 7 days, transcripts 30 days.",
    ],
  },
];

const policyStep = (side) => ({
  label: "Pass rules & budget",
  title: "Pass rules & budget",
  intro: "What counts as a pass, what a run may spend, how long evidence is kept, and what runs are compared with.",
  main: policyMain,
  side,
});

const walkthrough = {
  id: "simulations-lab",
  title: "Set up a run, then read the result",
  crumb: "Simulations Lab / Front desk",
  note: "Example values only. Amounts shown as … are worked out for your own suite on the Run this suite panel.",
  tabs: [
    // ------------------------------------------------------------------ Scripted
    {
      id: "scripted",
      label: "Scripted",
      lede: "Fixed caller lines replayed against your workflow: exact routes, mocked tools and endings, with no model calls.",
      steps: [
        {
          label: "Scenario",
          title: "New scenario",
          intro: "Scenarios tab, then Add scenario. Write the caller's lines and what the AI agent must do.",
          main: [
            {
              type: "choice",
              label: "Type of test",
              options: ["Scripted", "AI caller · chat", "AI caller · voice"],
              selected: "Scripted",
              hint: "Fixed caller lines. Free, with no AI caller.",
            },
            {
              type: "fields",
              fields: [
                { label: "Name", value: "Saturday opening hours" },
                { label: "Attempts", value: "1", hint: "1 to 25 per run." },
                { label: "Language", value: "en", mono: true, hint: "A language code such as en or et. Required for a voice test." },
                { label: "Rule level", value: "Critical", hint: "A critical scenario fails the whole run when it fails." },
              ],
            },
            { type: "heading", text: "Caller lines, in order" },
            {
              type: "list",
              ordered: true,
              items: ["What time do you open on Saturday?", "Do I need to book?", "Great, thanks."],
            },
            { type: "heading", text: "What the AI agent must do" },
            {
              type: "fields",
              fields: [
                { label: "Must use tools", value: "lookup_opening_hours", mono: true, hint: "Names separated by commas." },
                { label: "Must not use tools", value: "transfer_call", mono: true, hint: "Names separated by commas." },
                { label: "Must reach steps", value: "answer_hours", mono: true, hint: "Names separated by commas." },
                { label: "Max turns", value: "6", hint: "0 means no limit." },
              ],
            },
            {
              type: "hint",
              text: "Timing rules only count in a voice test. In a scripted or chat test they show as not provable, never as a pass.",
            },
            {
              type: "buttons",
              items: [{ text: "Save scenario", primary: true }, { text: "Close" }, { text: "Discard draft" }],
            },
          ],
          side: {
            label: "What this tests",
            tip: {
              title: "Free and exact",
              text: "A scripted attempt makes no model call. It replays your lines against the workflow and checks routes, tools, steps and how the call ended.",
            },
            blocks: [
              { type: "text", text: "Tools answer with simulation-only mocks, so nothing is sent, booked or transferred." },
              { type: "text", text: "Free until you add a judge question: each one is a separate, metered evaluator call on every attempt." },
              { type: "text", text: "Unfinished edits are kept in this browser tab for up to 24 hours. Only **Save scenario** adds the scenario to the suite." },
              { type: "text", text: "Compare the runners: [Runners](/docs/simulations-lab#runners)." },
            ],
          },
        },
        policyStep({
          label: "How verdicts count",
          tip: {
            title: "Critical first, quality last",
            text: "Critical rules must hold on every attempt. A quality score can explain an attempt, but it never overrides a failed critical rule.",
          },
          blocks: [
            {
              type: "rows",
              rows: [
                { title: "Critical", detail: "The ending, required and forbidden routes, tools and steps, step order and duration." },
                { title: "Business", detail: "The expected outcome, turn limits and expected mocks." },
                { title: "Quality", detail: "Judge questions, last and advisory. They can add a failure, never rescue one." },
              ],
            },
            { type: "text", text: "A timing rule kept on a scripted scenario is labelled **not provable** and never counts as a pass." },
            { type: "text", text: "When a retention window closes, the recording or transcript is released. Verdicts and the step trace are kept permanently." },
          ],
        }),
        {
          label: "Run this suite",
          title: "Run this suite",
          intro: "Everything below is pinned before the first attempt starts. The run is durable; you can close this page.",
          main: [
            {
              type: "fields",
              fields: [
                { label: "Test type", value: "Scripted" },
                { label: "Attempts", value: "3" },
              ],
            },
            { type: "value", label: "Total", value: "free" },
            { type: "value", label: "Ceilings", value: "0 · enforced" },
            { type: "value", label: "Tool isolation", value: "Mocks only; live mutations unreachable" },
            { type: "text", text: "Submitting twice returns the same run, so a retry cannot double the spend.", muted: true },
            { type: "buttons", items: [{ text: "Start run", primary: true }] },
            {
              type: "details",
              summary: "If the AI agent has no workflow yet",
              blocks: [
                { type: "status", tone: "warn", lines: ["This AI agent needs a workflow before this suite can start."] },
                { type: "buttons", items: [{ text: "Open Workflow" }] },
              ],
            },
          ],
          side: {
            label: "What a run pins",
            tip: {
              title: "Fixed when you press Start run",
              text: "The run pins the suite revision, its content hash and the compiled workflow. Editing the draft while it waits can't change what it proves.",
            },
            blocks: [
              { type: "text", text: "Scripted and chat scenarios need a workflow. The panel says so before you start." },
              {
                type: "list",
                items: [
                  "`no_scenarios`: nothing saved to run.",
                  "`suite_archived`: restore the suite first.",
                  "`active_run_limit`: too many runs in flight in this workspace.",
                  "`organization_budget`: too much spend committed to active runs.",
                ],
              },
              { type: "text", text: "Each refusal comes before anything is queued. Submitting twice returns the same run." },
            ],
          },
        },
        {
          label: "Read the result",
          title: "Every critical rule held",
          intro: "No forbidden route, tool or disclosure appeared in any attempt.",
          main: [
            {
              type: "fields",
              fields: [
                { label: "Critical rules", value: "3 / 3", hint: "Must hold on every attempt" },
                { label: "Overall pass", value: "66.7%", hint: "Advisory signal only" },
                { label: "Failed attempts", value: "1", hint: "The AI agent broke a rule" },
                { label: "Errored attempts", value: "0", hint: "Not counted for or against the AI agent" },
              ],
            },
            { type: "buttons", items: [{ text: "Rerun failed (1)" }] },
            { type: "hint", text: "Queues a new run of the scenarios that failed, on the same revision 4 and the same AI agent snapshot." },
            { type: "heading", text: "Attempt stream" },
            {
              type: "rows",
              rows: [
                { title: "Attempt 1 · Saturday opening hours", badges: [{ text: "Pass", tone: "ok" }] },
                { title: "Attempt 1 · Booking request", badges: [{ text: "Pass", tone: "ok" }] },
                {
                  title: "Attempt 1 · Asks for the manager",
                  detail: "`max_turns` expected 6, got 8",
                  badges: [{ text: "Fail", tone: "warn" }, { text: "Business" }],
                },
              ],
            },
            { type: "buttons", items: [{ text: "Save as regression" }, { text: "Link a real call" }] },
            { type: "note", text: "Suite revision 4 · Later edits cannot change what this page reports." },
          ],
          side: {
            label: "How to read it",
            tip: {
              title: "Pass, fail or error",
              text: "An errored attempt is a harness or provider failure. It is recorded on its own and never counted for or against your AI agent.",
            },
            blocks: [
              { type: "text", text: "While the tab is visible the page checks every five seconds: **Waiting to start**, then **Test in progress**, then the verdict." },
              { type: "text", text: "**Rerun failed** opens a child run on the same revision and snapshot. The original run's verdicts are untouched." },
              { type: "text", text: "**Save as regression** keeps a failed attempt as a permanent critical scenario, in a new suite revision." },
              { type: "text", text: "More: [Reading verdicts](/docs/simulations-lab#reading-verdicts)." },
            ],
          },
        },
      ],
    },

    // ------------------------------------------------------------ AI caller · chat
    {
      id: "adaptive-chat",
      label: "AI caller · chat",
      lede: "An AI caller talks to your workflow in text, following a persona you write. Metered against the suite budget.",
      steps: [
        {
          label: "Scenario",
          title: "New scenario",
          intro: "Describe the caller instead of writing their lines. A caller model writes each turn from your AI agent's last reply.",
          main: [
            {
              type: "choice",
              label: "Type of test",
              options: ["Scripted", "AI caller · chat", "AI caller · voice"],
              selected: "AI caller · chat",
              hint: "An AI plays the caller in text. Metered.",
            },
            {
              type: "fields",
              fields: [
                { label: "Name", value: "Reschedule, then changes mind" },
                { label: "Attempts", value: "6", hint: "1 to 25 per run." },
                { label: "Language", value: "en", mono: true, hint: "A language code such as en or et. Required for a voice test." },
                { label: "Rule level", value: "Critical", hint: "A critical scenario fails the whole run when it fails." },
              ],
            },
            {
              type: "fields",
              fields: [
                { label: "Caller goal", value: "Move Thursday's appointment to next week" },
                { label: "Caller's first words", value: "Hi, I need to change my booking." },
                { label: "Who the caller is", value: "Existing customer" },
                { label: "How the caller behaves", value: "Polite, a little rushed" },
                { label: "Cuts in when", value: "The AI agent reads out more than two time slots", hint: "One condition per line, up to 5." },
                { label: "Changes direction when", value: "Next week is offered", hint: "One condition per line, up to 5." },
              ],
            },
            { type: "heading", text: "What the AI agent must do" },
            {
              type: "fields",
              fields: [
                { label: "Must use tools", value: "reschedule_booking", mono: true, hint: "Names separated by commas." },
                { label: "Must not use tools", value: "cancel_booking", mono: true, hint: "Names separated by commas." },
                { label: "Max turns", value: "12", hint: "0 means no limit." },
                { label: "Max duration (ms)", value: "0", hint: "0 means no limit." },
              ],
            },
            { type: "heading", text: "Judge questions" },
            {
              type: "fields",
              fields: [
                { label: "Question 1", value: "Did the AI agent confirm the new time back to the caller?" },
                { label: "Passing score", value: "4 of 5" },
              ],
            },
            {
              type: "hint",
              text: "Up to 5. Each one is a separate, metered evaluator call on every attempt, and it never overrides a critical rule.",
            },
            {
              type: "buttons",
              items: [{ text: "Save scenario", primary: true }, { text: "Close" }, { text: "Discard draft" }],
            },
          ],
          side: {
            label: "What this tests",
            tip: {
              title: "A persona, not a script",
              text: "The caller may only say something, interrupt or hang up. Your AI agent's own model still makes every routing decision.",
            },
            blocks: [
              { type: "text", text: "Anything else from the caller, such as a tool call or invalid JSON, ends that attempt as an **error**, not a failure. Chat attempts don't retry it." },
              { type: "text", text: "The caller can't reach a real tool: chat attempts use the same test-only mocks as scripted ones." },
              { type: "text", text: "Set **Attempts** above 1 to measure consistency, not luck." },
              { type: "text", text: "More: [The adaptive caller](/docs/simulations-lab#the-adaptive-caller)." },
            ],
          },
        },
        policyStep({
          label: "What it may spend",
          tip: {
            title: "Claimed before it is made",
            text: "Every model call in a chat test, your AI agent's included, is claimed against the run's ceiling before it is made.",
          },
          blocks: [
            { type: "text", text: "A run that reaches its ceiling stops as **Budget reached**. Verdicts already recorded are final; attempts that hadn't started never run." },
            { type: "text", text: "Each judge question is a separate evaluator call on every attempt. Up to five per scenario, so they multiply what a run costs." },
            { type: "text", text: "If the evaluator can't answer, quality is **unknown**: neither a pass nor a failure, and that attempt leaves the quality average." },
            { type: "text", text: "More: [What a run may spend](/docs/simulations-lab#what-a-run-may-spend)." },
          ],
        }),
        {
          label: "Run this suite",
          title: "Run this suite",
          intro: "Everything below is pinned before the first attempt starts. The run is durable; you can close this page.",
          main: [
            {
              type: "fields",
              fields: [
                { label: "Test type", value: "AI caller · chat" },
                { label: "Attempts", value: "6" },
              ],
            },
            {
              type: "fields",
              fields: [
                { label: "Total", value: "…", placeholder: true },
                { label: "Ceilings", value: "… · enforced", placeholder: true },
              ],
            },
            { type: "value", label: "Tool isolation", value: "Mocks only; live mutations unreachable" },
            { type: "text", text: "Submitting twice returns the same run, so a retry cannot double the spend.", muted: true },
            { type: "buttons", items: [{ text: "Start run · est. …", primary: true }] },
            {
              type: "details",
              summary: "If the workspace is already busy",
              blocks: [
                { type: "status", tone: "warn", lines: ["Too many runs are active in this workspace. Wait for one to finish, then start this one."] },
              ],
            },
          ],
          side: {
            label: "What it may spend",
            tip: {
              title: "An upper bound, not a forecast",
              text: "The estimate assumes every attempt uses its whole turn budget and every judge question is judged. You are charged less, never more.",
            },
            blocks: [
              { type: "text", text: "The figure on this panel and the allowance the run enforces are one calculation." },
              { type: "text", text: "Every chat attempt also stops at a hard turn ceiling of its own, whatever rules you wrote." },
              { type: "text", text: "Your workspace caps runs in flight and the spend they commit together. Going over either is refused before anything is queued." },
            ],
          },
        },
        {
          label: "Read the result",
          title: "Test in progress",
          intro: "3 of 6 attempts have a result. This page updates automatically.",
          main: [
            {
              type: "fields",
              fields: [
                { label: "Critical rules", value: "3 / 6", hint: "Must hold on every attempt" },
                { label: "Overall pass", value: "33.3%", hint: "Advisory signal only" },
                { label: "Failed attempts", value: "1", hint: "The AI agent broke a rule" },
                { label: "Errored attempts", value: "1", hint: "Not counted for or against the AI agent" },
              ],
            },
            { type: "buttons", items: [{ text: "Cancel run" }] },
            { type: "heading", text: "Attempt stream" },
            {
              type: "hint",
              text: "Newest attempts are listed in a stable order. An attempt error is not a verdict: it is never counted for or against the agent.",
            },
            {
              type: "rows",
              rows: [
                { title: "Attempt 1 · Reschedule, then changes mind", detail: "Caller interrupted 2 times", badges: [{ text: "Pass", tone: "ok" }] },
                {
                  title: "Attempt 2 · Reschedule, then changes mind",
                  detail: "`max_turns` expected 12, got 15",
                  badges: [{ text: "Fail", tone: "warn" }, { text: "Business" }],
                },
                {
                  title: "Attempt 3 · Reschedule, then changes mind",
                  detail: "This attempt errored, so it is not scored for or against the AI agent.",
                  badges: [{ text: "Error" }],
                },
                { title: "Attempt 4 · Reschedule, then changes mind", detail: "Caller hung up", badges: [{ text: "Pass", tone: "ok" }] },
              ],
            },
          ],
          side: {
            label: "While it runs",
            tip: {
              title: "Progress is not a pass",
              text: "Queued or running work is never shown as a completed pass. A critical failure shows as soon as it is recorded.",
            },
            blocks: [
              { type: "text", text: "Each attempt's checks appear as soon as it finishes, while the rest of the run continues." },
              { type: "text", text: "**Cancel run** stops the remaining work. Verdicts already recorded stay as they are." },
              { type: "text", text: "Test conversations are marked synthetic and left out of your call lists and analytics by default." },
            ],
          },
        },
      ],
    },

    // ----------------------------------------------------------- AI caller · voice
    {
      id: "adaptive-voice",
      label: "AI caller · voice",
      lede: "An AI caller talks to your AI agent out loud in a test room, on the agent's own engine. No phone number is involved.",
      steps: [
        {
          label: "Scenario",
          title: "New scenario",
          intro: "The same persona fields as a chat test, plus the caller's background noise and timing rules.",
          main: [
            {
              type: "choice",
              label: "Type of test",
              options: ["Scripted", "AI caller · chat", "AI caller · voice"],
              selected: "AI caller · voice",
              hint: "An AI caller talks to your AI agent out loud, like a real call. No phone number needed.",
            },
            {
              type: "fields",
              fields: [
                { label: "Name", value: "Busy Saturday caller" },
                { label: "Attempts", value: "3", hint: "1 to 25 per run." },
                { label: "Language", value: "en", mono: true, hint: "A language code such as en or et. Required for a voice test." },
                { label: "Rule level", value: "Critical", hint: "A critical scenario fails the whole run when it fails." },
              ],
            },
            {
              type: "fields",
              fields: [
                { label: "Caller goal", value: "Book a table for four on Saturday evening" },
                { label: "Caller's first words", value: "Hi, are you open Saturday night?" },
                { label: "Cuts in when", value: "The AI agent lists more than two options", hint: "One condition per line, up to 5." },
                { label: "Changes direction when", value: "Seven o'clock is full", hint: "One condition per line, up to 5." },
              ],
            },
            { type: "heading", text: "Background noise at the caller" },
            {
              type: "fields",
              fields: [
                { label: "Caller input condition", value: "Cafe" },
                { label: "Noise level", value: "20%" },
              ],
            },
            { type: "heading", text: "What the AI agent must do" },
            {
              type: "fields",
              fields: [
                { label: "Must use tools", value: "check_availability", mono: true, hint: "Names separated by commas." },
                { label: "Must not use tools", value: "transfer_call", mono: true, hint: "Names separated by commas." },
                { label: "Starts replying within (ms)", value: "1500", hint: "0 means no limit." },
                { label: "Stops talking when interrupted within (ms)", value: "500", hint: "0 means no limit." },
              ],
            },
            { type: "hint", text: "Every voice test also checks that the call ended normally." },
            {
              type: "buttons",
              items: [{ text: "Save scenario", primary: true }, { text: "Close" }, { text: "Discard draft" }],
            },
          ],
          side: {
            label: "What this tests",
            tip: {
              title: "A live call, no phone network",
              text: "A synthetic caller speaks to your real AI agent in a test room, on the agent's own saved engine. Nothing is substituted to make the test run.",
            },
            blocks: [
              { type: "text", text: "A voice test needs a language: the caller's voice and listener are chosen for it. Skysay never falls back to English." },
              { type: "text", text: "Background noise changes only the synthetic caller's microphone, never your AI agent's audio. Off is the quiet baseline. [Caller-input noise](/docs/audio-environments#add-caller-input-noise-to-a-simulation-scenario)." },
              { type: "text", text: "Business tools keep their normal validation and confirmation, then return your scenario's mock. Mocks are written through the API; editing here keeps them." },
              { type: "text", text: "Timing rules can be set on a voice scenario only." },
            ],
          },
        },
        policyStep({
          label: "Voice rules",
          tip: {
            title: "Paid from your wallet",
            text: "Voice tests are charged to your workspace wallet for measured usage. The run panel shows the most a run can reserve before you start.",
          },
          blocks: [
            { type: "text", text: "**Must use tools** passes only when the tool actually completed. Asking for confirmation isn't enough." },
            { type: "text", text: "**Must not use tools** fails as soon as the AI agent invokes the tool, even if it was refused or never finished." },
            { type: "text", text: "On a prompt call, workflow-only rules (routes, steps, order, turns) don't apply. Timing rules and judge questions apply to both." },
            { type: "text", text: "Recordings follow **Keep recordings (days)**. Verdicts and the step trace are kept permanently." },
          ],
        }),
        {
          label: "Run this suite",
          title: "Run this suite",
          intro: "Everything below is pinned before the first attempt starts. The run is durable; you can close this page.",
          main: [
            {
              type: "fields",
              fields: [
                { label: "Test type", value: "AI caller · voice" },
                { label: "Attempts", value: "3" },
              ],
            },
            {
              type: "status",
              title: "Voice tests",
              lines: [
                "Call mode: Workflow call",
                "Business tools use your scenario mocks after the usual validation and confirmation. No real messages, bookings or transfers are made. Knowledge search and conversation controls still work.",
                "Every voice test also checks that the call ended normally: the AI agent or our caller hung up, with no crash and no time limit reached.",
                "Each test call: at most 150 seconds and 20 caller turns.",
                "This run: 3 planned test calls. A call that fails on our side is retried once automatically, for at most 2 retries in this run.",
                "Up to …, including retries. Each test reserves funds from your workspace wallet, charges measured usage and returns the unused amount.",
              ],
            },
            { type: "text", text: "Submitting twice returns the same run, so a retry cannot double the spend.", muted: true },
            { type: "buttons", items: [{ text: "Start run", primary: true }] },
            {
              type: "details",
              summary: "If a voice test can't start",
              blocks: [
                {
                  type: "status",
                  tone: "warn",
                  lines: ["Voice tests can't start: a real call would refuse this AI agent's setup (for example a missing voice, prompt or greeting). Fix it in the AI agent's settings."],
                },
              ],
            },
          ],
          side: {
            label: "Before you start",
            tip: {
              title: "The same check as Start",
              text: "The panel runs the same admission check as Start run, so a voice test that would be refused says why before you press it.",
            },
            blocks: [
              { type: "text", text: "**Workflow call** when the engine can run workflow calls and the suite is pinned to a workflow. Otherwise a **Prompt call**, which needs no workflow." },
              { type: "text", text: "Each attempt reserves its own allowance from purchased funds before its room opens. Promotional credit doesn't fund simulations." },
              { type: "text", text: "Measured usage is summed, rounded up once and capped at the reservation. The unused amount returns to your balance." },
              { type: "text", text: "More: [Ceilings and cost](/docs/simulations-lab#ceilings-and-cost)." },
            ],
          },
        },
        {
          label: "Read the result",
          title: "This run failed a critical rule",
          intro: "2 attempts broke a critical rule. Quality scores never override that.",
          main: [
            {
              type: "fields",
              fields: [
                { label: "Critical rules", value: "1 / 3", hint: "Must hold on every attempt" },
                { label: "Overall pass", value: "33.3%", hint: "Advisory signal only" },
                { label: "Failed attempts", value: "2", hint: "The AI agent broke a rule" },
                { label: "Errored attempts", value: "0", hint: "Not counted for or against the AI agent" },
              ],
            },
            { type: "buttons", items: [{ text: "Rerun failed (2)" }] },
            { type: "hint", text: "Voice tests in this run: Workflow call. Business effects are mocked." },
            { type: "heading", text: "Attempt stream" },
            {
              type: "rows",
              rows: [
                { title: "Attempt 1 · Busy Saturday caller", badges: [{ text: "Pass", tone: "ok" }, { text: "Live call" }] },
                { title: "Attempt 2 · Busy Saturday caller", badges: [{ text: "Fail", tone: "warn" }, { text: "Live call" }] },
                { title: "Attempt 3 · Busy Saturday caller", badges: [{ text: "Fail", tone: "warn" }, { text: "Live call" }] },
              ],
            },
            {
              type: "details",
              summary: "Test call detail",
              blocks: [
                { type: "value", label: "Verdict", value: "Failed" },
                { type: "value", label: "How the call ended", value: "Our caller hung up." },
                { type: "heading", text: "Rules" },
                {
                  type: "rows",
                  rows: [
                    { title: "Ended normally", badges: [{ text: "Pass", tone: "ok" }] },
                    { title: "Uses tools", badges: [{ text: "Pass", tone: "ok" }] },
                    { title: "Starts replying in time", badges: [{ text: "Pass", tone: "ok" }] },
                    { title: "Stops talking when interrupted", detail: "expected at most 500 ms, got 640 ms", badges: [{ text: "Fail", tone: "warn" }] },
                  ],
                },
                { type: "heading", text: "Measured timings" },
                {
                  type: "rows",
                  rows: [
                    { title: "Reply started after line 1", detail: "820 ms" },
                    { title: "Stopped when interrupted after line 3", detail: "640 ms" },
                    { title: "Call length", detail: "52,400 ms" },
                  ],
                },
                {
                  type: "fields",
                  fields: [
                    { label: "What our caller heard", value: "AI agent: Is that a table for four?" },
                    { label: "What the AI agent recorded", value: "Caller: Yes, for for." },
                  ],
                },
                { type: "value", label: "Cost", value: "Charged: …" },
              ],
            },
          ],
          side: {
            label: "What an attempt shows",
            tip: {
              title: "Ended normally comes first",
              text: "If your AI agent's side ended the call (engine dropped, stopped responding), the attempt fails. If our side ended it, the attempt is an error.",
            },
            blocks: [
              { type: "text", text: "A timing bound already broken or a forbidden route already taken still fails an attempt that was cut short." },
              { type: "text", text: "Put **What our caller heard** beside **What the AI agent recorded** to spot a word one side misheard." },
              { type: "text", text: "A recording can arrive after the timing result. Reopen this result to check it: a new run is a new test and can cost again." },
              { type: "text", text: "More: [What an attempt shows](/docs/simulations-lab#what-an-attempt-shows)." },
            ],
          },
        },
      ],
    },
  ],
};

export default walkthrough;
