/**
 * The local operating-workspace wire between the docked console and the
 * `/map/ops` popout.
 *
 * **Bump this version whenever a payload field changes meaning for an existing
 * receiver** — a new field, a removed field, or a field an older receiver would
 * act on differently. Mixed-version windows must not share a protocol they do
 * not share: during a deploy the two windows run different bundles, and a
 * receiver that does not understand the newer payload acts on the part it does
 * understand and broadcasts the result back. v3 carries `dockTabIntent`; a v2
 * receiver ignored it, reconciled the dock tab from the scope change alone and
 * broadcast that reversal to the new window (#884 round 9). The cost of a bump
 * is a brief loss of cross-window sync during the deploy overlap, which a
 * reload restores; that is cheaper than capability negotiation, and far cheaper
 * than a peer undoing the operator's choice. v4 dropped `workspaceOpen` (it is
 * per-window, #884 round 12) and, with it, any field a v3 receiver would act on
 * differently. v5 replaced the per-domain message with one batched message per
 * publish (#884 round 14): a v4 receiver would find neither `domain` nor
 * `state` and silently drop every update.
 *
 * This is the only wire that carries `contestUi` or the dock-tab intent. The
 * other BroadcastChannels are separate protocols with their own versions:
 * `propulse-operating-state-v1` (`OPERATING_CHANNEL_NAME` /
 * `OPERATING_PROTOCOL_VERSION` in `@/lib/workspace/operatingChannel`),
 * `propulse-operating-monitor-v1` (`useOperatingMonitor`) and
 * `propulse-contest-events-v1` (`contestEventBus`). None of them changed here.
 */
export const WORKSPACE_CHANNEL = "propulse-operating-workspace-v5";
