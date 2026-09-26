import { test } from "node:test";
import { strict as assert } from "node:assert";
import { searchPriority, type LogisticsRecord } from "../src/logistics_search.ts";

test("an open delivery exception precedes signed proof and routine events", () => {
  const records: LogisticsRecord[] = [
    { kind: "event", shipmentId: "S-42", sourceId: "scan-1", status: "in transit", detail: "Depot scan" },
    { kind: "pod", shipmentId: "S-42", sourceId: "signature-1", filename: "signed.pdf", detail: "Signed by recipient" },
    { kind: "exception", shipmentId: "S-42", sourceId: "case-1", reason: "address unclear", resolved: false, detail: "Driver called dispatch" }
  ];
  assert.deepEqual(records.sort((a, b) => searchPriority(a) - searchPriority(b)).map(item => item.kind), ["exception", "pod", "event"]);
});
