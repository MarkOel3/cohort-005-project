// The bell and its Notification Feed dropdown, fed by Knock's in-app feed.
// Cadence's own markup on top of @knocklabs/react's provider and hooks (not
// Knock's pre-built popover, so there is no "Powered by Knock").
//
// Feed data loads only in the browser, so the server renders an empty badge.
// New Notifications arrive through Knock's WebSocket; Cadence never polls.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  KnockFeedProvider,
  KnockProvider,
  useKnockFeed,
  type KnockFeedProviderState,
  type KnockProviderProps,
} from "@knocklabs/react";
import { Bell, Check, Receipt, X } from "lucide-react";
import { cn, formatRelativeTime } from "~/lib/utils";
import type { NotificationFeedConfig } from "~/lib/notification-feed.server";

type NotificationData = { headline?: string; body?: string; link?: string };
type FeedItem = ReturnType<
  KnockFeedProviderState["feedClient"]["getState"]
>["items"][number] & { data: NotificationData | null };

/** Whether a KnockFeedProvider is mounted above the bell. */
const FeedConnected = createContext(false);

/**
 * Connects the signed-in user's Notification Feed. Without a config (signed
 * out, or no Knock keys) the Knock client stays idle and the feed is empty.
 */
export function NotificationFeedProvider({
  config,
  children,
}: {
  config: NotificationFeedConfig | null;
  children: React.ReactNode;
}) {
  // The layout loader signs a fresh token on every navigation. Keep the first
  // one per user: a new token would make Knock reconnect its socket each time.
  // onUserTokenExpiring fetches a new one before it runs out.
  const [pinned, setPinned] = useState(config);
  if (config?.userId !== pinned?.userId) setPinned(config);

  return (
    <KnockProvider
      apiKey={pinned?.publicApiKey}
      user={{ id: pinned?.userId ?? "" }}
      userToken={pinned?.userToken}
      onUserTokenExpiring={refreshUserToken}
      enabled={pinned !== null}
    >
      {pinned ? (
        <KnockFeedProvider feedId={pinned.feedChannelId}>
          <FeedConnected.Provider value={true}>
            {children}
          </FeedConnected.Provider>
        </KnockFeedProvider>
      ) : (
        children
      )}
    </KnockProvider>
  );
}

const refreshUserToken: KnockProviderProps["onUserTokenExpiring"] =
  async () => {
    const response = await fetch("/api/notification-feed-token");
    if (!response.ok) return;
    const { userToken } = (await response.json()) as { userToken: string };
    return userToken;
  };

function KindIcon({ workflow }: { workflow: string }) {
  if (workflow === "refund-request-approved")
    return <Check className="size-4 shrink-0 text-green-600" />;
  if (workflow === "refund-request-declined")
    return <X className="size-4 shrink-0 text-red-600" />;
  return <Receipt className="size-4 shrink-0 text-blue-600" />;
}

function UnseenBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

type Feed = {
  items: FeedItem[];
  unseenCount: number;
  markAsSeen: (items: FeedItem[]) => void;
  markAsRead: (item: FeedItem) => void;
  markAllAsRead: () => void;
};

const EMPTY_FEED: Feed = {
  items: [],
  unseenCount: 0,
  markAsSeen: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
};

/** The bell in the sidebar header, next to the Cadence wordmark. */
export function NotificationBell() {
  return useContext(FeedConnected) ? (
    <ConnectedBell />
  ) : (
    <BellDropdown feed={EMPTY_FEED} />
  );
}

function ConnectedBell() {
  const { feedClient, useFeedStore } = useKnockFeed();
  const { items, metadata } = useFeedStore();

  useEffect(() => {
    feedClient.fetch();
  }, [feedClient]);

  return (
    <BellDropdown
      feed={{
        items: items as FeedItem[],
        unseenCount: metadata.unseen_count,
        markAsSeen: (unseen) => feedClient.markAsSeen(unseen),
        markAsRead: (item) => feedClient.markAsRead(item),
        markAllAsRead: () => feedClient.markAllAsRead(),
      }}
    />
  );
}

function BellDropdown({ feed }: { feed: Feed }) {
  const { items } = feed;
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Opening marks everything in the dropdown seen; anything that arrives
  // while it is open is seen straight away.
  useEffect(() => {
    if (!open) return;
    const unseen = items.filter((item) => !item.seen_at);
    if (unseen.length > 0) feed.markAsSeen(unseen);
    // feed is rebuilt every render; items is what matters here.
  }, [open, items]);

  function follow(item: FeedItem) {
    feed.markAsRead(item);
    setOpen(false);
    if (item.data?.link) navigate(item.data.link);
  }

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
        aria-label="Notifications"
      >
        <Bell className="size-5" />
        <UnseenBadge count={feed.unseenCount} />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              onClick={feed.markAllAsRead}
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
            {items.map((item) => {
              const unread = !item.read_at;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => follow(item)}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left hover:bg-accent",
                      unread && "bg-primary/5"
                    )}
                  >
                    <KindIcon workflow={item.source.key} />
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "text-sm",
                          unread ? "font-semibold" : "font-normal"
                        )}
                      >
                        {item.data?.headline}
                      </div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {item.data?.body}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {formatRelativeTime(item.inserted_at)}
                      </div>
                    </div>
                    {unread && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-600" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
