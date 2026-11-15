import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Knock, { type ClientOptions } from "@knocklabs/node";
import {
  NOTIFICATION_WORKFLOWS,
  type NotificationData,
  type NotificationKind,
} from "~/lib/notification-kinds";

// ─── In-app Notifications ───
// Knock delivers every Notification to its recipients' Notification Feeds when
// KNOCK_SECRET_API_KEY is set. Without a key (local dev, tests) each one is
// written to .notifications/ as a JSON file instead, so nothing calls Knock or
// uses up the Free plan's monthly Messages.
//
// Sending is best effort: a Notification that fails to send is logged and
// lost, and never fails the action that raised it.

export type { NotificationKind };

/** A Cadence user as Knock sees them. Knock ids are strings. */
export type NotificationPerson = { id: string; name: string; email: string };

export type Notification = {
  kind: NotificationKind;
  recipients: NotificationPerson[];
  /** Who caused it. Knock also uses it to leave out self-notification. */
  actor: NotificationPerson;
  headline: string;
  body: string;
  /** Fixed when sent: a sent Knock Message can't be edited. */
  link: string;
  refundRequestId: number;
};

export interface NotificationTransport {
  send(notification: Notification): Promise<void>;
}

type KnockOptions = Pick<ClientOptions, "fetch">;

/**
 * Triggers the kind's Knock workflow. No SDK retries and no idempotency key:
 * delivery is best effort, and a retry could add Knock's latency to the
 * action's response more than once.
 */
export function knockTransport(
  secretApiKey: string,
  options: KnockOptions = {}
): NotificationTransport {
  const knock = new Knock({ apiKey: secretApiKey, maxRetries: 0, ...options });

  return {
    async send(notification) {
      await knock.workflows.trigger(
        NOTIFICATION_WORKFLOWS[notification.kind],
        {
          recipients: notification.recipients,
          actor: notification.actor,
          data: {
            headline: notification.headline,
            body: notification.body,
            link: notification.link,
            refundRequestId: notification.refundRequestId,
          } satisfies NotificationData,
        },
        // The SDK adds an idempotency key of its own; null removes it.
        { headers: { "Idempotency-Key": null } }
      );
    },
  };
}

export function outboxTransport(directory: string): NotificationTransport {
  return {
    async send(notification) {
      mkdirSync(directory, { recursive: true });
      const file = join(
        directory,
        `${Date.now()}-${notification.kind}-${notification.refundRequestId}.json`
      );
      writeFileSync(file, JSON.stringify(notification, null, 2));
    },
  };
}

function defaultTransport(): NotificationTransport {
  const secretApiKey = process.env.KNOCK_SECRET_API_KEY;
  return secretApiKey
    ? knockTransport(secretApiKey)
    : outboxTransport(".notifications");
}

export async function sendNotifications(
  notifications: Notification[],
  transport: NotificationTransport = defaultTransport()
): Promise<void> {
  for (const notification of notifications) {
    try {
      await transport.send(notification);
    } catch (error) {
      console.error(
        `Could not send the ${notification.kind} Notification for Refund Request ${notification.refundRequestId}:`,
        error
      );
    }
  }
}
