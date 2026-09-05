# Simulated operator and designer roundtable

This is an edited reconstruction of three agents' fictional discussions and cross-panel challenges. None of these people were interviewed. Their statements generate design hypotheses; they do not prove what customers want.

| Fictional role | Context |
|---|---|
| Alex, 35 | Portable/digital operator, enjoys experimenting and changing kits |
| Jordan, 44 | Home-station operator with limited time and a practical maintenance mindset |
| Morgan, 55 | Multi-radio CW operator and Elmer who helps others troubleshoot |
| Lee, 60 | Elmer and experimenter mixing legacy, modern, and homebuilt equipment |
| Interaction designer | Discoverability, direct manipulation, accessibility, and recovery |
| Product/systems designer | Clear boundaries between inventory, configurations, experiments, and publishing |

Age does not imply skill, aesthetic taste, or comfort with software. The disagreements below are about tasks and circumstances.

## Round 1: blank canvas or guided setup?

**Alex:** “Let me drop my equipment onto a workbench without finishing ten forms.”

**Jordan:** “A blank workbench is another project. Start me with three steps.”

**Morgan:** “Start with my radio, cable and antenna. Let me get something useful before asking for every connector.”

**Lee:** “But the laptop, interface, keyer and battery are half my setup. An RF-only picture doesn't help me explain why digital modes aren't working.”

**Interaction designer:** The first route can be guided inside the actual editor. Add radio, add antenna, connect. The same equipment can later expose more ports and layers. Every drag operation needs a discoverable click/tap alternative.

**Decision:** One workbench with progressive detail. No separate wizard-only representation, and no obligation to learn graph editing before producing a useful setup.

## Round 2: what does “active” mean?

**Product/systems designer:** Opening the current accordion changes `activeChainId`. That identifier also feeds operating context. Should inspecting another path really select it for operation?

**Jordan:** “Looking at that experiment must not change the setup I'm using tonight.”

**Morgan:** A visible connection should say whether it is the route I intend to use, a recorded cable, or actual telemetry. A drawing of a switch is not its physical position.

**Alex:** Save the plan first. Make using it an explicit step.

**Decision:** Separate selected editor document, draft experiment, and current ProPulse operating setup. Show both Editing and Using states. Before Use in ProPulse, summarize what app context changes and what is still unknown. Do not imply hardware operation.

## Round 3: can I try an improvement?

**Lee:** “Trying a shorter cable must not rewrite the cable I own.”

**Product/systems designer:** The released What-If preview already works with sandbox copies and preserves other SWR bands. The narrower concern is promotion: Apply to path updates shared equipment used by other setups.

**Alex:** Make “Save as another setup” the easy choice.

**Morgan:** Keep a measurement with its frequency, date and measurement point. A hypothetical value is useful, but it isn't a measurement.

**Decision:** Named scenarios and setup-specific overrides. Shared edits show affected setups and selected changes. Calculated, declared, measured and unknown values retain their provenance.

## Round 4: schematic, physical bench, or both?

**Morgan:** “A beautiful picture that suggests both radios feed the same port is worse than a plain list.”

**Lee:** “Keep my bench arrangement, and route the lines for me.”

**Interaction designer:** Equipment photos or silhouettes can make devices recognizable. Stable topology must remain independent of x/y positions. Start with auto-layout; make later auto-layout explicit and undoable.

**Jordan:** Give me a connections list for the quick correction on my phone.

**Decision:** Schematic with recognizable equipment imagery is the default. RF is the initial visible layer. Power, audio, control and recorded bonding are optional layers. A rack/bench skin is a later view of the same model, not a separate database.

## Round 5: what belongs on the profile?

**Jordan:** “Publishing my profile shouldn't publish every spare radio or the inside of my room.”

**Lee:** A homebuilt station needs room for its story, not just catalog specifications.

**Morgan:** Show what I can help someone learn and how to find me on the air.

**Product/systems designer:** The inventory is private working material. The profile publishes selected summaries, photos, stories, and optional statistics. A planned setup must not quietly appear as owned gear.

**Decision:** Curated featured setup, operating interests, availability, QSL preferences, projects, mentoring, optional records, module order/visibility, and audience preview. Public layout should not reward equipment cost or impose a universal operator score.

## Where the agents corrected themselves

The primary checkout contains older/uncommitted variations. Rechecking the released baseline changed two initial findings:

- Public shack photos and a schematic sketch already exist. The proposal improves their integration rather than claiming they are missing.
- Released What-If already isolates previews, resets when paths change, and preserves unedited SWR bands. The valid remaining issue is shared-equipment impact during promotion and missing measurement provenance.

Client rendering of section-level Friends visibility and equipment-image audience behavior warrant an implementation audit. No live privacy exposure was tested or established by this exercise.

## Hypotheses worth testing with real people

1. Named setups are a more useful primary unit than equipment categories or “signal chains.”
2. A guided first route is faster than an empty canvas without limiting advanced operators later.
3. Distinct Editing and Using states prevent accidental context changes.
4. People value a station notebook and mentoring context at least as much as equipment statistics.
5. Visible uncertainty increases trust without discouraging incomplete initial setup.
6. Curated sharing produces profiles people want to publish while protecting private working detail.
