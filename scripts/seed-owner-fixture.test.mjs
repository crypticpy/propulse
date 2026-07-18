import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXTURE_MARKER,
  FIXTURE_PREFIX,
  buildFixture,
  canonicalSupabaseUrl,
  findForeignFixtureRow,
  fixtureCounts,
  maidenheadGrid4,
  stableUuid,
  validateFixture,
} from "./seed-owner-fixture.mjs";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RUN_AT = new Date("2026-07-18T18:30:00.000Z");

test("buildFixture creates the complete deterministic owner fixture", () => {
  const first = buildFixture(USER_ID, {}, RUN_AT);
  const second = buildFixture(USER_ID, {}, RUN_AT);

  assert.deepEqual(first, second);
  assert.deepEqual(validateFixture(first), {
    profiles: 1,
    saved_locations: 2,
    user_radios: 5,
    antennas: 5,
    feedlines: 5,
    accessories: 8,
    inline_components: 4,
    station_presets: 3,
    station_chains: 3,
    equipment_history: 8,
    log_entries: 600,
    dxcc_worked: 35,
    achievements: 10,
  });
  assert.deepEqual(fixtureCounts(first), validateFixture(first));
  assert.equal(first.profile.callsign, "KB0EL");
  assert.equal(first.profile.rank_override, "ethereal");
  assert.equal(first.profile.rank_points, 50_000);
});

test("profile seeding preserves existing identity and location fields", () => {
  const fixture = buildFixture(
    USER_ID,
    {
      callsign: "W1REAL",
      operator_name: "Existing Operator",
      grid: "FN31",
      lat: 41.3,
      lon: -72.9,
      timezone: "America/New_York",
      home_location_id: "real-home",
      active_location_id: "portable-real",
      interests: ["Emergency Communications"],
    },
    RUN_AT,
  );

  assert.equal(fixture.profile.callsign, "W1REAL");
  assert.equal(fixture.profile.operator_name, "Existing Operator");
  assert.equal(fixture.profile.grid, "FN31");
  assert.equal(fixture.profile.home_location_id, "real-home");
  assert.equal(fixture.profile.active_location_id, "portable-real");
  assert.deepEqual(fixture.profile.interests, ["Emergency Communications"]);
  assert.equal(fixture.profile.rank_override, "ethereal");
  assert.equal(fixture.locations[0].grid, "FN31");
  assert.equal(fixture.locations[0].lat, 41.3);
  assert.equal(fixture.locations[0].lon, -72.9);
  assert.equal(fixture.locations[0].timezone, "America/New_York");
});

test("QSO records are uniquely pageable and explicitly synthetic", () => {
  const fixture = buildFixture(USER_ID, {}, RUN_AT);
  const ids = fixture.qsos.map((item) => item.id);
  const timestamps = fixture.qsos.map((item) => item.updated_at);

  assert.equal(new Set(ids).size, 600);
  assert.equal(new Set(timestamps).size, 600);
  assert.deepEqual(timestamps, [...timestamps].sort());
  assert.ok(fixture.qsos.every((item) => item.notes.startsWith(FIXTURE_MARKER)));
  assert.ok(fixture.qsos.every((item) => item.last_device_id === FIXTURE_PREFIX));
  assert.equal(new Set(fixture.qsos.map((item) => item.cq_zone)).size, 35);
  assert.equal(new Set(fixture.qsos.map((item) => item.band)).size, 12);
  assert.ok(fixture.qsos.every((item) => /^[A-R]{2}[0-9]{2}$/.test(item.grid)));
});

test("stable UUIDs and grid conversion are valid", () => {
  assert.equal(stableUuid("qso-1"), stableUuid("qso-1"));
  assert.notEqual(stableUuid("qso-1"), stableUuid("qso-2"));
  assert.match(stableUuid("qso-1"), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(maidenheadGrid4(39.74, -104.99), "DM79");
  assert.equal(maidenheadGrid4(51.5, -0.1), "IO91");
});

test("service-role requests require the exact canonical Supabase origin", () => {
  assert.equal(
    canonicalSupabaseUrl("https://project-ref.supabase.co/", "project-ref"),
    "https://project-ref.supabase.co",
  );
  assert.throws(
    () => canonicalSupabaseUrl("https://project-ref.attacker.example", "project-ref"),
    /refusing to seed origin/,
  );
  assert.throws(
    () => canonicalSupabaseUrl("https://project-ref.supabase.co/rest/v1", "project-ref"),
    /refusing to seed origin/,
  );
});

test("ownership validation detects a conflict at a non-zero index", () => {
  const rows = [
    { id: "fixture-1", user_id: USER_ID },
    { id: "fixture-2", user_id: USER_ID },
    { id: "fixture-3", user_id: "22222222-2222-4222-8222-222222222222" },
  ];
  assert.deepEqual(findForeignFixtureRow(rows, USER_ID), rows[2]);
  assert.equal(findForeignFixtureRow(rows.slice(0, 2), USER_ID), null);
});
