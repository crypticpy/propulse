# Contact statistics through sync — #232 / #509 review

The existing cloud migration `20260216000000_qso_logging_enhancements.sql`
defines `my_grid` and `dxcc`. The local LogEntry model already carries `myGrid`
and `dxcc`, but both cloud serializers omitted them. A pulled contact therefore
lost its recorded home location and DXCC assignment, preventing Best DX distance
calculation and falling back to callsign inference for country counts. The
versioned push conflict reader could also report a false home-grid difference.

This correction preserves the fields in incremental logbook push/pull and
versioned push/delta/conflict-row mappings. The log_entries Row/Insert/Update
types now describe these two existing columns. Null cloud values remain
undefined locally; absent local values serialize as null consistently with the
other optional log fields. No current station location or inferred DXCC replaces
missing recorded metadata. Queue processing already passes transport fields
through; no queue or conflict policy changes are introduced.

## Evidence

Three regressions fail before the correction: both push round trips drop the
metadata and a matching newer server row produces a false grid conflict. All
five focused transport tests pass after the correction. They exercise public
sync entry points with mocked transport and local storage, clear local entries
before pulling to simulate another device, and feed the recovered entries into
the actual contact-summary function. Best DX exceeds 9,000 km for the fixture;
two recorded DXCC assignments remain distinct despite sharing a callsign prefix.
Missing metadata stays unknown. The broader 18-test contact/profile/report suite
and TypeScript check also pass.

Checkout `.worktrees/hamclock-contact-sync`, branch `fix/hamclock-contact-sync`,
based on #524. No server, real cloud sync, hardware, schema migration or database
write was performed. Full mandatory repository checks run before publication.
Actual deployed two-device acceptance remains pending; the tests establish the
mapping and statistics behavior, not a live synchronization session.

## Upgrade and existing-contact correction

A one-time, account-scoped metadata repair runs before either pull path. It
queries only IDs already present locally with missing home grid or DXCC, in
batches of 100, without timestamp/version filters. It fills only absent fields,
re-reading the local entry after each request so intervening edits and deletions
win. Existing fields, notes, versions and timestamps are untouched. Remote
soft-deleted rows are skipped. The marker is saved only after every batch
succeeds; errors and unavailable marker storage safely retry. Concurrent repair
calls for the same account share one operation. Neither sync cursor is reset.

For subsequent versioned deltas, an auto-merge also fills an absent home grid.
A differing recorded local grid retains the existing core-field conflict policy;
this change does not silently replace local edits or redesign conflict handling.

Ten transport tests now cover the original round trips plus upgraded installations
with advanced cursors, one-time repair, later deltas, retry, account separation,
in-flight edits/deletion and multiple batches. The new upgrade regressions fail
with the repair/merge correction removed and pass when restored. TypeScript and
the 16-test focused contact/metadata suite pass. Verification uses mocked transport and
local storage only; actual deployed upgrade and two-device acceptance remain
pending. The helper introduces no schema change or remote mutation.
