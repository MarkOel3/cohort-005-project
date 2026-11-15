// How the two kinds of Purchase are named in copy. Kept apart from
// refunds.server.ts so pages can use it without pulling the database into the
// client bundle.

// There is no column saying which kind a Purchase is: a Team Licence is the
// Purchase that granted Seats, and every Team Licence grants at least one.
export type PurchaseKind = "individual_purchase" | "team_licence";

/** "1 Seat", "3 Seats". Pass "seat" for a lowercase label. */
export function formatSeatCount(
  count: number,
  noun: "Seat" | "seat" = "Seat"
): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The short label on a buyer's Refund Request: "Individual" or "Team Licence · 3 seats". */
export function purchaseKindLabel(kind: PurchaseKind, seatCount: number): string {
  return kind === "team_licence"
    ? `Team Licence · ${formatSeatCount(seatCount, "seat")}`
    : "Individual";
}
