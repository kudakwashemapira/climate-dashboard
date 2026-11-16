/**
 * The frame around every signed-in screen (CD-3.05 section 3): a left sidebar with grouped
 * navigation, and a top bar with search (Ctrl+K), Refresh, the theme switch and the account menu.
 * The sidebar is shadcn/ui's Sidebar: Ctrl+B or the button at the top folds it to icons (the choice is
 * remembered), and on a phone it slides in from the left. The search is its Command, the account
 * menu its DropdownMenu. "?" lists the keyboard shortcuts.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { NavLink, matchPath, useLocation, useNavigate } from "react-router-dom";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Keyboard, LogOut, Moon, PanelLeft, RefreshCw, Search, Sun, type LucideIcon } from "lucide-react";
import { setTheme, useTheme } from "../hooks/useTheme";
import { clearSession, displayName, useSession } from "../services/session";
import { Dialog } from "./Dialog";
import { ProductMark } from "./ProductMark";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./shadcn/command";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "./shadcn/dropdown-menu";
import { Separator } from "./shadcn/separator";
import {
  Sidebar as SidebarRoot, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, useSidebar,
} from "./shadcn/sidebar";
import { IconButton, cx } from "./ui";
import { ZchpcMark } from "./Zchpc";

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; keywords?: string }
export interface NavGroup { label: string; items: NavItem[] }

/** Folded to icons when the sidebar was last left that way (the cookie the Sidebar component writes). */
const startsFolded = (): boolean => document.cookie.split("; ").includes("sidebar_state=false");

function Brand({ appLabel }: { appLabel: string }) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      <ProductMark className="h-9 w-9 shrink-0 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8" ringed />
      <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
        <p className="truncate text-sm font-semibold text-white">Climate Dashboard</p>
        <p className="truncate text-xs text-sidebar-muted">{appLabel}</p>
      </div>
    </div>
  );
}

function Sidebar({ appLabel, nav }: { appLabel: string; nav: NavGroup[] }) {
  const session = useSession();
  const station = session?.user.station;
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  // On a phone the sidebar is a sheet over the page: going to a screen closes it.
  useEffect(() => { setOpenMobile(false); }, [pathname, setOpenMobile]);

  return (
    <SidebarRoot collapsible="icon" className="border-r-0">
      <SidebarHeader>
        <Brand appLabel={appLabel} />
        {station && (
          <div className="mx-1 rounded-md bg-white/10 px-3 py-2 group-data-[collapsible=icon]:hidden">
            <p className="text-[11px] font-medium uppercase tracking-wide text-sidebar-muted">Your station</p>
            <p className="truncate text-sm font-semibold text-white">{station.name}</p>
            <p className="text-xs text-sidebar-muted">{station.station_code}</p>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main navigation">
          {nav.map((group) => (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wide">{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      {/* Folded to icons, the tooltip names the screen. */}
                      <SidebarMenuButton asChild tooltip={item.label} className="h-9"
                        isActive={matchPath({ path: item.to, end: item.end ?? false }, pathname) !== null}>
                        <NavLink to={item.to} end={item.end}>
                          <item.icon aria-hidden />
                          <span className="truncate">{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        {/* Folded to icons, only the ZCHPC globe stays. */}
        <div className="flex items-center gap-2.5 px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          title="Developed and hosted by ZCHPC for DCCES">
          <ZchpcMark className="h-8 w-8" alt="ZCHPC" />
          <p className="min-w-0 text-[11px] leading-snug text-sidebar-muted group-data-[collapsible=icon]:hidden">
            Developed and hosted by <span className="font-semibold text-white">ZCHPC</span> for DCCES
          </p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </SidebarRoot>
  );
}

/** Folds the sidebar to icons and back; on a phone, opens it. */
function NavToggle() {
  const { toggleSidebar } = useSidebar();
  return <IconButton label="Show or hide the navigation (Ctrl+B)" onClick={toggleSidebar}><PanelLeft aria-hidden /></IconButton>;
}

/**
 * A screen matches when its name, group or keywords contain what was typed, as one piece: "farm"
 * finds the farmer screens only. Matches keep their menu order.
 */
const containsTyped = (value: string, search: string, keywords?: string[]): number =>
  `${value} ${keywords?.join(" ") ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0;

/** Ctrl+K: jump to any screen by typing part of its name. */
function CommandPalette({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: NavGroup[] }) {
  const navigate = useNavigate();
  const go = (to: string) => { onClose(); navigate(to); };
  return (
    <CommandDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }} filter={containsTyped}
      title="Go to a screen" description="Type part of a screen name, then press Enter.">
      <CommandInput placeholder="Search screens" aria-label="Search screens" />
      <CommandList>
        <CommandEmpty>No screen matches.</CommandEmpty>
        {nav.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem key={item.to} value={`${item.label} ${group.label}`} keywords={item.keywords ? [item.keywords] : undefined} onSelect={() => go(item.to)}>
                <item.icon aria-hidden />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

const SHORTCUTS: Array<{ keys: string[]; what: string }> = [
  { keys: ["Ctrl", "K"], what: "Search for a screen and go to it" },
  { keys: ["Ctrl", "B"], what: "Fold the sidebar to icons, or open it again" },
  { keys: ["?"], what: "Show this list" },
  { keys: ["Esc"], what: "Close a dialog, menu or pick list" },
  { keys: ["←", "→"], what: "Move between tabs" },
  { keys: ["↑", "↓", "Enter"], what: "Move through a pick list, menu or search results, and choose" },
  { keys: ["Tab"], what: "Go to the next button or field; Shift+Tab goes back" },
];

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} title="Keyboard shortcuts" description="On a Mac, use ⌘ for Ctrl." onClose={onClose} size="sm">
      <dl className="divide-y divide-line">
        {SHORTCUTS.map((s) => (
          <div key={s.what} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-ink-2">{s.what}</dt>
            <dd className="flex shrink-0 gap-1">
              {s.keys.map((k) => <kbd key={k} className="min-w-[1.75rem] rounded border border-line bg-subtle px-1.5 py-0.5 text-center font-sans text-[11px] font-semibold text-ink-2">{k}</kbd>)}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

/** Typing in a box, where "?" is a character and not a shortcut. */
const typingIn = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function AccountMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const session = useSession();
  if (!session) return null;
  const { user } = session;
  const name = displayName(user);
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  const role = user.is_superuser ? "National superadmin" : user.role?.name ?? "No role assigned";
  return (
    // Not modal: an item that opens a dialog (Keyboard shortcuts) would otherwise leave the page
    // unclickable after that dialog closes, a known Radix menu-then-dialog problem.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {/* The name is hidden on a small screen, so the button carries it for screen readers. */}
        <button type="button" aria-label={`${name}, account menu`}
          className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent" aria-hidden>{initials}</span>
          <span className="hidden max-w-[14rem] truncate text-sm font-medium text-ink md:block">{name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 shadow-pop">
        <DropdownMenuLabel className="px-3 py-2.5 font-normal">
          <p className="truncate font-semibold text-ink">{name}</p>
          <p className="truncate text-xs text-ink-2">{user.email}</p>
          <p className="mt-1.5 text-xs text-muted">{role}{user.station ? ` · ${user.station.station_code} ${user.station.name}` : ""}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onShortcuts} className="px-3 py-2.5 font-medium">
          <Keyboard aria-hidden />
          Keyboard shortcuts
          <kbd className="ml-auto rounded border border-line bg-subtle px-1.5 font-sans text-[11px] font-semibold text-ink-2">?</kbd>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={clearSession} className="px-3 py-2.5 font-medium">
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ appLabel, nav, children }: { appLabel: string; nav: NavGroup[]; children: ReactNode }) {
  const theme = useTheme();
  const client = useQueryClient();
  const fetching = useIsFetching() > 0;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); }
      // "?" opens the list, unless it is being typed or a dialog is already open.
      else if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !typingIn(e.target) && !document.querySelector("[role=dialog], [role=alertdialog]")) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SidebarProvider defaultOpen={!startsFolded()} style={{ "--sidebar-width": "15rem" } as CSSProperties}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:font-semibold focus:shadow-pop">
        Skip to content
      </a>
      <Sidebar appLabel={appLabel} nav={nav} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface px-4 sm:px-6">
          <NavToggle />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <button type="button" onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-muted shadow-sm hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate">Search screens</span>
            <kbd className="hidden rounded border border-line bg-subtle px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink-2 sm:block">Ctrl K</kbd>
          </button>
          <div className="flex-1" />
          <IconButton label="Refresh the data on this screen" onClick={() => client.invalidateQueries()}>
            <RefreshCw className={cx(fetching && "animate-spin")} aria-hidden />
          </IconButton>
          <IconButton label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </IconButton>
          <AccountMenu onShortcuts={() => setShortcutsOpen(true)} />
        </header>
        <main id="main" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} nav={nav} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </SidebarProvider>
  );
}
