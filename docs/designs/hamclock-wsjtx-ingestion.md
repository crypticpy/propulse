# WSJT-X ingestion and decode-time frequency — #287

The bridge broadcasts status/decode/clear messages, but the audited frontend has no WSJT-X message consumer feeding its store. Existing spot conversions apply the current status frequency to old decodes. This work first establishes immutable decode context, then wires lossless message ingestion and updates consumers before introducing wall tuning.

## Protocol and metadata slice

The official [WSJT-X protocol](https://raw.githubusercontent.com/WSJTX/wsjtx/master/Network/NetworkMessage.hpp) describes dial Hz in Status, audio offset in Decode, per-instance IDs, periodic Heartbeat, replay via New=false, and Off air for WAV playback. Status changes include dial/mode changes and decoder transitions. The decode mode marker is retained separately from the status mode.

The bridge now snapshots same-instance dial Hz/mode and reception time on new on-air decodes. Replay/off-air/unknown or invalid-frequency decodes receive no inferred dial context. A 64-instance context cache expires after two minutes without datagrams, remains valid during heartbeats, and clears on Close or listener stop. The metadata represents the last status received before the decode; UDP packet loss or reordering cannot be repaired by inventing state.

Frontend message/store types retain optional context for compatibility with older bridges. The store band selector uses each decode's captured dial; the former placeholder returned all decodes. Old decodes never acquire a band merely because the current status changes.

Four actual-parser Node tests cover separate instances, retuning, replay/off-air/invalid context, heartbeat/inactivity/Close/stop and bounded eviction without opening UDP sockets. Two frontend store tests cover retrospective band correctness and unknown context. Bridge type checking passes. The standard bridge test script now includes the parser tests.

Remaining slices: frontend ingest for direct/extension transports, per-instance clear and reconnect behavior, consumer conversion, WSJT-X wall tile/report/tuning, PSK OF/BY/window report and coordinated map-window work. No radio connection, transmission, or live UDP service was started for this slice.


## Frontend ingestion slice

The shell's existing bridge connection now synchronously routes each direct-WebSocket or extension message into a validated WSJT-X consumer. This avoids React `lastMessage` batching dropping a burst of decodes; no extra connection is opened. Invalid payloads are rejected, the retained queue remains capped at 500, and a named Clear removes only that instance. Disconnect/unmount marks the source unavailable and clears current status while retaining immutable decode history. Replay/off-air messages do not inflate the live decode-rate counter.

Live spots, Band Map and FT8 spotter data use captured dial/RF frequency and status-mode context, never the latest global status. New on-air QTime values are resolved against the reception date across UTC midnight; old bridge reception timestamps are retained rather than refreshed to now. Unknown-context/low-confidence/replay/off-air entries remain available as raw decodes but are excluded from live map evidence. Older bridges without dial metadata therefore show unknown tuning context until upgraded.

Tests exercise 40-packet direct and extension bursts, rejection of the wrong extension session, shell disconnect cleanup, per-instance clear, malformed payloads/queue bounds, UTC midnight, and 40m observations remaining on 40m after another instance moves to 20m. No hardware transport or UDP service was opened. Wall tile/report and PSK OF/BY/age controls remain the next slices.
