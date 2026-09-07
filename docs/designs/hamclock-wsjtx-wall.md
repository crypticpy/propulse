# WSJT-X wall tile and decode report — #287

The SDR page now includes a distinct WSJT-X tile alongside the native SDR scope/decoder. Unchanged version-6 SDR layouts adopt the new tile; customized layouts remain intact. The tile shows callsign/grid, dB, DT, message, audio offset and UTC time with CQ highlighting, measured whole rows and explicit tuning.

The report provides NEW · 15 MIN and ALL RETAINED views, six facts, the complete accessible table and a received-time source footer. It distinguishes bridge off, no decodes, receiving and stale states. Up to 500 raw decodes remain available, including labelled replay/off-air/low-confidence rows. Source-specific tuning reasons disable those rows and unknown dial context. TUNE restores the captured dial frequency/receive mode, not the RF audio-offset sum; it does not alter WSJT-X's audio selection or send transmit/reply commands.

Validation: 369 targeted tests across 32 wall/control/store files pass, including report filtering/tuning and migration/custom preservation. Actual-app browser checks passed all 36 combinations of two views, three source states, three themes and 1080p/4K. The tile's final row fits its measured slot; report/page/list bounds have no overflow. Explicit tile/report tuning stages 7,074,125 Hz + USB, tile tuning does not open a report, Escape returns focus, and pin identity survives tab changes. Hardware transports were blocked; fixture data comprised 50 synthetic decodes from two instances including replay and unknown context.

[1080p report](../images/hamclock-wsjtx/report-1080p.png) · [4K report](../images/hamclock-wsjtx/report-4k.png).

Managed local session: owner `hamclock-wsjtx-wall`, id `fcb3d553-f282-498e-8a6b-6213afd66283`, port 5181, worktree `.worktrees/hamclock-wsjtx-wall`. N0TEST / EM38, flat projection, SDR page, DPR 1. No physical or deployed acceptance is claimed.

Remaining #287 scope: PSK Reporter OF/BY-call tile/report and shared age/band controls, source-backed 6/24-hour windows, the who-is-hearing-me view inside the WSJT-X report, and coordinated map-window integration. This slice does not mark the entire issue complete.
