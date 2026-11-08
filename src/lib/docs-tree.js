// Turns content/docs/meta.json's flat "---[Icon]Title---" separators into
// collapsible sidebar sections. Plain JS (no JSX) on purpose, like
// docs-sections.js: scripts/docs-tree.test.mjs imports this exact module.
//
// fumadocs renders a separator as a fixed heading with its icon and gives the
// pages after it no way to fold. A page-tree `folder` node is the one thing
// fumadocs folds, so each separator and the pages up to the next separator
// become one folder: same title, no icon, `defaultOpen` so every section
// starts expanded. content/docs/ stays a flat file list and meta.json keeps
// its separators (the section tab row in docs-tabs.jsx still reads them).
//
// Two behaviours come from fumadocs and are left as they are: a folder that
// holds the page being read is open on load, and a reader's fold is not
// remembered across page loads.

/**
 * @param {{ children: object[] }} tree a fumadocs page-tree root.
 * @returns the same root with each separator and its pages as one folder.
 *   Nodes before the first separator stay where they are.
 */
export function groupSeparatorsIntoSections(tree) {
  const children = [];
  let section = null;
  for (const node of tree.children) {
    if (node.type === "separator") {
      section = {
        type: "folder",
        $id: `section:${node.$id ?? node.name}`,
        // The separator's icon is dropped on purpose: sections carry no icon.
        name: node.name,
        collapsible: true,
        defaultOpen: true,
        children: [],
      };
      children.push(section);
    } else if (section) {
      section.children.push(node);
    } else {
      children.push(node);
    }
  }
  return { ...tree, children };
}
