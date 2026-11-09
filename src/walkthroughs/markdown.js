// Plain-text form of a walkthrough, for the page's processed markdown (the
// `.md` URL, /llms-full.txt and search). source.config.ts calls this for every
// <Walkthrough id="…" /> in a page, so AI readers get the same steps, fields and
// panel text the interactive version shows, from the same data.
//
// Strings in the data already use the small inline markdown the component
// renders (**bold**, `code`, [text](/docs/…)), so they pass through unchanged.

function indent(lines, by) {
  const pad = " ".repeat(by);
  return lines.map((line) => (line ? pad + line : line));
}

function joinLabel(label, text) {
  if (!label) return text;
  if (!text) return label;
  return `${label}: ${text}`;
}

// "Outgoing configured" -> "Outgoing configured." so joined lines stay readable.
function sentence(text) {
  return /[.!?:…”"]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

function fenced(code) {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return [fence, ...code.split("\n"), fence];
}

function table(head, rows) {
  const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const width = head ? head.length : Math.max(...rows.map((row) => row.length));
  const header = head ?? Array.from({ length: width }, () => "");
  return [
    `| ${header.map(cell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ];
}

// One block as markdown lines. Lists come back as `- ` items so a step reads as
// one bulleted list; code and tables come back as their own fenced/table lines.
function block(b) {
  switch (b.type) {
    case "text":
      return [b.text];
    case "heading":
      return [`**${b.text}**`];
    case "hint":
    case "note":
      return [b.text];
    case "fields":
      return b.fields.map((f) => {
        const value = f.placeholder ? `(${f.value})` : f.mono ? `\`${f.value}\`` : f.value;
        const head = value ? `${f.label}: ${value}` : f.label;
        return `- ${f.hint ? `${head}. ${f.hint}` : head}`;
      });
    case "choice": {
      const selected = new Set([].concat(b.selected ?? []));
      const options = b.options.map((o) => (selected.has(o) ? `**${o}** (chosen)` : o)).join(", ");
      return [`- ${b.label ? `${b.label}: ` : "Options: "}${options}.${b.hint ? ` ${b.hint}` : ""}`];
    }
    case "checks": {
      const lines = b.label ? [`${b.label}:`] : [];
      for (const item of b.items) {
        const extra = [item.tag ? `(${item.tag})` : "", item.detail ?? ""].filter(Boolean).join(" ");
        lines.push(`- [${item.checked ? "x" : " "}] ${item.mono ? `\`${item.text}\`` : item.text}${extra ? `: ${extra}` : ""}`);
      }
      if (b.hint) lines.push("", b.hint);
      return lines;
    }
    case "rows":
      return b.rows.map((r) => {
        const badges = (r.badges ?? []).map((x) => x.text).join(", ");
        return `- ${r.title}${badges ? ` (${badges})` : ""}${r.detail ? `: ${r.detail}` : ""}`;
      });
    case "status": {
      const text = (b.lines ?? []).map(sentence).join(" ");
      return [b.title ? `**${sentence(b.title)}** ${text}`.trim() : text];
    }
    case "buttons":
      return [`Buttons: ${b.items.map((i) => `**${i.text}**`).join(", ")}.`];
    case "code":
      return [...(b.label ? [`${b.label}:`] : []), ...fenced(b.code)];
    case "copy":
    case "value":
      return [`- ${joinLabel(b.label, b.mono === false ? b.value : `\`${b.value}\``)}`];
    case "list":
      return [
        ...(b.label ? [`${b.label}:`] : []),
        ...b.items.map((item, i) => `${b.ordered ? `${i + 1}.` : "-"} ${item}`),
      ];
    case "table":
      return [...(b.label ? [`${b.label}:`] : []), ...table(b.head, b.rows)];
    case "details":
      return [`- ${/[?:]$/.test(b.summary) ? b.summary : `${b.summary}:`}`, ...indent(blocks(b.blocks), 2)];
    default:
      throw new Error(`walkthrough: unknown block type ${JSON.stringify(b.type)}`);
  }
}

// Consecutive bullet lines stay one list; anything else is its own paragraph.
function blocks(list) {
  const out = [];
  for (const b of list ?? []) {
    const lines = block(b);
    // Tables never join a list: a table line directly under a list item would
    // be read as part of that item.
    const bullets = lines.every((line) => /^\s*(- |\d+\. )/.test(line) || line.trim() === "");
    if (out.length && bullets && out.at(-1).bullets) {
      out.at(-1).lines.push(...lines);
    } else {
      out.push({ bullets, lines: [...lines] });
    }
  }
  return out.flatMap((group, i) => (i ? ["", ...group.lines] : group.lines));
}

export function flowsOf(tab) {
  return tab.methods ?? [{ id: "", label: "", steps: tab.steps }];
}

export function walkthroughMarkdown(w) {
  const intro = [w.lede, w.note].filter(Boolean).join(" ");
  const out = [`**Walkthrough: ${w.title}.**${intro ? ` ${intro}` : ""}`];
  for (const tab of w.tabs) {
    for (const flow of flowsOf(tab)) {
      // A side panel often repeats the same reference blocks on every step;
      // print each one the first time only, so the text doesn't repeat itself.
      const printed = new Set();
      const name = flow.label ? `${tab.label}, with ${flow.label}` : tab.label;
      const heading = tab.title && tab.title !== w.title ? `${name}: ${tab.title}` : name;
      out.push(`**${heading}.**${tab.lede ? ` ${tab.lede}` : ""}`);
      flow.steps.forEach((step, i) => {
        const head = `**Step ${i + 1} of ${flow.steps.length}, ${step.label}: ${step.title}.**`;
        out.push(step.intro ? `${head} ${step.intro}` : head);
        const main = blocks(step.main);
        if (main.length) out.push(main.join("\n"));
        const side = step.side;
        if (side) {
          // Labels are written in sentence case ("At DIDWW"); the component
          // uppercases them with CSS, so the text here keeps carrier names.
          const title = [side.label, side.title].filter(Boolean).join(": ");
          const tip = side.tip ? ` ${side.tip.title ? `${side.tip.title}: ` : ""}${side.tip.text}` : "";
          out.push(`*${title}.*${tip}`);
          const fresh = (side.blocks ?? []).filter((b) => {
            const key = JSON.stringify(b);
            if (printed.has(key)) return false;
            printed.add(key);
            return true;
          });
          const rest = blocks(fresh);
          if (rest.length) out.push(rest.join("\n"));
        }
      });
    }
  }
  return out.join("\n\n");
}
