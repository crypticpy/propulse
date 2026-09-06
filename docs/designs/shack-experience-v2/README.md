# ProPulse: build a station, show its story, pass gear along

Design and requirements proposal · 6 September 2026 · baseline `0b4cf402` · extends [Station Workbench #173](https://github.com/crypticpy/propulse/issues/173).

The next step is a proper flowchart editor paired with a composed station presentation, supported by real photo albums and a gear-sale directory. The owner requested these requirements and sketches after the working UI releases #265, #266 and #268. This package proposes implementation details; the concepts are not shipped screens and do not complete any implementation issue.

Track delivery in [epic #276](https://github.com/crypticpy/propulse/issues/276) and [Project 3](https://github.com/users/crypticpy/projects/3). [Review notes](REVIEW-NOTES.md) distinguish generated artwork from implementation contracts.

**Start with [the visual gallery](gallery.html)**, then [requirements](REQUIREMENTS.md), [screen flows](FLOWS.md), and the [technical delivery plan](DELIVERY.md). Exact native ImageGen prompts and original concept images are in [concepts](concepts/). A [coverage register](coverage.json) maps every requirement to an accountable work item.

## The product structure

| Place | What people do there | What belongs elsewhere |
| --- | --- | --- |
| My shack → Edit | Place real gear, connect named ports, arrange branches, inspect and undo | Publishing and choosing equipment for operation are separate actions |
| My shack → Present | Read a clean station diagram, follow a documented route, browse that setup's photos | No editing handles, dotted workspace or private notes |
| Profile → Photos | Share personal operating experiences, projects, field days and albums | Gear inventory and sale metadata do not automatically become personal posts |
| Profile → My shack | Show a chosen published setup and its curated equipment/photos | A visitor does not see the owner's current editor state |
| My gear → Sell this gear | Prepare a listing from a particular owned item, choose photos and write a description | The listing is a publication, not the inventory record itself |
| Gear for sale | Discover published listings and contact the seller | The first proposed version has no checkout, payment processing or escrow |

Use a single station identity and the existing application header throughout. The equipment item, its appearances in setups, its photos and its sale listing remain linked but have distinct identities and lifecycles.

## Seven visual concepts

1. **Flowchart editor:** a generous connection canvas, compact gear shelf, recognizable equipment silhouettes, named ports, orthogonal cable paths, groups and an inline selection toolbar. Detailed changes open the existing centered dialog.
2. **Station presentation:** the same recorded topology with composed spacing, a readable featured route, quieter alternate branches, a concise explanation and a setup photo strip. Owners can use this as a reference without publishing it.
3. **Profile and personal albums:** a wide banner, separate avatar, operator story and clearly distinguished Photos / My shack / Gear for sale areas.
4. **Enlarged photo viewer:** a comfortable daylight view with a large photograph, caption, thumbnails and explicit previous/next/zoom/close controls. No automatic carousel movement.
5. **Gear directory:** photo-led discovery with useful filters, condition, coarse location, asking-price terms and availability.
6. **Listing preparation:** choose an owned item, deliberately select public photos, disclose condition/inclusions, write the listing, preview it and publish.
7. **Gear photo manager:** a visible Add photos / Manage photos action for every gear type, with upload and pasted-image-link import, cover selection and a reusable gallery.

The renderings explore composition and atmosphere. Precise text, dimensions, RF topology and state behavior are governed by the requirements and deterministic diagram in FLOWS.md. Any image-generation lettering or connector error must not be copied into production.

## Design language to retain

Use the shipped `station-ui` primitives and [visual-comfort contract](../station-ui/VISUAL-COMFORT.md): navy surfaces, plasma-orange actions, muted cyan connection emphasis, soft off-white text, quiet warm daylight surfaces, Inter body type, Mono for callsigns/units, and restrained Orbitron headings. No text glow. Comfortable controls, clear labels and spacing matter more than decoration.

A flowchart appearance must still describe radio equipment. A diamond is not automatically an RF switch and visual proximity is not connectivity. RF, power, audio/data and ground layers have written labels and distinct line patterns; only supported recorded routes contribute to calculations. Keep optional detail out of the first read.

## Proposed choices to review

- Initial sales scope is a classifieds directory with an authenticated seller-contact relay. A conversation inbox, checkout, payments, fees, shipping labels and buyer protection need a separate product decision.
- Presentation layouts are saved independently from editor layouts. Owners explicitly publish a selected revision; private editing never changes a visitor's diagram until republished.
- Personal albums, setup albums, equipment photos and listing photo selections are separate collections over shared media assets. Reuse should avoid repeated uploads without broadening an entire album's audience.
- Gear photos accept uploads and pasted image URLs. URL import stores a managed copy after preview, so shared pages do not rely on third-party hotlinks. Source access/format failures leave the rest of the gear form intact.
- A listing can be public while its source inventory remains private. Marking an item sold does not delete it or rewrite a historical setup.
- Proposed upload/count/retention limits and listing expiry are configuration decisions in DELIVERY.md; they are not current platform capabilities.

## Existing work stays intact

The controlled React Flow direction is already recorded in [EDITOR-ARCHITECTURE.md](../profile-shack-workbench/EDITOR-ARCHITECTURE.md). This proposal refines its visual and interaction requirements rather than replacing the domain model. Existing equipment specifications, custom/homebrew gear, photos, warnings, route calculations, operating selection, exports, profile/social features and visibility rules remain in the preservation register. HamClock and the shared header implementation remain outside this work.

Sources informing the proposal: [React Flow named handles](https://reactflow.dev/learn/customization/handles) and [layout integration guidance](https://reactflow.dev/learn/layouting/layouting); [W3C carousel guidance](https://www.w3.org/WAI/tutorials/carousels/); [Supabase bucket access model](https://supabase.com/docs/guides/storage/buckets/fundamentals). These support implementation choices, not a claim that the proposed interfaces are implemented or accessibility-certified.
