"use client";

import { Fragment, useId, useRef, useState } from "react";

// Interactive walkthrough: tabs (one per path), an optional method switch, a
// pill step bar with Back/Next, a main card (a mock of the real screen) and a
// side panel (what to do elsewhere at that step), with Copy buttons.
//
// Every tab, method and step is rendered into the HTML and the inactive ones
// are `hidden`, so the page works without JavaScript for search and link
// checks, and switching never fetches anything. The data comes from
// src/walkthroughs/ through the server wrapper in walkthrough.jsx.

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

// The small inline markdown the data uses: **bold**, `code`, [text](href).
function Inline({ text }) {
  if (!text) return null;
  const parts = String(text).split(INLINE);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="wt-code-inline">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      return (
        <a key={i} href={link[2]} className="wt-link">
          {link[1]}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function CopyButton({ value, label, onCopied }) {
  const [state, setState] = useState("idle");
  const timer = useRef(null);
  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("done");
      onCopied(`Copied ${label}`);
    } catch {
      setState("failed");
      onCopied("Copy failed. Select the text instead.");
    }
    timer.current = setTimeout(() => setState("idle"), 1500);
  }
  return (
    <button type="button" className="wt-copy" onClick={copy} aria-label={`Copy ${label}`}>
      {state === "done" ? "Copied" : state === "failed" ? "Select it" : "Copy"}
    </button>
  );
}

function Field({ field }) {
  const cls = ["wt-input", field.mono ? "wt-mono" : "", field.placeholder ? "wt-placeholder" : ""].join(" ");
  return (
    <div className="wt-field">
      <span className="wt-field-label">{field.label}</span>
      <span className={cls}>
        <Inline text={field.value || " "} />
      </span>
      {field.hint ? (
        <span className="wt-hint">
          <Inline text={field.hint} />
        </span>
      ) : null}
    </div>
  );
}

function Block({ block: b, onCopied }) {
  switch (b.type) {
    case "text":
      return (
        <p className={b.muted ? "wt-text wt-muted" : "wt-text"}>
          <Inline text={b.text} />
        </p>
      );
    case "heading":
      return <p className="wt-subhead">{b.text}</p>;
    case "hint":
      return (
        <p className="wt-hint">
          <Inline text={b.text} />
        </p>
      );
    case "note":
      return (
        <p className="wt-note-line">
          <Inline text={b.text} />
        </p>
      );
    case "fields":
      return (
        <div className="wt-fields">
          {b.fields.map((f, i) => (
            <Field key={i} field={f} />
          ))}
        </div>
      );
    case "choice": {
      const selected = new Set([].concat(b.selected ?? []));
      return (
        <div className="wt-field">
          {b.label ? <span className="wt-field-label">{b.label}</span> : null}
          <span className="wt-choice">
            {b.options.map((o) => (
              <span key={o} className={selected.has(o) ? "wt-opt wt-opt-on" : "wt-opt"}>
                {selected.has(o) ? <span className="wt-sr">Selected: </span> : null}
                <Inline text={o} />
              </span>
            ))}
          </span>
          {b.hint ? (
            <span className="wt-hint">
              <Inline text={b.hint} />
            </span>
          ) : null}
        </div>
      );
    }
    case "checks":
      return (
        <div className="wt-field">
          {b.label ? <span className="wt-field-label">{b.label}</span> : null}
          <ul className="wt-checks">
            {b.items.map((item, i) => (
              <li key={i} className={item.checked ? "wt-check" : "wt-check wt-check-off"}>
                <span className={item.checked ? "wt-box wt-box-on" : "wt-box"} aria-hidden="true" />
                <span className="wt-sr">{item.checked ? "Ticked: " : "Not ticked: "}</span>
                <span>
                  <span className={item.mono ? "wt-mono" : undefined}>
                    <Inline text={item.text} />
                  </span>
                  {item.tag ? <span className="wt-tag">{item.tag}</span> : null}
                  {item.detail ? (
                    <span className="wt-hint wt-block">
                      <Inline text={item.detail} />
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {b.hint ? (
            <span className="wt-hint">
              <Inline text={b.hint} />
            </span>
          ) : null}
        </div>
      );
    case "rows":
      return (
        <ul className="wt-rows">
          {b.rows.map((r, i) => (
            <li key={i}>
              <span className="wt-row-text">
                <span className="wt-row-title">
                  <Inline text={r.title} />
                </span>
                {r.detail ? (
                  <span className="wt-hint wt-block">
                    <Inline text={r.detail} />
                  </span>
                ) : null}
              </span>
              {r.badges?.length ? (
                <span className="wt-badges">
                  {r.badges.map((x, j) => (
                    <span key={j} className={`wt-badge${x.tone ? ` wt-badge-${x.tone}` : ""}`}>
                      {x.text}
                    </span>
                  ))}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      );
    case "status":
      return (
        <div className={`wt-status${b.tone ? ` wt-status-${b.tone}` : ""}`}>
          {b.title ? (
            <p className="wt-status-title">
              <Inline text={b.title} />
            </p>
          ) : null}
          {b.lines.map((line, i) => (
            <p key={i}>
              <Inline text={line} />
            </p>
          ))}
        </div>
      );
    case "buttons":
      return (
        <div className="wt-buttons">
          {b.items.map((item, i) => (
            <span key={i} className={item.primary ? "wt-btn wt-btn-primary" : "wt-btn"}>
              {item.text}
            </span>
          ))}
        </div>
      );
    case "code":
      return (
        <div className="wt-codeblock">
          <div className="wt-codehead">
            <span>{b.label ?? "Example"}</span>
            <CopyButton value={b.code} label={b.label ?? "example"} onCopied={onCopied} />
          </div>
          <pre>
            <code>{b.code}</code>
          </pre>
        </div>
      );
    case "copy":
    case "value":
      return (
        <div className="wt-kv">
          {b.label ? <span className="wt-kv-label">{b.label}</span> : null}
          <span className="wt-kv-value">
            <span className={b.mono === false ? undefined : "wt-mono"}>
              <Inline text={b.value} />
            </span>
            {b.type === "copy" ? <CopyButton value={b.value} label={b.label} onCopied={onCopied} /> : null}
          </span>
        </div>
      );
    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <div>
          {b.label ? <p className="wt-subhead">{b.label}</p> : null}
          <Tag className={b.ordered ? "wt-list wt-list-ordered" : "wt-list"}>
            {b.items.map((item, i) => (
              <li key={i}>
                <Inline text={item} />
              </li>
            ))}
          </Tag>
        </div>
      );
    }
    case "table":
      return (
        <div className="wt-table-wrap">
          {b.label ? <p className="wt-subhead">{b.label}</p> : null}
          <table className="wt-table">
            {b.head ? (
              <thead>
                <tr>
                  {b.head.map((h, i) => (
                    <th key={i} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {b.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "details":
      return (
        <details className="wt-details">
          <summary>{b.summary}</summary>
          <div className="wt-stack">
            {b.blocks.map((inner, i) => (
              <Block key={i} block={inner} onCopied={onCopied} />
            ))}
          </div>
        </details>
      );
    default:
      return null;
  }
}

function StepPanel({ step, index, hidden, onCopied, panelId, labelId }) {
  const side = step.side;
  return (
    <div className="wt-grid" id={panelId} aria-labelledby={labelId} role="group" hidden={hidden}>
      <div className="wt-card">
        <div>
          <p className="wt-card-title" id={labelId}>
            {index + 1}. {step.title}
          </p>
          {step.intro ? (
            <p className="wt-text wt-muted">
              <Inline text={step.intro} />
            </p>
          ) : null}
        </div>
        {step.main.map((b, i) => (
          <Block key={i} block={b} onCopied={onCopied} />
        ))}
      </div>
      {side ? (
        <aside className="wt-side" aria-label={side.label}>
          <div>
            <p className="wt-eyebrow">{side.label}</p>
            {side.title ? <p className="wt-side-title">{side.title}</p> : null}
          </div>
          {side.tip ? (
            <div className="wt-tip">
              {side.tip.title ? <p className="wt-tip-title">{side.tip.title}</p> : null}
              <p>
                <Inline text={side.tip.text} />
              </p>
            </div>
          ) : null}
          {(side.blocks ?? []).map((b, i) => (
            <Block key={i} block={b} onCopied={onCopied} />
          ))}
        </aside>
      ) : null}
    </div>
  );
}

function flowsOf(tab) {
  return tab.methods ?? [{ id: "", label: "", steps: tab.steps }];
}

export function WalkthroughView({ data }) {
  const uid = useId();
  const first = Math.max(
    0,
    data.tabs.findIndex((t) => t.id === data.defaultTab),
  );
  const [tab, setTab] = useState(first);
  const [method, setMethod] = useState(0);
  const [step, setStep] = useState(0);
  const [announce, setAnnounce] = useState("");
  const tabRefs = useRef([]);

  function chooseTab(i, focus) {
    setTab(i);
    setMethod(0);
    setStep(0);
    if (focus) tabRefs.current[i]?.focus();
  }

  function onTabKey(e) {
    const last = data.tabs.length - 1;
    const next = { ArrowRight: tab + 1, ArrowLeft: tab - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    chooseTab(next > last ? 0 : next < 0 ? last : next, true);
  }

  const id = (...parts) => `${uid}-${parts.join("-")}`;

  return (
    <section className="wt not-prose" aria-label={`Walkthrough: ${data.title}`}>
      <div className="wt-top">
        <div className="wt-head">
          {data.crumb ? <p className="wt-crumb">{data.crumb}</p> : null}
          <p className="wt-title">{data.tabs[tab].title ?? data.title}</p>
          {(data.tabs[tab].lede ?? data.lede) ? (
            <p className="wt-text wt-muted">
              <Inline text={data.tabs[tab].lede ?? data.lede} />
            </p>
          ) : null}
        </div>
        {data.tabs.length > 1 ? (
          <div className="wt-tabs" role="tablist" aria-label="Choose your path">
            {data.tabs.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={id("tab", i)}
                aria-selected={i === tab}
                aria-controls={id("panel", i)}
                tabIndex={i === tab ? 0 : -1}
                onClick={() => chooseTab(i)}
                onKeyDown={onTabKey}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {data.tabs.map((t, ti) => {
        const flows = flowsOf(t);
        return (
          <div
            key={t.id}
            role={data.tabs.length > 1 ? "tabpanel" : undefined}
            id={id("panel", ti)}
            aria-labelledby={data.tabs.length > 1 ? id("tab", ti) : undefined}
            hidden={ti !== tab}
            className="wt-tabpanel"
          >
            {t.methods ? (
              <div className="wt-method-row">
                <span className="wt-hint" id={id("methods", ti)}>
                  {data.methodsLabel ?? "Method"}
                </span>
                <div className="wt-methods" role="group" aria-labelledby={id("methods", ti)}>
                {t.methods.map((m, mi) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={ti === tab && mi === method}
                    onClick={() => {
                      setMethod(mi);
                      setStep((s) => Math.min(s, m.steps.length - 1));
                    }}
                  >
                    {m.label}
                  </button>
                ))}
                </div>
              </div>
            ) : null}
            {flows.map((flow, fi) => {
              const active = ti === tab && fi === method;
              const current = active ? Math.min(step, flow.steps.length - 1) : 0;
              const count = flow.steps.length;
              return (
                <div key={flow.id || fi} hidden={fi !== (ti === tab ? method : 0)}>
                  <ol className="wt-steps" aria-label="Steps">
                    {flow.steps.map((s, si) => (
                      <li key={si}>
                        <button
                          type="button"
                          aria-current={si === current ? "step" : undefined}
                          aria-controls={id("step", ti, fi, si)}
                          onClick={() => setStep(si)}
                        >
                          <span className="wt-n" aria-hidden="true">
                            {si + 1}
                          </span>
                          <span className="wt-sr">Step {si + 1}: </span>
                          {s.label}
                        </button>
                      </li>
                    ))}
                  </ol>
                  {flow.steps.map((s, si) => (
                    <StepPanel
                      key={si}
                      step={s}
                      index={si}
                      hidden={si !== current}
                      onCopied={setAnnounce}
                      panelId={id("step", ti, fi, si)}
                      labelId={id("title", ti, fi, si)}
                    />
                  ))}
                  <div className="wt-nav">
                    {/* aria-disabled, not disabled: disabling the button that has
                        focus (Next onto the last step) would drop keyboard focus. */}
                    <button
                      type="button"
                      className="wt-btn"
                      aria-disabled={current === 0}
                      onClick={() => current > 0 && setStep(current - 1)}
                    >
                      Back
                    </button>
                    <span className="wt-count">
                      Step {current + 1} of {count}
                    </span>
                    <button
                      type="button"
                      className="wt-btn wt-btn-primary"
                      aria-disabled={current === count - 1}
                      onClick={() => current < count - 1 && setStep(current + 1)}
                    >
                      {current < count - 1 ? `Next: ${flow.steps[current + 1].label}` : "Next"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {data.note ? <p className="wt-footnote">{data.note}</p> : null}
      <p className="wt-sr" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
