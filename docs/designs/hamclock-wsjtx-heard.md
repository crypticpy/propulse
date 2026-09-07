# WSJT-X “hearing me” — #287

The WSJT-X report now has a HEARING ME tab backed by the shared PSK station snapshot. It always selects reports OF the station-profile callsign, displaying the receivers that heard that station. The main PSK report's OF/BY selection is preserved; age and band remain shared between surfaces. All reported modes are included and labeled, since a bridge instance's current mode does not establish what another receiver heard earlier.

The tab uses PSK-specific facts, source state and retrieval timestamp. Bridge-off and PSK-unavailable are independent. A missing call or unavailable source shows an unknown hero, while a successful empty window shows zero loaded reports. Stale rows retain their original timestamps and age out of the selected window. The full accessible table and explicit reported-RF Tune actions are reused from the PSK report.

One report dialog stays mounted when switching between local decodes and remote reception evidence, preserving Escape focus return. Pinning retains the active tab; changing between all three tabs preserves the same WSJT-X pin identity. The PSK query is enabled for this report only on HEARING ME, and reuses the PSK tile's existing canonical callsign query when present.

Validation: 369 targeted wall/store/hook tests pass across 34 files. New regressions cover OF selection while the main report remains BY, shared band/window filtering without refetch, source/footer changes when switching tabs, and stale/unavailable PSK data with the bridge off. Browser fixtures pass 48 combinations: five age windows and three source states across three themes at 1080p/4K, with all sixteen supported bands. Complete row bounds, source changes, pin/tab persistence, preservation of the main BY selection and Escape focus return are checked. Hardware WebSockets are blocked; the five fixture requests comprise initial mounting and three distinct source-state callsigns, with no control-triggered refetch.

Evidence: [1080p](../images/hamclock-wsjtx-heard/report-1080p.png), [4K](../images/hamclock-wsjtx-heard/report-4k.png). Fixture script: ignored `tmp/heard/check.mjs`. Owned dev session `b2b707be-bc17-46eb-9c83-cfb32019695a`, owner `hamclock-wsjtx-heard`, URL `http://127.0.0.1:5181`, stopped after testing.

The production PSK cache migration/credentials from #422 remain a maintainer deployment prerequisite. Coordinated map arcs, shared map window and TX/RX glyphs remain outstanding. No model or 3D globe internals are changed; deployed and physical-display acceptance is not inferred from browser fixtures.
