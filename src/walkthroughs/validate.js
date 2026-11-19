// Shape check for walkthrough data. getWalkthrough() runs it, so a malformed
// walkthrough fails the build instead of rendering a half-empty card.

export const BLOCK_TYPES = Object.freeze({
  text: ["text"], // { text, muted? }
  heading: ["text"], // small heading inside a card
  hint: ["text"], // small grey line
  note: ["text"], // footnote line with a rule above
  fields: ["fields"], // [{ label, value, hint?, mono?, placeholder? }], two per row
  choice: ["options"], // { label?, options: [string], selected: string | [string], hint? }
  checks: ["items"], // { label?, items: [{ text, checked, detail?, tag?, mono? }], hint? }
  rows: ["rows"], // [{ title, detail?, badges?: [{ text, tone?: "ok" | "warn" }] }]
  status: ["lines"], // { title?, lines: [string], tone?: "ok" | "warn" }
  buttons: ["items"], // [{ text, primary? }]
  code: ["code"], // { label?, code } with a Copy button
  copy: ["label", "value"], // key/value with a Copy button
  value: ["label", "value"], // key/value, no copy; { mono?: false } for prose
  list: ["items"], // { label?, ordered?, items: [string] }
  table: ["rows"], // { label?, head?: [string], rows: [[string]] }
  details: ["summary", "blocks"], // collapsible group of blocks
});

const TONES = new Set([undefined, "ok", "warn"]);

function fail(where, message) {
  throw new Error(`walkthrough ${where}: ${message}`);
}

function checkString(where, value, name) {
  if (typeof value !== "string" || !value.trim()) fail(where, `${name} must be a non-empty string`);
}

function checkBlocks(where, blocks) {
  if (!Array.isArray(blocks)) fail(where, "blocks must be an array");
  blocks.forEach((b, i) => {
    const at = `${where}[${i}]`;
    const required = BLOCK_TYPES[b?.type];
    if (!required) fail(at, `unknown block type ${JSON.stringify(b?.type)}`);
    for (const key of required) {
      if (b[key] === undefined || b[key] === null) fail(at, `${b.type} needs ${key}`);
    }
    if ((b.type === "status" || b.type === "rows") && b.tone !== undefined && !TONES.has(b.tone)) {
      fail(at, `unknown tone ${b.tone}`);
    }
    if (b.type === "rows") {
      for (const row of b.rows) {
        checkString(at, row.title, "row title");
        for (const badge of row.badges ?? []) if (!TONES.has(badge.tone)) fail(at, `unknown tone ${badge.tone}`);
      }
    }
    if (b.type === "choice") {
      for (const s of [].concat(b.selected ?? [])) {
        if (!b.options.includes(s)) fail(at, `selected ${JSON.stringify(s)} is not an option`);
      }
    }
    if (b.type === "details") checkBlocks(`${at}.blocks`, b.blocks);
  });
}

function checkSteps(where, steps) {
  if (!Array.isArray(steps) || steps.length === 0) fail(where, "needs at least one step");
  steps.forEach((step, i) => {
    const at = `${where}.steps[${i}]`;
    checkString(at, step.label, "label");
    checkString(at, step.title, "title");
    checkBlocks(`${at}.main`, step.main);
    if (step.side) {
      checkString(`${at}.side`, step.side.label, "label");
      checkBlocks(`${at}.side.blocks`, step.side.blocks ?? []);
    }
  });
}

function checkIds(where, items) {
  const seen = new Set();
  for (const item of items) {
    checkString(where, item.id, "id");
    checkString(where, item.label, "label");
    if (seen.has(item.id)) fail(where, `duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

export function validateWalkthrough(w) {
  checkString("(root)", w?.id, "id");
  const where = w.id;
  checkString(where, w.title, "title");
  if (!Array.isArray(w.tabs) || w.tabs.length === 0) fail(where, "needs at least one tab");
  checkIds(where, w.tabs);
  if (w.defaultTab !== undefined && !w.tabs.some((t) => t.id === w.defaultTab)) {
    fail(where, `defaultTab ${w.defaultTab} is not a tab`);
  }
  for (const tab of w.tabs) {
    const at = `${where}.${tab.id}`;
    if (tab.methods) {
      if (tab.steps) fail(at, "has both steps and methods");
      checkIds(at, tab.methods);
      for (const method of tab.methods) checkSteps(`${at}.${method.id}`, method.steps);
    } else {
      checkSteps(at, tab.steps);
    }
  }
  return w;
}
