# Activation source freshness — #285

This is the first source-contract slice for the Activations wall tile/report, stacked on the shared-tuning implementation. #285 is the sole active implementation claim; #286 and B24 remain in review with follow-up ownership retained.

The existing aggregate `/api/activation/spots` already normalizes POTA, ParksnPeaks SOTA syndication and WWFF Spotline independently. The issue's WWFF requirement therefore reuses that existing adapter. WWBOTA and CanParks still require separate verified provider contracts; no provider or data is fabricated in this slice.

Each source now includes `checkedAt`, its own request-completion timestamp, and `fetchedAt`, the successful retrieval timestamp or null for failed/invalid data. The aggregate timestamp is not substituted for either source value. These fields are optional in the client type because older cached responses have neither; consumers must render missing source timing as unknown. A successful empty JSON array still has a valid retrieval time, while a bodyless response is invalid and has no successful retrieval stamp. Retrieval time is not the age of the underlying spot observation.

Tests hold one provider's response while the others finish, proving independent timestamps, failure handling and successful empty-feed semantics. A separate regression rejects bodyless HTTP success. Full repository gates run before publication. No new provider endpoint, credentials, hardware connection or renderer is introduced.

Next: build the wall tile and report with programme tabs, no-scroll measured rows, shared tuning and source-specific footers, then validate the additional programmes independently.
