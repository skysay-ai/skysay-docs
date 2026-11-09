"use client";

import { useEffect, useRef, useState } from "react";
import { Expand, Xmark } from "iconoir-react";

// Click to enlarge for <Diagram>. The picture stays the server-rendered inline
// SVG passed as children; this wrapper only adds a small button under its
// corner and a modal <dialog> that shows a copy of the same SVG: as large as
// the viewport allows on a wide screen, and at its native width in a
// scrollable pane on a narrow one (styles.css), so its labels keep their size.
// The native modal dialog makes the page inert and closes on Esc; Tab stays
// inside it; focus then returns to the corner button.
// The copy's ids move from `dg-` to `dgz-`, so its arrow markers never share
// an id with the inline picture's.
// The "scroll to see the whole picture" hint shows once per browser tab, the
// first time an enlarged picture is wider or taller than its pane.
const HINT_KEY = "diagram-scroll-hint-shown";
let hintShownHere = false;

function hintAlreadyShown() {
  try {
    return hintShownHere || window.sessionStorage.getItem(HINT_KEY) === "1";
  } catch {
    return hintShownHere;
  }
}

function rememberHintShown() {
  hintShownHere = true;
  try {
    window.sessionStorage.setItem(HINT_KEY, "1");
  } catch {
    // Storage can be blocked; the module flag still covers this page.
  }
}

export function DiagramFrame({ children }) {
  const pictureRef = useRef(null);
  const buttonRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const bodyRef = useRef(null);
  const [copy, setCopy] = useState(null);
  const [hint, setHint] = useState(false);
  const [scrolls, setScrolls] = useState(false);

  function open() {
    const svg = pictureRef.current?.querySelector("svg");
    if (!svg) return;
    setCopy({
      html: svg.outerHTML.replace(/(\bid="|url\(#|href="#)dg-/g, "$1dgz-"),
      width: svg.viewBox.baseVal?.width || 960,
    });
  }

  // Every way out (Esc, the close button, a click beside the picture) ends
  // here directly, not only through the dialog's close event, which a hidden
  // tab can hold back. The close event still lands here when the browser
  // closes the dialog by itself.
  function close() {
    if (dialogRef.current?.open) dialogRef.current.close();
    setCopy(null);
    setHint(false);
    setScrolls(false);
    buttonRef.current?.focus();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!copy || !dialog) return undefined;
    const root = document.documentElement;
    root.classList.add("diagram-zoom-open");
    if (!dialog.open) dialog.showModal();
    const body = bodyRef.current;
    const overflows = body && (body.scrollWidth > body.clientWidth + 1 || body.scrollHeight > body.clientHeight + 1);
    setScrolls(Boolean(overflows));
    if (overflows && !hintAlreadyShown()) {
      rememberHintShown();
      setHint(true);
    }
    return () => root.classList.remove("diagram-zoom-open");
  }, [copy]);

  return (
    <div className="diagram not-prose my-6">
      <div ref={pictureRef} className="diagram-picture" onClick={open}>
        {children}
      </div>
      <button ref={buttonRef} type="button" className="diagram-enlarge" onClick={open} aria-haspopup="dialog">
        <Expand aria-hidden="true" width={14} height={14} strokeWidth={1.8} />
        <span className="diagram-enlarge-click">Click to enlarge</span>
        <span className="diagram-enlarge-tap">Tap to enlarge</span>
      </button>
      {copy ? (
        <dialog
          ref={dialogRef}
          className="diagram-dialog"
          aria-label="Enlarged diagram"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClose={close}
          onKeyDown={(event) => {
            // Tab moves between the close button and, when the picture is
            // larger than its pane, the pane itself (so arrow keys scroll it).
            if (event.key !== "Tab") return;
            event.preventDefault();
            const toPane = scrolls && document.activeElement !== bodyRef.current;
            (toPane ? bodyRef.current : closeRef.current)?.focus();
          }}
          onClick={(event) => {
            // Beside the picture: the dialog, its padding, or the empty bands
            // the fitted SVG leaves around its card (they hit the <svg> itself).
            const target = event.target;
            const body = target.closest(".diagram-dialog-body");
            if (target === event.currentTarget || target === body || target === body?.firstElementChild) close();
          }}
        >
          <button ref={closeRef} type="button" className="diagram-close" onClick={close} aria-label="Close enlarged diagram">
            <Xmark aria-hidden="true" width={20} height={20} strokeWidth={1.8} />
          </button>
          <div
            ref={bodyRef}
            className="diagram-dialog-body"
            tabIndex={scrolls ? 0 : undefined}
            role={scrolls ? "group" : undefined}
            aria-label={scrolls ? "Enlarged diagram, scrollable" : undefined}
            style={{ "--diagram-native-width": `${copy.width}px` }}
            onScroll={() => setHint(false)}
            dangerouslySetInnerHTML={{ __html: copy.html }}
          />
          {hint ? (
            <p className="diagram-scroll-hint" role="status" onClick={() => setHint(false)}>
              Scroll to see the whole picture
            </p>
          ) : null}
        </dialog>
      ) : null}
    </div>
  );
}
