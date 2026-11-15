// PROTOTYPE: throwaway. Answers "What does a Notification look like, and how
// is it marked as seen?" (wayfinder ticket #5). Never merge to main.
//
// Three Notification Feed variants mounted in the real app layout, switchable
// via ?variant=A|B|C and the floating bottom bar. All state is in memory and
// resets on reload. Content follows "Who receives each refund Notification,
// and what does it say?" (#2). Link targets are placeholders until
// "Where does each refund Notification take its recipient?" (#7) decides them.
//
//   A  Bell + dropdown   opening the dropdown marks everything seen (badge
//                        clears); a Notification is read when clicked.
//   B  Feed page         sidebar entry with an unread count; nothing changes
//                        until you click a Notification, which marks it read.
//   C  Banner stack      no bell: unread Notifications sit above every page
//                        until dismissed or clicked; History holds the rest.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Bell, Check, X, Receipt, History } from "lucide-react";
import { cn } from "~/lib/utils";
import { PrototypeSwitcher } from "~/components/prototype-switcher";

export type Status = "unseen" | "seen" | "read";

export interface ProtoNotification {
  id: string;
  kind: "raised" | "approved" | "declined";
  headline: string;
  body: string;
  note?: { label: string; text: string };
  at: string;
  to: string;
  status: Status;
}

const RAISED: Omit<ProtoNotification, "status">[] = [
  {
    id: "r1",
    kind: "raised",
    headline: "Emma Wilson raised a Refund Request",
    body: "Introduction to TypeScript · £49.00 · Individual Purchase",
    note: {
      label: "Reason",
      text: "The pace was too fast for me and the generics module lost me completely. I don't think…",
    },
    at: "2 min ago",
    to: "/admin/refunds",
  },
  {
    id: "r2",
    kind: "raised",
    headline: "Bossy McBossface raised a Refund Request",
    body: "Building REST APIs with Node.js · £490.00 · Team Licence, 10 Seats",
    note: {
      label: "Reason",
      text: "Our team has moved its backend to Go, so nobody will take this course after all.",
    },
    at: "1 hour ago",
    to: "/admin/refunds",
  },
  {
    id: "r3",
    kind: "raised",
    headline: "Liam Thompson raised a Refund Request",
    body: "Design Systems with Tailwind · £39.00 · Individual Purchase",
    note: { label: "Reason", text: "Bought the wrong course by mistake." },
    at: "3 days ago",
    to: "/admin/refunds",
  },
];

const DECIDED: Omit<ProtoNotification, "status">[] = [
  {
    id: "d1",
    kind: "approved",
    headline: "Refund Request approved",
    body: "Your Refund Request for Introduction to TypeScript was approved. £49.00, the full amount you paid, will be returned. You no longer have access to Introduction to TypeScript.",
    note: {
      label: "Note",
      text: "Sorry it wasn't the right fit. Hope to see you back.",
    },
    at: "5 min ago",
    to: "/settings",
  },
  {
    id: "d2",
    kind: "declined",
    headline: "Refund Request declined",
    body: "Your Refund Request for Practical Data Visualisation was declined.",
    note: {
      label: "Note",
      text: "You've watched most of the course, which is past our Watch Limit, so we can't refund it.",
    },
    at: "2 hours ago",
    to: "/settings",
  },
  {
    id: "d3",
    kind: "approved",
    headline: "Refund Request approved",
    body: "Your Refund Request for the Team Licence for Building REST APIs with Node.js was approved. £490.00 will be returned.",
    at: "Yesterday",
    to: "/team",
  },
  {
    id: "d4",
    kind: "approved",
    headline: "Refund Request approved",
    body: "Your Refund Request for Shipping with Docker and Kubernetes was approved. £59.00, the full amount you paid, will be returned. You still have access to Shipping with Docker and Kubernetes through your team's Seat.",
    at: "Last week",
    to: "/settings",
  },
];

const LIVE_RAISED: Omit<ProtoNotification, "status" | "id">[] = [
  {
    kind: "raised",
    headline: "Sophia Davis raised a Refund Request",
    body: "Practical Data Visualisation · £45.00 · Individual Purchase",
    note: { label: "Reason", text: "The charts library used is outdated." },
    at: "Just now",
    to: "/admin/refunds",
  },
];
const LIVE_DECIDED: Omit<ProtoNotification, "status" | "id">[] = [
  {
    kind: "declined",
    headline: "Refund Request declined",
    body: "Your Refund Request for Design Systems with Tailwind was declined.",
    note: { label: "Note", text: "This purchase is more than 30 days old." },
    at: "Just now",
    to: "/settings",
  },
];

function initial(isAdmin: boolean): ProtoNotification[] {
  const list = isAdmin ? RAISED : DECIDED;
  // The oldest one has already been read, the rest are new.
  return list.map((n, i) => ({
    ...n,
    status: i === list.length - 1 ? "read" : "unseen",
  }));
}

// ---------------------------------------------------------------- state

interface Ctx {
  variant: string;
  items: ProtoNotification[];
  markAllSeen: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}
const NotificationsCtx = createContext<Ctx | null>(null);
function useNotifs() {
  const c = useContext(NotificationsCtx);
  if (!c) throw new Error("NotificationsPrototype missing");
  return c;
}

const VARIANTS = [
  { key: "A", name: "Bell + dropdown" },
  { key: "B", name: "Feed page" },
  { key: "C", name: "Banner stack" },
];

export function NotificationsPrototype({
  isAdmin,
  userKey,
  children,
}: {
  isAdmin: boolean;
  userKey: string;
  children: React.ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const [variant, setVariant] = useState(params.get("variant") ?? "A");
  const [items, setItems] = useState(() => initial(isAdmin));
  const liveCount = useRef(0);

  // Keep the variant across sidebar navigation (links drop ?variant=).
  useEffect(() => {
    const fromUrl = params.get("variant");
    if (fromUrl) {
      setVariant(fromUrl);
      sessionStorage.setItem("notif-proto-variant", fromUrl);
    } else {
      const stored = sessionStorage.getItem("notif-proto-variant");
      if (stored) setVariant(stored);
    }
  }, [params]);

  // Switching user resets the feed.
  useEffect(() => {
    setItems(initial(isAdmin));
  }, [userKey, isAdmin]);

  function changeVariant(key: string) {
    setVariant(key);
    sessionStorage.setItem("notif-proto-variant", key);
    const next = new URLSearchParams(params);
    next.set("variant", key);
    setParams(next, { replace: true, preventScrollReset: true });
    setItems(initial(isAdmin));
  }

  function simulateLive() {
    const pool = isAdmin ? LIVE_RAISED : LIVE_DECIDED;
    const n = pool[liveCount.current % pool.length];
    liveCount.current += 1;
    setItems((xs) => [
      { ...n, id: `live${liveCount.current}`, status: "unseen" },
      ...xs,
    ]);
  }

  const ctx: Ctx = {
    variant,
    items,
    markAllSeen: () =>
      setItems((xs) =>
        xs.map((x) => (x.status === "unseen" ? { ...x, status: "seen" } : x))
      ),
    markRead: (id) =>
      setItems((xs) =>
        xs.map((x) => (x.id === id ? { ...x, status: "read" } : x))
      ),
    markAllRead: () =>
      setItems((xs) => xs.map((x) => ({ ...x, status: "read" }))),
  };

  return (
    <NotificationsCtx.Provider value={ctx}>
      {children}
      <StatePanel
        onSimulate={simulateLive}
        onReset={() => setItems(initial(isAdmin))}
      />
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={changeVariant}
      />
    </NotificationsCtx.Provider>
  );
}

function StatePanel({
  onSimulate,
  onReset,
}: {
  onSimulate: () => void;
  onReset: () => void;
}) {
  const { items, variant } = useNotifs();
  const rule: Record<string, string> = {
    A: "Badge = unseen. Open dropdown → all seen. Click → read.",
    B: "Badge = unread (unseen + seen). Only a click → read.",
    C: "Shown as banner = seen. Dismiss / click → read.",
  };
  return (
    <div className="fixed bottom-16 left-60 z-[60] w-80 rounded-lg border-2 border-dashed border-yellow-500 bg-background/95 p-3 font-mono text-xs shadow-lg">
      <div className="mb-1 font-bold">PROTOTYPE state · variant {variant}</div>
      <div className="mb-2 text-muted-foreground">{rule[variant]}</div>
      <ul className="mb-2 space-y-0.5">
        {items.map((n) => (
          <li key={n.id} className="flex justify-between gap-2">
            <span className="truncate">
              {n.id} {n.headline}
            </span>
            <span
              className={cn(
                "shrink-0",
                n.status === "unseen" && "text-red-600",
                n.status === "seen" && "text-amber-600",
                n.status === "read" && "text-muted-foreground"
              )}
            >
              {n.status}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          onClick={onSimulate}
          className="rounded bg-yellow-400 px-2 py-1 font-semibold text-black"
        >
          Simulate live arrival
        </button>
        <button onClick={onReset} className="rounded border px-2 py-1">
          Reset
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- shared bits

function KindIcon({ kind }: { kind: ProtoNotification["kind"] }) {
  if (kind === "approved")
    return <Check className="size-4 shrink-0 text-green-600" />;
  if (kind === "declined")
    return <X className="size-4 shrink-0 text-red-600" />;
  return <Receipt className="size-4 shrink-0 text-blue-600" />;
}

function CountBadge({ n, className }: { n: number; className?: string }) {
  if (n === 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white",
        className
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

/** Rendered in the sidebar header next to "Cadence" (variant A only). */
export function NotificationsSidebarHeaderSlot() {
  const { variant } = useNotifs();
  return variant === "A" ? <BellDropdown /> : null;
}

/** Rendered in the sidebar nav list (variant B) / footer (variant C). */
export function NotificationsSidebarNavSlot() {
  const { variant, items } = useNotifs();
  const unread = items.filter((x) => x.status !== "read").length;
  if (variant === "B")
    return (
      <Link
        to="/notifications-prototype"
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        Notifications
        <CountBadge n={unread} className="ml-auto" />
      </Link>
    );
  if (variant === "C")
    return (
      <Link
        to="/notifications-prototype"
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <History className="size-4" />
        Notification history
      </Link>
    );
  return null;
}

/** Rendered above the page content (variant C only). */
export function NotificationsMainSlot() {
  const { variant } = useNotifs();
  return variant === "C" ? <BannerStack /> : null;
}

// ---------------------------------------------------------------- variant A

function BellDropdown() {
  const { items, markAllSeen, markRead, markAllRead } = useNotifs();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const unseen = items.filter((x) => x.status === "unseen").length;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Opening marks everything seen; anything arriving while open is seen too.
  useEffect(() => {
    if (open) markAllSeen();
  }, [open, items.length]);

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
        aria-label="Notifications"
      >
        <Bell className="size-5" />
        <CountBadge n={unseen} className="absolute -right-1 -top-1" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:underline"
            >
              Mark all as read
            </button>
          </div>
          <ul className="max-h-[28rem] divide-y overflow-y-auto">
            {items.length === 0 && (
              <li className="p-6 text-center text-sm text-muted-foreground">
                No Notifications yet
              </li>
            )}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    markRead(n.id);
                    setOpen(false);
                    navigate(n.to);
                  }}
                  className={cn(
                    "flex w-full gap-3 px-4 py-3 text-left hover:bg-accent",
                    n.status !== "read" && "bg-primary/5"
                  )}
                >
                  <KindIcon kind={n.kind} />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "text-sm",
                        n.status !== "read" ? "font-semibold" : "font-normal"
                      )}
                    >
                      {n.headline}
                    </div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {n.body}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {n.at}
                    </div>
                  </div>
                  {n.status !== "read" && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-600" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- variant B

/** The /notifications-prototype route body (variants B and C). */
export function NotificationFeedPage() {
  const { items, variant, markRead, markAllRead } = useNotifs();
  const [filter, setFilter] = useState<"unread" | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = items.filter((x) => filter === "all" || x.status !== "read");

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {variant === "C" ? "Notification history" : "Notifications"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Updates about Refund Requests that concern you.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex rounded-md border p-0.5">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded px-3 py-1 capitalize",
                  filter === f && "bg-accent font-medium"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={markAllRead}
            className="text-muted-foreground hover:underline"
          >
            Mark all as read
          </button>
        </div>
      </div>
      <div className="divide-y rounded-lg border">
        {shown.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            You're all caught up.
          </div>
        )}
        {shown.map((n) => {
          const expanded = openId === n.id;
          return (
            <div
              key={n.id}
              className={cn(
                "grid grid-cols-[auto_1fr_auto] gap-4 p-4",
                n.status !== "read" && "border-l-4 border-l-blue-600"
              )}
            >
              <KindIcon kind={n.kind} />
              <button
                className="text-left"
                onClick={() => {
                  setOpenId(expanded ? null : n.id);
                  markRead(n.id);
                }}
              >
                <div className={cn(n.status !== "read" && "font-semibold")}>
                  {n.headline}
                </div>
                <div
                  className={cn(
                    "text-sm text-muted-foreground",
                    !expanded && "line-clamp-1"
                  )}
                >
                  {n.body}
                </div>
                {expanded && n.note && (
                  <blockquote className="mt-2 border-l-2 pl-3 text-sm italic">
                    <span className="not-italic font-medium">
                      {n.note.label}:{" "}
                    </span>
                    {n.note.text}
                  </blockquote>
                )}
                {expanded && (
                  <Link
                    to={n.to}
                    className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
                  >
                    {n.kind === "raised"
                      ? "Review Refund Requests →"
                      : "View your purchases →"}
                  </Link>
                )}
              </button>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {n.at}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- variant C

function BannerStack() {
  const { items, markAllSeen, markRead } = useNotifs();
  const navigate = useNavigate();
  const visible = items.filter((x) => x.status !== "read");

  // Rendering a banner on screen counts as seen.
  useEffect(() => {
    if (items.some((x) => x.status === "unseen")) markAllSeen();
  }, [items]);

  if (visible.length === 0) return null;
  const [first, ...rest] = visible;

  return (
    <div className="sticky top-0 z-40 space-y-2 border-b bg-background/95 p-3 backdrop-blur">
      {[first, ...rest.slice(0, 1)].map((n) => (
        <div
          key={n.id}
          className={cn(
            "flex items-start gap-3 rounded-md border p-3",
            n.kind === "approved" &&
              "border-green-300 bg-green-50 dark:bg-green-950/30",
            n.kind === "declined" &&
              "border-red-300 bg-red-50 dark:bg-red-950/30",
            n.kind === "raised" &&
              "border-blue-300 bg-blue-50 dark:bg-blue-950/30"
          )}
        >
          <KindIcon kind={n.kind} />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">
              {n.headline}{" "}
              <span className="font-normal text-muted-foreground">
                · {n.at}
              </span>
            </div>
            <div>{n.body}</div>
            {n.note && (
              <div className="mt-1 text-muted-foreground">
                <span className="font-medium">{n.note.label}:</span>{" "}
                {n.note.text}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              markRead(n.id);
              navigate(n.to);
            }}
            className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
          >
            {n.kind === "raised" ? "Review" : "View"}
          </button>
          <button
            onClick={() => markRead(n.id)}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      {rest.length > 1 && (
        <Link
          to="/notifications-prototype"
          className="block text-center text-xs text-muted-foreground hover:underline"
        >
          +{rest.length - 1} more unread
        </Link>
      )}
    </div>
  );
}
