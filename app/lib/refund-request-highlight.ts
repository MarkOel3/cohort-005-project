// A Notification links to the page that shows its Refund Request with
// `?refundRequest=<id>`, and that page scrolls to and highlights it. Shared by
// the admin refunds page and the buyer's Settings page.
import { useEffect, useRef } from "react";
import { z } from "zod";

const highlightSchema = z.coerce
  .number()
  .int()
  .positive()
  .nullable()
  .catch(null);

/** The Refund Request id a link asks to highlight. An invalid one is ignored. */
export function parseHighlightedRefundRequest(
  searchParams: URLSearchParams
): number | null {
  return highlightSchema.parse(searchParams.get("refundRequest"));
}

/** A ref that scrolls its element into view once it is highlighted. */
export function useScrollIntoViewWhenHighlighted<T extends HTMLElement>(
  highlighted: boolean
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  return ref;
}
