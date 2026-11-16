/**
 * Tabs for a screen with several views of one thing (a station, the other-data modules), on
 * shadcn/ui's Tabs (Radix). The open tab is kept in the address (?tab=...), so a link or a page
 * refresh returns to it. Arrow keys, Home and End move between tabs, as the WAI-ARIA tabs pattern asks.
 */
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Tabs as TabsRoot, TabsContent, TabsList, TabsTrigger } from "./shadcn/tabs";

export interface TabDef {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Rendered only while the tab is open, so a closed tab makes no API requests. */
  render: () => ReactNode;
}

export function Tabs({ tabs, label, param = "tab" }: { tabs: TabDef[]; label: string; param?: string }) {
  const [search, setSearch] = useSearchParams();
  const wanted = search.get(param);
  const current = tabs.find((t) => t.id === wanted) ?? tabs[0];

  const open = (id: string) => {
    const params = new URLSearchParams(search);
    params.set(param, id);
    setSearch(params, { replace: true });
  };

  return (
    <TabsRoot value={current.id} onValueChange={open}>
      <TabsList aria-label={label} className="mb-5 h-auto flex-wrap justify-start gap-1">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="gap-2 px-3 py-1.5 text-ink-2 data-[state=active]:text-ink">
            {tab.icon && <tab.icon className="h-4 w-4" aria-hidden />}
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={current.id} className="mt-0">{current.render()}</TabsContent>
    </TabsRoot>
  );
}
