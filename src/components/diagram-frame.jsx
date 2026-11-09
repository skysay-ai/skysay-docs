"use client";

import { useEffect, useRef, useState } from "react";
import { Expand, Xmark } from "iconoir-react";

// Click to enlarge for <Diagram>. The picture stays the server-rendered inline
// SVG passed as children; this wrapper only adds a small button under its corner and a modal
// <dialog> that shows a copy of the same SVG as large as the viewport allows.
// The native modal dialog makes the page inert and closes on Esc; Tab stays on
// its one control, the close button; focus then returns to the corner button.
// The copy's ids move from `dg-` to `dgz-`, so its arrow markers never share
// an id with the inline picture's.
export function DiagramFrame({ children }) {
  const pictureRef = useRef(null);
  const buttonRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const [copy, setCopy] = useState(null);

  function open() {
    const svg = pictureRef.current?.querySelector("svg");
    if (svg) setCopy(svg.outerHTML.replace(/(\bid="|url\(#|href="#)dg-/g, "$1dgz-"));
  }

  // Every way out (Esc, the close button, a click beside the picture) ends
  // here directly, not only through the dialog's close event, which a hidden
  // tab can hold back. The close event still lands here when the browser
  // closes the dialog by itself.
  function close() {
    if (dialogRef.current?.open) dialogRef.current.close();
    setCopy(null);
    buttonRef.current?.focus();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!copy || !dialog) return undefined;
    const root = document.documentElement;
    root.classList.add("diagram-zoom-open");
    if (!dialog.open) dialog.showModal();
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
            if (event.key === "Tab") {
              event.preventDefault();
              closeRef.current?.focus();
            }
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget || event.target.classList.contains("diagram-dialog-body")) close();
          }}
        >
          <button ref={closeRef} type="button" className="diagram-close" onClick={close} aria-label="Close enlarged diagram">
            <Xmark aria-hidden="true" width={20} height={20} strokeWidth={1.8} />
          </button>
          <div className="diagram-dialog-body" dangerouslySetInnerHTML={{ __html: copy }} />
        </dialog>
      ) : null}
    </div>
  );
}
