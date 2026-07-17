# V4.1 November Gate Recovery Incident

Attempt: `november-fe4f874f7a514075bcb6f48e3333d0e9`<br>
Gate opened: `2026-07-12T18:42:49.441736+00:00`<br>
Outcome recorded: `2026-07-12T19:15:22.903023+00:00`

The permanent access ledger was not reset, no 2025 outcome was read, and no
November metric was exposed before the atomic result. The final decision is a
failure on `G4_frozen_v3` and `G6_short_path_calibration`.

| Stage | Effect | Defect | Recovery |
|---|---|---|---|
| orchestration | Stopped before download | Scoped transform re-authorized an already-open November gate. | Resumed the same attempt with the exact November-only scoped config. |
| scorer projection | Stopped before the first batch | dist_km appeared twice in the PyArrow projection. | Deduplicated projection columns without changing features or calculations. |
| result provenance | Two complete passes ended before atomic result writing | Manual recovery supplied paths outside the artifact writer's lexical repository contract. | Used the absolute repository symlink path expected by the frozen orchestrator. |


Frozen scorer SHA-256: `3eaa6e71f01f6f97e8a495b516238bb1cefa6e4fae0497b465fbe996fd98b37c`<br>
Executed scorer SHA-256: `70d5acd2abe821f9c2b7bb590ae5abef8fb02f08965356acd936db08f4dc5b1a`<br>
Atomic result SHA-256: `4dd2bcdb16c9515aab399ad0659b4ca0a77a8d28a1e8b97b36364c67444a3824`
