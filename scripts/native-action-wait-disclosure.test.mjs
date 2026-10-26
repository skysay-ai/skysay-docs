import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const disclosure = "With Eleven Realtime, while an action runs, the agent cannot hear or answer the caller. Speech during that wait is absent from the transcript; the caller must repeat it after the action finishes. Speaking cannot stop an action that is already running. Interruptions work during normal speech. When the AI agent says goodbye, it ends the call itself: the caller cannot talk over the goodbye to keep the call going.";
for (const page of ["conversation-engines", "transfer-to-a-human", "voice-library"]) {
  test(`native action-wait disclosure is present on ${page}`, () => {
    const source = readFileSync(new URL(`../content/docs/${page}.mdx`, import.meta.url), "utf8");
    assert.ok(source.includes(disclosure), `${page} must disclose ignored speech, missing transcript, repeat and no action cancellation`);
  });
}
