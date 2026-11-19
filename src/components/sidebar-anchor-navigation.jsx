"use client";

import { useEffect } from "react";
import { useSidebar } from "fumadocs-ui/components/sidebar/base";

// Fumadocs closes its mobile drawer on pathname changes. Guide sections use
// the same pathname, so close it after a normal click on an anchor there too.
export function SidebarAnchorNavigation() {
  const { setOpen } = useSidebar();
  useEffect(() => {
    function closeAfterSectionLink(event) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element && event.target.closest("#nd-sidebar-mobile a[href]");
      if (!link) return;
      const target = new URL(link.href);
      if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.hash) {
        setOpen(false);
      }
    }
    document.addEventListener("click", closeAfterSectionLink);
    return () => document.removeEventListener("click", closeAfterSectionLink);
  }, [setOpen]);
  return null;
}
