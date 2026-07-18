# Durable Owner Fixture

`seed-owner-fixture.mjs` recreates the former development-only owner demo as
durable Supabase records. It is intended for private prelaunch product testing,
not production user onboarding or research/training data.

The fixture contains:

- the remembered `KB0EL` profile defaults when identity/location fields are blank
- the server-authoritative `ethereal` rank override
- 2 saved operating locations
- 5 radios, 5 antennas, 5 feedlines, 8 accessories, and 4 inline components
- 3 complete, location-linked station chains and matching presets
- 600 clearly labeled synthetic QSOs across 150 days, 12 bands, and 35 CQ zones
- 35 DXCC progress records, 10 achievements, and 8 equipment-history records

## Safety

- Requires an explicit email and resolves exactly one confirmed Auth user.
- Refuses any Supabase project except the expected `propulse-v2` project ref.
- Defaults to a read-only dry run; writes require `--apply`.
- Uses deterministic IDs and upserts, so reruns do not create duplicates.
- Preserves existing profile identity and location fields.
- Only updates fixture-owned rows and refuses to reassign globally keyed fixture
  records from another user.
- Marks every generated QSO as synthetic and not an on-air record.
- Never writes subscription or billing entitlements.

The operation is dependency ordered and rerunnable rather than transactional.
If a network or API failure interrupts a batch, rerun the same command.

## Run On The M5

Load the private service-role environment without printing it:

```sh
cd ~/Projects/propulse-cloud
set -a
source ~/Projects/propulse/.env.local
set +a
```

Preview the target account and row counts without writing:

```sh
npm run fixture:owner -- --email owner@example.com
```

Apply and verify the fixture:

```sh
npm run fixture:owner -- --email owner@example.com --apply
```

Run the deterministic fixture tests:

```sh
npm run test:owner-fixture
```

After applying, sign out and back in or trigger a full sync so the browser pulls
the cloud-backed profile, shack, DXCC, achievements, and logbook records.
