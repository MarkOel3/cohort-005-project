import { generateKeyPairSync } from "node:crypto";
import { importSPKI, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { getNotificationFeedConfig } from "./notification-feed.server";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const knockKeys = {
  KNOCK_PUBLIC_API_KEY: "pk_test_123",
  KNOCK_FEED_CHANNEL_ID: "feed-channel-uuid",
  KNOCK_SIGNING_KEY: privateKey,
};

async function verified(token: string) {
  const { payload, protectedHeader } = await jwtVerify(
    token,
    await importSPKI(publicKey, "RS256")
  );
  return { payload, protectedHeader };
}

describe("getNotificationFeedConfig", () => {
  it("gives nothing when the Knock keys are missing", async () => {
    expect(await getNotificationFeedConfig(42, {})).toBeNull();
  });

  it("gives the public key, feed channel and string user id, with a user token signed for that user", async () => {
    const config = await getNotificationFeedConfig(42, knockKeys);

    expect(config).toMatchObject({
      publicApiKey: "pk_test_123",
      feedChannelId: "feed-channel-uuid",
      userId: "42",
    });
    const { payload, protectedHeader } = await verified(config!.userToken);
    expect(protectedHeader.alg).toBe("RS256");
    expect(payload.sub).toBe("42");
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it("accepts the signing key pasted as one line with \\n for line breaks", async () => {
    const oneLine = privateKey.trim().replaceAll("\n", "\\n");

    const config = await getNotificationFeedConfig(7, {
      ...knockKeys,
      KNOCK_SIGNING_KEY: oneLine,
    });

    expect((await verified(config!.userToken)).payload.sub).toBe("7");
  });

  it("gives nothing without the signing key, so no feed opens without a user token", async () => {
    const { KNOCK_SIGNING_KEY: _, ...withoutSigningKey } = knockKeys;

    expect(await getNotificationFeedConfig(42, withoutSigningKey)).toBeNull();
  });
});
