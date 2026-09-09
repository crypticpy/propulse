import assert from "node:assert/strict";
import test from "node:test";
import {
  pathGapPreflightUrl,
  preflightPathRecencyHour,
  readPathGapPreflight,
} from "./path-recency-gap-preflight.mjs";

const HOUR = "2026-09-07T12:00:00.000Z";
const response = (body, contentRange = `${body.length ? `0-${body.length - 1}` : "*"}/${body.length}`) =>
  new Response(JSON.stringify(body), { headers: { "content-range": contentRange, "content-type": "application/json" } });

test("builds an exact bounded inclusive path-gap query", () => {
  const url = pathGapPreflightUrl("https://example.test", HOUR);
  assert.equal(url.pathname, "/rest/v1/collector_aggregation_gaps");
  assert.equal(url.searchParams.get("aggregation"), "eq.path_hourly");
  assert.equal(url.searchParams.get("start_hour"), `lte.${HOUR}`);
  assert.equal(url.searchParams.get("end_hour"), `gte.${HOUR}`);
  assert.equal(url.searchParams.get("limit"), "101");
});

test("accepts exact empty metadata and an inclusive known gap", async () => {
  assert.deepEqual(await readPathGapPreflight(response([]), Date.parse(HOUR)), []);
  assert.deepEqual(await readPathGapPreflight(response([{
    start_hour: HOUR,
    end_hour: "2026-09-07T13:00:00.000Z",
  }]), Date.parse(HOUR)), [{ startMs: Date.parse(HOUR), endMs: Date.parse("2026-09-07T13:00:00.000Z") }]);
});

test("fails closed for unavailable, malformed, inconsistent, or truncated metadata", async () => {
  await assert.rejects(readPathGapPreflight(new Response("", { status: 503 }), Date.parse(HOUR)), /HTTP 503/);
  await assert.rejects(readPathGapPreflight(new Response("no", { headers: { "content-range": "*/0" } }), Date.parse(HOUR)), /not JSON/);
  await assert.rejects(readPathGapPreflight(new Response("{}", { headers: { "content-range": "*/0" } }), Date.parse(HOUR)), /malformed/);
  await assert.rejects(readPathGapPreflight(response([], "*/1"), Date.parse(HOUR)), /truncated/);
  await assert.rejects(readPathGapPreflight(response([{ start_hour: HOUR, end_hour: HOUR }], "1-1/1"), Date.parse(HOUR)), /truncated/);
  await assert.rejects(readPathGapPreflight(response(Array.from({ length: 101 }, () => ({ start_hour: HOUR, end_hour: HOUR }))), Date.parse(HOUR)), /truncated/);
  await assert.rejects(readPathGapPreflight(response([{ start_hour: "bad", end_hour: HOUR }]), Date.parse(HOUR)), /invalid/);
  await assert.rejects(readPathGapPreflight(response([{ start_hour: "2026-09-07T10:00:00Z", end_hour: "2026-09-07T11:00:00Z" }]), Date.parse(HOUR)), /invalid/);
  await assert.rejects(readPathGapPreflight(response([
    { start_hour: HOUR, end_hour: HOUR },
    { start_hour: HOUR, end_hour: HOUR },
  ]), Date.parse(HOUR)), /duplicate or unsorted/);
  await assert.rejects(readPathGapPreflight(response([
    { start_hour: "2026-09-07T11:00:00Z", end_hour: HOUR },
    { start_hour: "2026-09-07T10:00:00Z", end_hour: HOUR },
  ]), Date.parse(HOUR)), /duplicate or unsorted/);
});

test("rejects oversized response bytes before parsing", async () => {
  const body = new TextEncoder().encode(JSON.stringify([{
    start_hour: HOUR,
    end_hour: HOUR,
    padding: "x".repeat(70_000),
  }]));
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(body.subarray(0, 40_000));
      controller.enqueue(body.subarray(40_000));
      controller.close();
    },
  });
  await assert.rejects(readPathGapPreflight(new Response(stream, {
    headers: { "content-range": "0-0/1" },
  }), Date.parse(HOUR)), /oversized/);
});

test("preflight sends only service headers and returns parsed gaps", async () => {
  let observed;
  const rows = await preflightPathRecencyHour({
    fetchImpl: async (url, init) => {
      observed = { url, init };
      return response([]);
    },
    supabaseUrl: "https://example.test",
    serviceKey: "test-key",
    hourISO: HOUR,
  });
  assert.deepEqual(rows, []);
  assert.equal(observed.init.headers.Prefer, "count=exact");
  assert.equal(observed.init.method, undefined);
  assert.equal(observed.url.searchParams.get("aggregation"), "eq.path_hourly");
});

test("rejects invalid input before network and propagates network failure", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("network down"); };
  await assert.rejects(preflightPathRecencyHour({
    fetchImpl, supabaseUrl: "https://example.test", serviceKey: "key", hourISO: "bad",
  }), /hour is invalid/);
  await assert.rejects(preflightPathRecencyHour({
    fetchImpl, supabaseUrl: "https://example.test", serviceKey: "key", hourISO: "2026-09-07T12:30:00Z",
  }), /hour is invalid/);
  assert.equal(calls, 0);
  await assert.rejects(preflightPathRecencyHour({
    fetchImpl, supabaseUrl: "https://example.test", serviceKey: "key", hourISO: HOUR,
  }), /network down/);
  assert.equal(calls, 1);
});
