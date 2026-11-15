// ─── Notification Feed (client config) ───
// What the browser needs to open a signed-in user's Notification Feed through
// Knock: the public key, the in-app feed channel, the user's Knock id and a
// user token for Knock's enhanced security mode. Without the Knock keys there
// is no config, and the bell shows the empty state.
import { signUserToken } from "@knocklabs/node";

export type NotificationFeedConfig = {
  publicApiKey: string;
  feedChannelId: string;
  /** Knock ids are strings. */
  userId: string;
  userToken: string;
};

type Env = Partial<
  Record<
    "KNOCK_PUBLIC_API_KEY" | "KNOCK_FEED_CHANNEL_ID" | "KNOCK_SIGNING_KEY",
    string
  >
>;

export async function getNotificationFeedConfig(
  userId: number,
  env: Env = process.env
): Promise<NotificationFeedConfig | null> {
  const publicApiKey = env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = env.KNOCK_FEED_CHANNEL_ID;
  // The README has the PEM pasted into .env as one line, with \n for breaks.
  const signingKey = env.KNOCK_SIGNING_KEY?.replaceAll("\\n", "\n");
  if (!publicApiKey || !feedChannelId || !signingKey) return null;

  const knockUserId = String(userId);
  const userToken = await signUserToken(knockUserId, { signingKey });
  return { publicApiKey, feedChannelId, userId: knockUserId, userToken };
}
