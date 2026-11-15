import { data } from "react-router";
import type { Route } from "./+types/api.notification-feed-token";
import { getCurrentUserId } from "~/lib/session";
import { getNotificationFeedConfig } from "~/lib/notification-feed.server";

// A fresh Knock user token for the signed-in user, fetched by the bell shortly
// before the current one expires, so a tab left open keeps its live feed.
export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    throw data("Select a user from the DevUI panel", { status: 401 });
  }

  const config = await getNotificationFeedConfig(userId);
  if (!config) throw data("Knock is not configured", { status: 404 });

  return Response.json({ userToken: config.userToken });
}
