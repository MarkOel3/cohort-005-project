import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  knockTransport,
  outboxTransport,
  sendNotifications,
  type Notification,
  type NotificationTransport,
} from "./notifier.server";

function raised(refundRequestId: number): Notification {
  return {
    kind: "refund_request_raised",
    recipients: [
      { id: "1", name: "Pat Admin", email: "pat@example.com" },
      { id: "2", name: "Quinn", email: "quinn@example.com" },
    ],
    actor: { id: "7", name: "Liam", email: "liam@example.com" },
    headline: "Refund Request raised for Test Course",
    body: "Liam asked for $49.00 back on an Individual Purchase of Test Course.",
    link: `/admin/refunds?refundRequest=${refundRequestId}`,
    refundRequestId,
  };
}

describe("sendNotifications", () => {
  it("writes each Notification to the outbox when there is no Knock key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));

    await sendNotifications([raised(41), raised(42)], outboxTransport(directory));

    const files = readdirSync(directory).sort();
    expect(files).toHaveLength(2);
    const written = files.map((file) =>
      JSON.parse(readFileSync(join(directory, file), "utf8"))
    );
    expect(written).toEqual(
      expect.arrayContaining([raised(41), raised(42)])
    );
  });

  it("logs a failed Notification and carries on with the rest", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const sent: number[] = [];
    const flaky: NotificationTransport = {
      async send(notification) {
        if (notification.refundRequestId === 41) throw new Error("Knock is down");
        sent.push(notification.refundRequestId);
      },
    };

    await expect(
      sendNotifications([raised(41), raised(42)], flaky)
    ).resolves.toBeUndefined();

    expect(sent).toEqual([42]);
    expect(log).toHaveBeenCalledTimes(1);
    const logged = log.mock.calls[0].map(String).join(" ");
    expect(logged).toContain("refund_request_raised");
    expect(logged).toContain("41");
    log.mockRestore();
  });
});

describe("the Knock transport", () => {
  function fakeKnock(status: number) {
    const requests: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return new Response(
        JSON.stringify(status < 300 ? { workflow_run_id: "run_1" } : {}),
        { status, headers: { "Content-Type": "application/json" } }
      );
    };
    return { fetch, requests };
  }

  it("triggers the workflow for the kind with string ids, the actor and the data", async () => {
    const knock = fakeKnock(200);

    await knockTransport("sk_test_123", { fetch: knock.fetch }).send(raised(42));

    expect(knock.requests).toHaveLength(1);
    const [request] = knock.requests;
    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://api.knock.app/v1/workflows/refund-request-raised/trigger"
    );
    expect(request.headers.get("authorization")).toBe("Bearer sk_test_123");
    expect(request.headers.get("idempotency-key")).toBeNull();
    expect(await request.json()).toEqual({
      recipients: [
        { id: "1", name: "Pat Admin", email: "pat@example.com" },
        { id: "2", name: "Quinn", email: "quinn@example.com" },
      ],
      actor: { id: "7", name: "Liam", email: "liam@example.com" },
      data: {
        headline: "Refund Request raised for Test Course",
        body: "Liam asked for $49.00 back on an Individual Purchase of Test Course.",
        link: "/admin/refunds?refundRequest=42",
        refundRequestId: 42,
      },
    });
  });

  it("fails once, without retrying, when Knock rejects the trigger", async () => {
    const knock = fakeKnock(503);

    await expect(
      knockTransport("sk_test_123", { fetch: knock.fetch }).send(raised(42))
    ).rejects.toThrow();

    expect(knock.requests).toHaveLength(1);
  });
});
