import defaultMdxComponents from "fumadocs-ui/mdx";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Callout } from "fumadocs-ui/components/callout";
import { Card, Cards } from "fumadocs-ui/components/card";

// Single component map shared by docs AND blog so a launch post and a
// quickstart render identically. Theming is driven entirely by the fd-* tokens
// in src/styles.css — no per-component overrides needed here.
export function getMDXComponents(components) {
  return {
    ...defaultMdxComponents,
    Steps,
    Step,
    Tabs,
    Tab,
    Callout,
    Card,
    Cards,
    ...components,
  };
}
