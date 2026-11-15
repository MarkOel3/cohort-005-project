// The kinds of Notification and the Knock workflow each is sent through.
// Shared by the sender (notifier.server.ts) and the Notification Feed in the
// browser, so it must not import anything server-only.
import { z } from "zod";

const notificationKindSchema = z.enum([
  "refund_request_raised",
  "refund_request_approved",
  "refund_request_declined",
]);

export type NotificationKind = z.infer<typeof notificationKindSchema>;

/** One Knock workflow per kind, set up in the Knock dashboard. */
export const NOTIFICATION_WORKFLOWS: Record<NotificationKind, string> = {
  refund_request_raised: "refund-request-raised",
  refund_request_approved: "refund-request-approved",
  refund_request_declined: "refund-request-declined",
};

/** The kind a Knock workflow key belongs to, or null for any other workflow. */
export function kindOfWorkflow(workflowKey: string): NotificationKind | null {
  return (
    notificationKindSchema.options.find(
      (kind) => NOTIFICATION_WORKFLOWS[kind] === workflowKey
    ) ?? null
  );
}

/** The data every Notification carries to Knock, and back out of the feed. */
export const notificationDataSchema = z.object({
  headline: z.string(),
  body: z.string(),
  link: z.string(),
  refundRequestId: z.number(),
});

export type NotificationData = z.infer<typeof notificationDataSchema>;
