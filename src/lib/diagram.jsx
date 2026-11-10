import { readFileSync } from "node:fs";
import path from "node:path";

import { DiagramFrame } from "@/components/diagram-frame.jsx";

// Renders a picture from public/diagrams/ inline, so its text uses the page's
// own fonts (Geist, JetBrains Mono). An <img> cannot use the page's web fonts.
// Server-only: the file is read when the page renders, at build time for the
// prerendered docs.
//
// Each picture's ids are prefixed with its name, so two pictures on one page
// cannot share an arrow marker. `alt` becomes the picture's <title> and
// aria-label; the page's markdown export (llms.txt) keeps it as the tag's
// attribute. DiagramFrame adds click to enlarge around the inline picture.
const DIAGRAMS = path.join(process.cwd(), "public", "diagrams");

function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function Diagram({ name, alt }) {
  if (!/^[a-z0-9-]+\.svg$/.test(name || "")) {
    throw new Error(`Diagram: "${name}" is not a file name in public/diagrams`);
  }
  if (!alt) {
    throw new Error(`Diagram ${name}: alt is required`);
  }
  const prefix = `dg-${name.slice(0, -4)}-`;
  const label = escapeXml(alt);
  const svg = readFileSync(path.join(DIAGRAMS, name), "utf8")
    .replace(/<\?xml[^>]*>\s*/, "")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, "")
    .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/g, "")
    .replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
    .replace(/\bhref="#([^"]+)"/g, `href="#${prefix}$1"`)
    .replace(/<svg\b([^>]*)>/, (_, attrs) => {
      const kept = attrs.replace(/\s(?:width|height|role|aria-label|aria-labelledby)="[^"]*"/g, "");
      return `<svg${kept} role="img" aria-label="${label}" width="100%" style="display:block;height:auto"><title>${label}</title>`;
    });
  return (
    <DiagramFrame>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </DiagramFrame>
  );
}
