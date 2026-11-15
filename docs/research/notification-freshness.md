# Research: keeping in-app Notifications fresh

Ticket: [#3](https://github.com/MarkOel3/cohort-005-project/issues/3). Map: [#1](https://github.com/MarkOel3/cohort-005-project/issues/1).

**Question.** A user is already on the site. A Notification for them is created, for example about a Refund Request. How can it become visible to them, and what does each way cost with SQLite via Drizzle? Email and browser push are out of scope.

This note presents options and their trade-offs. It does not make the decision; that belongs to [#4](https://github.com/MarkOel3/cohort-005-project/issues/4).

## TL;DR

- **The stack is React Router v8, not v7.** `react-router`, `@react-router/serve`, `@react-router/node` and `@react-router/dev` are all pinned at `8.3.0` (`package.json`, and `node_modules/react-router/package.json`). The README also says "React Router v8 with SSR". The online docs are at 8.5.1. Everything below was checked against v8 docs and, where it matters, against the installed 8.3.0 source.
- **The hosting is not determined by the repo.** There is no Dockerfile for the app, no fly/vercel/netlify/render/railway config and no CI deploy workflow. The only runtime the repo defines is `npm start` = `react-router-serve ./build/server/index.js`. That is a single long-lived Node.js (>= 22) process running Express, with the SQLite file `data.db` on local disk. The only Dockerfile, `.sandcastle/Dockerfile`, is the agent sandbox, not the app. Everything below assumes that runtime. If the team later picks a serverless or edge host, the analysis changes (see "If hosting changes").
- **Four mechanisms, from least to most infrastructure:**
  1. Revalidation on navigation and after mutations. Built in and free. Not live: the user sees the new Notification only when they next navigate or submit.
  2. Polling with `useRevalidator().revalidate()` or `fetcher.load()` on a timer or on window focus. Works on the current runtime with no server changes. Cost: one request and SQLite read per open tab per interval. Delay of up to one interval.
  3. Server-sent events (SSE) through a resource route that returns a `text/event-stream` `Response`. Works on `react-router-serve` 8.3.0 as installed. Cost: one open connection per tab. On HTTP/1.1 the browser allows only 6 of these per domain. The server also needs a way to learn that a Notification was written (an in-process emitter, or polling SQLite on the server).
  4. WebSockets. Not possible with `react-router-serve`: it does not expose its HTTP server, and Node has no built-in WebSocket server. This needs a custom server (`@react-router/express` plus a library such as `ws`).
- **SQLite constraint for 3 and 4:** SQLite has no cross-connection change notification, and better-sqlite3 exposes none. A "push" therefore has to come from the app code that wrote the Notification, which only works within one process, or from the server polling the table.

## 1. Repo facts that shape the answer

| Fact | Source |
| --- | --- |
| React Router `8.3.0` (framework mode), `ssr: true` | `package.json`; `react-router.config.ts` |
| Prod runtime: `react-router-serve ./build/server/index.js` (Express 5 + `compression` + `morgan` + static) | `package.json` `start`; `node_modules/@react-router/serve/dist/cli.js` lines 17-21, 111-127 |
| No deployment target config in repo | `git ls-files` (no Dockerfile for the app, no platform config, no `.github/` workflows); `.dockerignore` exists but no matching app Dockerfile |
| SQLite through `better-sqlite3` 12, one lazy connection per process, `journal_mode = WAL`, file `data.db` | `app/db/index.ts` |
| The `layout.app` loader wraps almost every page and does several queries per request (all users, current user, recent courses with progress, team admin) | `app/routes/layout.app.tsx` lines 174-215 |
| Fetchers are already used widely; no `useRevalidator`, `shouldRevalidate`, `EventSource` or WebSocket usage today | `grep` over `app/` |
| README mentions signing up for Knock "when you build notifications" | `README.md`, "Signing Up Later". Knock is a third-party service; it is outside this ticket's in-app/self-hosted scope and was not researched. |

## 2. Mechanisms

### 2.1 Revalidation on navigation and after mutations (built in)

- In framework mode with SSR, "route loaders are automatically revalidated after all navigations and form submissions (this is different from Data Mode)" ([Route Module, `shouldRevalidate`](https://reactrouter.com/start/framework/route-module)).
- Default rules: "active loaders are revalidated on navigations and successful submissions (`Link`, `Form`, `fetcher.submit`)". Also: "Failed submissions returning a 4xx/5xx status do not trigger revalidations by default" ([Revalidation Optimization](https://reactrouter.com/how-to/optimize-revalidation)).
- Parent routes revalidate on their own: "A child that skips revalidation does not skip any ancestor routes" (same page).

**What this gives Notifications.** Suppose the unread count or list comes from a loader on a layout route, such as `layout.app` or a small dedicated route. Then any click or form submit on the site refreshes it, with no extra code.

**Limits.** Nothing updates while the user stays on one page. A student watching a lesson video would not see a Refund Request decision until they click.

**Cost.** Zero extra requests. The query runs inside a request that already happens. With SQLite, an indexed `SELECT count(*) ... WHERE user_id = ? AND read_at IS NULL` adds little to the existing `layout.app` loader work.

### 2.2 Polling: `useRevalidator` or `fetcher.load` on an interval or on focus

- `useRevalidator` exists to "Revalidate the data on the page for reasons outside of normal data mutations like Window focus or polling on an interval". Its signature is `revalidate(): Promise<void>` plus a `state` ([useRevalidator](https://reactrouter.com/api/hooks/useRevalidator)). It works in Framework and Data modes. The docs' example uses a placeholder focus hook, so the timer or focus listener is app code.
- `revalidate()` re-runs all active loaders, subject to each route's `shouldRevalidate` (rules as in 2.1). On a typical Cadence page that includes the heavy `layout.app` loader plus the page loader.
- A narrower option is a fetcher pointed at a small Notifications resource route. Resource routes are modules that export a `loader`/`action` and no default component, and they can return `Response`/`data()` ([Resource Routes](https://reactrouter.com/how-to/resource-routes)). Per the revalidation guide, `fetcher.load` data "only revalidates by default after action submissions and explicit `useRevalidator` calls" ([Revalidation Optimization](https://reactrouter.com/how-to/optimize-revalidation)). So it also stays current after the user's own mutations.

**Runtime support.** Full. These are ordinary GET requests to the existing Express server, with no server changes.

**Trade-offs.**
- The delay is at most one interval. The interval is a dial between freshness and load.
- Load is about (open tabs) × (1 / interval) requests. Example: 200 open tabs polling every 15 s is about 13 req/s.
- `revalidate()` on its own multiplies that by every active loader's queries. `fetcher.load` on a dedicated route costs one small query per poll.
- better-sqlite3 is synchronous: "This happens synchronously…" ([better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)). Each poll's query runs on the Node event loop. Indexed point reads are cheap, but they compete with the requests users are actually making.
- WAL mode (already on) means "readers do not block writers and a writer does not block readers" ([SQLite WAL](https://www.sqlite.org/wal.html)). Poll reads will not block the Refund Request write that creates a Notification.
- Polling while the tab is hidden wastes requests. Pausing on `document.hidden` and refreshing on focus is common app-level practice; React Router does not provide it.
- `morgan("tiny")` in `react-router-serve` logs every request (`cli.js` line 121), so polling adds log volume.

### 2.3 Server-sent events (SSE) via a resource route

**Mechanics.** A resource route's `loader` returns `new Response(readableStream, { headers: { "Content-Type": "text/event-stream" } })`. The browser subscribes with `EventSource`, which "opens a persistent connection to an HTTP server, which sends events in `text/event-stream` format" ([MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)). On each event, the client can call `revalidate()` or `fetcher.load()` to pull the new data, or it can read the data straight from the event. The React Router docs do not describe SSE; the resource-route page only shows returning a `Response` with a custom content type.

**Does the current runtime support it?** Yes. This was checked in the installed source, not in docs:
- `@react-router/express` 8.3.0 calls `res.flushHeaders()` when the response `Content-Type` matches `text/event-stream`. It aborts the request's `AbortSignal` on `res.on("close")` (`node_modules/@react-router/express/dist/index.js` lines 48, 63).
- `react-router-serve` puts `compression()` in front of everything (`cli.js` line 113). The compression README warns that it "does not work out of the box with server-sent events" unless `res.flush()` is called ([compression README](https://github.com/expressjs/compression#server-sent-events), also in `node_modules/compression/README.md` line 252). `@react-router/node`'s `writeReadableStreamToWritable` calls `writable.flush()` after every chunk when one exists (`node_modules/@react-router/node/dist/index.js` lines 120-121). So events are not held in the gzip buffer. A runtime check under `npm start` is still advisable before relying on this.

**Trade-offs.**
- **Connection limit.** "When not used over HTTP/2, SSE suffers from a limitation to the maximum number of open connections… set to a very low number (6)… per browser + domain" ([MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)). `react-router-serve` speaks HTTP/1.1. A user with 6+ Cadence tabs would starve their own page requests unless something in front of the server (a TLS-terminating proxy or CDN) serves HTTP/2. That depends on the undetermined hosting.
- **Server-side "something changed" signal.** SQLite offers `sqlite3_update_hook`, but it is registered "with the database connection" and is about changes on that connection ([SQLite update_hook](https://www.sqlite.org/c3ref/update_hook.html)). better-sqlite3 does not expose it in its API (`.prepare`, `.transaction`, `.pragma`, `.function`, `.aggregate`, `.table`, `.backup`, `.serialize`, `.loadExtension`, `.exec`, `.close`) ([better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)). Two practical options:
  - (a) An in-process event emitter, fired by the code path that inserts the Notification. This is immediate and adds no DB load, but only works while there is exactly one Node process. Writes from `scripts/seed.ts`, a second instance or a CLI would be missed.
  - (b) Each SSE connection, or one shared timer, polls the Notifications table on the server. This is polling again, but on the server side, with one connection instead of repeated HTTP requests.
- **Resources.** Each open tab keeps one socket and one stream open on the single Node process, plus a heartbeat to stop proxies from cutting idle connections. Proxies and hosts with response timeouts or buffering can break SSE. That again depends on the hosting.
- **Dev server.** `react-router dev` runs through Vite rather than `react-router-serve`. Streaming behaviour there was not verified for this note.

### 2.4 WebSockets

- `react-router-serve` cannot host them. It calls `app.listen(...)` internally and offers no hook into the HTTP server's `upgrade` event (`cli.js` lines 111-127). Its docs say: "By design, we do not provide options to customize the React Router App Server… If you find you want to customize it, you can migrate to the `@react-router/express` adapter" ([React Router App Server](https://reactrouter.com/api/other-api/serve)).
- Node 22's global `WebSocket` is "A browser-compatible implementation of WebSocket", meaning a client. It has been stable since v22.4.0 ([Node.js globals](https://nodejs.org/docs/latest-v22.x/api/globals.html#class-websocket)). Node has no built-in WebSocket server, so the server side needs a dependency such as `ws` attached to a custom HTTP server.
- **Trade-offs.**
  - The project would have to own a custom server entry point (`@react-router/express` plus `ws`), dev-mode wiring and session authentication on upgrade.
  - The connection is two-way, but Notifications only need server→client, so the extra capability goes unused.
  - It has the same SQLite "who tells the socket?" problem as SSE (2.3).
  - It is not subject to the browser's 6-per-domain HTTP/1.1 limit that SSE has.

## 3. Comparison

| | Live while idle on a page? | Server changes | Extra load | Works on current runtime | Depends on single process? |
| --- | --- | --- | --- | --- | --- |
| Revalidation on navigation/mutation | No | None | ~0 | Yes | No |
| Polling `revalidate()` | Yes, within interval | None | tabs × interval × all active loaders | Yes | No |
| Polling `fetcher.load` on a resource route | Yes, within interval | New small resource route | tabs × interval × 1 small query | Yes | No |
| SSE + in-process emitter | Yes, near-instant | Resource route returning a stream | 1 open connection per tab, ~0 DB | Yes (verified in source) | **Yes** |
| SSE + server-side DB poll | Yes, within server interval | Resource route returning a stream | 1 connection per tab + server poll queries | Yes | No |
| WebSockets | Yes, near-instant | Custom Express server + `ws` | 1 socket per tab | **No**, needs custom server | Yes, with in-process emitter |

These can be combined. For example: revalidation on navigation as the baseline, plus focus or interval polling or SSE as an upgrade.

## 4. If hosting changes

- **Serverless or edge (per-request functions):** long-lived SSE and WebSocket connections are usually limited or unsupported. A local SQLite file on disk is also generally unavailable. Only 2.1 and 2.2 would carry over unchanged. This is general platform knowledge, not checked against a specific provider, because none is chosen.
- **More than one Node instance:** an in-process emitter no longer reaches every connection. SQLite WAL also requires that "All processes using a database must be on the same host computer; WAL does not work over a network filesystem" ([SQLite WAL](https://www.sqlite.org/wal.html)). In that case, polling, or a shared pub/sub, becomes the default way to fan out notifications.

## Sources

- React Router docs (latest 8.5.1): [Route Module / shouldRevalidate](https://reactrouter.com/start/framework/route-module), [Revalidation Optimization](https://reactrouter.com/how-to/optimize-revalidation), [useRevalidator](https://reactrouter.com/api/hooks/useRevalidator), [Resource Routes](https://reactrouter.com/how-to/resource-routes), [Fetchers](https://reactrouter.com/how-to/fetchers), [React Router App Server](https://reactrouter.com/api/other-api/serve), [Data Loading](https://reactrouter.com/start/framework/data-loading)
- Installed source (8.3.0): `node_modules/@react-router/serve/dist/cli.js`, `node_modules/@react-router/express/dist/index.js`, `node_modules/@react-router/node/dist/index.js`, `node_modules/react-router/CHANGELOG.md`, `node_modules/compression/README.md`
- [MDN: EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [Node.js v22 globals: WebSocket](https://nodejs.org/docs/latest-v22.x/api/globals.html#class-websocket)
- [SQLite: Write-Ahead Logging](https://www.sqlite.org/wal.html), [SQLite: sqlite3_update_hook](https://www.sqlite.org/c3ref/update_hook.html)
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [expressjs/compression README: Server-Sent Events](https://github.com/expressjs/compression#server-sent-events)
