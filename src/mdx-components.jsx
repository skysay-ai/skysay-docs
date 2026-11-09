import defaultMdxComponents from "fumadocs-ui/mdx";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Callout as FumadocsCallout, CalloutContainer as FumadocsCalloutContainer } from "fumadocs-ui/components/callout";
import { Card, Cards } from "fumadocs-ui/components/card";

import { Walkthrough } from "@/components/walkthrough.jsx";
import { Diagram } from "@/lib/diagram";

// Callouts carry no coloured side bar (founder, 2026-11-09). Every callout
// renders with the `docs-callout` class; src/styles.css hides Fumadocs' bar
// inside it, keeping the icon, title, border and spacing.
function withDocsCallout(Component) {
  return function DocsCallout({ className, ...props }) {
    return <Component className={className ? `docs-callout ${className}` : "docs-callout"} {...props} />;
  };
}
const Callout = withDocsCallout(FumadocsCallout);
const CalloutContainer = withDocsCallout(FumadocsCalloutContainer);

// Single component map shared by docs AND blog so a launch post and a
// quickstart render identically. Theming is driven by the fd-* tokens in
// src/styles.css; the callout wrapper above is the one override of a Fumadocs
// component.
export function getMDXComponents(components) {
  return {
    ...defaultMdxComponents,
    Steps,
    Step,
    Tabs,
    Tab,
    Callout,
    CalloutContainer,
    Card,
    Cards,
    Diagram,
    Walkthrough,
    ...components,
  };
}
