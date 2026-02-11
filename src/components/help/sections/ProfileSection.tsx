import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function ProfileSection() {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <p className="text-sm leading-relaxed text-gray-300">
        Your Profile is your ham radio identity on Propulse &mdash; featuring
        your callsign card, operator rank, badges, statistics, and public
        presence. Profiles can be shared publicly so other operators can learn
        about your station. Navigate to{" "}
        <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono">
          /profile
        </code>{" "}
        to manage your own profile, or visit{" "}
        <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono">
          /profile/&#123;callsign&#125;
        </code>{" "}
        to view another operator. On desktop, the profile page features a sticky
        sidebar card alongside a tabbed content area (Overview, Locations,
        Awards, Stats, Social). On mobile, a compact card at top with horizontal
        tab pills.
      </p>

      {/* ── Profile Card ─────────────────────────────────────────────── */}
      <HelpAccordion
        id="profile-card"
        title="Profile Card"
        summary="Your callsign, grid, bio, avatar, and station identity"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            The profile card is your at-a-glance station identity, displayed
            prominently on your profile page and visible to other operators.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Avatar</strong> &mdash; Upload a profile photo (Pro
              feature) or use the default initial-based avatar derived from your
              callsign.
            </li>
            <li>
              <strong>Callsign</strong> &mdash; Your validated amateur radio
              callsign, displayed prominently in monospace font. Supports
              standard amateur callsigns (W5XXX, VE3ABC, etc.) and GMRS
              callsigns (WSLK349). Changing your callsign automatically
              generates QRZ and HamQTH social links.
            </li>
            <li>
              <strong>Operator Name</strong> &mdash; Your name as it appears on
              your profile and QSL cards.
            </li>
            <li>
              <strong>Grid Square</strong> &mdash; Your Maidenhead grid locator
              (4 or 6 character). This is the reference point for all
              propagation calculations, azimuthal projections, and path
              analysis. Coordinates are auto-derived from the grid square.
            </li>
            <li>
              <strong>Active Location</strong> &mdash; If you have multiple
              saved locations, the card shows which one is currently active
              (Home, Portable, Contest, POTA, SOTA, etc.).
            </li>
            <li>
              <strong>QR Code</strong> &mdash; Generate a QR code for your
              profile that other operators can scan to quickly find you on
              Propulse.
            </li>
            <li>
              <strong>Profile Completeness</strong> &mdash; A percentage
              indicator showing how many profile fields you have filled out.
            </li>
          </ul>

          <p>
            On desktop, the profile card is a sticky sidebar that stays visible
            while you scroll through tabs. Click the edit button to modify your
            callsign, name, and grid directly in the card. On mobile, the card
            appears at the top of the page in a compact format.
          </p>

          <HelpCallout type="tip">
            A complete profile helps other operators know who they are talking
            to. Fill out your bio, equipment, license details, and station
            information to reach 100% completeness and earn XP.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ── Rank System ──────────────────────────────────────────────── */}
      <HelpAccordion
        id="rank-system"
        title="Operator Rank System"
        summary="How XP is earned and ranks progress from Novice to Ethereal"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            Propulse has a gamified rank system that tracks your activity and
            rewards engagement. Rank Points (RP) are accumulated from multiple
            sources, and your rank tier is determined by your total RP.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Rank Tiers</h4>
            <p className="mb-2">
              Progress through seven tiers as you accumulate Rank Points:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong className="text-gray-400">Novice (0 RP)</strong> &mdash;
                &ldquo;Welcome to the Bands.&rdquo; Starting rank for all
                operators. Card background: Schematic.
              </li>
              <li>
                <strong className="text-sky-400">Apprentice (400 RP)</strong>{" "}
                &mdash; &ldquo;Signal Rising.&rdquo; Unlocks card flip animation
                and Topographic background.
              </li>
              <li>
                <strong className="text-emerald-400">
                  Journeyman (1,500 RP)
                </strong>{" "}
                &mdash; &ldquo;Steady Signal.&rdquo; Unlocks mouse-tilt
                interactive card effect and Circuit background.
              </li>
              <li>
                <strong className="text-violet-400">Expert (4,000 RP)</strong>{" "}
                &mdash; &ldquo;Strong Copy.&rdquo; Unlocks particle effects,
                animated stat count-up, and Constellation background.
              </li>
              <li>
                <strong className="text-amber-300">Master (10,000 RP)</strong>{" "}
                &mdash; &ldquo;Full Quieting.&rdquo; Unlocks equipment wear
                indicators and Propagation background.
              </li>
              <li>
                <strong className="text-yellow-300">
                  Legendary (25,000 RP)
                </strong>{" "}
                &mdash; &ldquo;DX Commander.&rdquo; Unlocks card signature
                (custom 40-char text), energy borders, filigree corners, and
                Aurora background.
              </li>
              <li>
                <strong className="text-violet-300">
                  Ethereal (50,000 RP)
                </strong>{" "}
                &mdash; &ldquo;The Infinite Signal.&rdquo; Unlocks chromatic
                color-cycling effects and the Living Signal animated background.
                The highest achievable rank.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              RP Sources (How to Earn Points)
            </h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Achievements</strong> &mdash; Bronze (50 RP), Silver
                (100 RP), Gold (200 RP), Platinum (500 RP) per achievement
                earned.
              </li>
              <li>
                <strong>QSOs Logged</strong> &mdash; 1 RP per contact logged.
                Every QSO counts.
              </li>
              <li>
                <strong>DXCC Entities</strong> &mdash; 25 RP per unique DXCC
                entity worked.
              </li>
              <li>
                <strong>Band-Mode Slots</strong> &mdash; 10 RP per unique
                band-mode combination worked.
              </li>
              <li>
                <strong>Contests</strong> &mdash; 100 RP per contest entered,
                500 RP for a top-10 finish.
              </li>
              <li>
                <strong>Login Streaks</strong> &mdash; 25 RP for 7-day streak,
                150 RP for 30-day streak, 2,000 RP for 365-day streak. Bonuses
                are additive &mdash; a 365-day streak earns all three.
              </li>
              <li>
                <strong>Equipment</strong> &mdash; 5 RP per piece of equipment
                registered in your shack (radios, antennas, feedlines,
                accessories, inline components).
              </li>
              <li>
                <strong>Signal Paths</strong> &mdash; 15 RP per completed
                station chain in the Station Builder Lab.
              </li>
              <li>
                <strong>Profile Complete</strong> &mdash; 100 RP one-time bonus
                for reaching 100% profile completeness.
              </li>
              <li>
                <strong>Shares</strong> &mdash; 10 RP per profile card share.
              </li>
              <li>
                <strong>Elmer Sessions</strong> &mdash; 50 RP per mentoring
                session.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Rank Badge</h4>
            <p>
              Your current rank badge is displayed next to your callsign in the
              app header and on your profile card. Each rank has a unique icon,
              color, and title. When you reach a new rank, a celebration overlay
              appears to mark the achievement.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Card Customization
            </h4>
            <p>
              As you rank up, you unlock visual effects and card backgrounds:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>Backgrounds</strong> &mdash; Schematic, Topographic,
                Circuit, Constellation, Propagation, Aurora, Living Signal (each
                unlocked at higher ranks).
              </li>
              <li>
                <strong>Particle effects</strong> &mdash; Animated particles on
                your profile card (Expert+, can be toggled in preferences).
              </li>
              <li>
                <strong>Mouse tilt</strong> &mdash; Interactive 3D tilt effect
                when hovering the card (Journeyman+, can be toggled).
              </li>
              <li>
                <strong>Sound effects</strong> &mdash; Optional audio feedback
                on rank-up (can be toggled).
              </li>
              <li>
                <strong>Card signature</strong> &mdash; Custom 40-character text
                displayed on your card (Legendary+ only).
              </li>
            </ul>
          </div>

          <HelpCallout type="note">
            Ranks are earned through genuine operating activity. There is no way
            to buy a higher rank &mdash; it reflects your actual engagement with
            ham radio through Propulse. The rank system requires a signed-in
            account; anonymous users always see Novice rank.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ── Badges & Awards ──────────────────────────────────────────── */}
      <HelpAccordion
        id="badges"
        title="Badges & Awards"
        summary="Achievement badges and operating awards earned through activity"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            Badges are earned automatically based on your operating activity and
            are displayed on your profile for other operators to see. The Awards
            tab on your profile page shows all available badges and your
            progress toward earning them.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Achievement Tiers
            </h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Bronze</strong> &mdash; Entry-level milestones. Earns 50
                RP each.
              </li>
              <li>
                <strong>Silver</strong> &mdash; Intermediate milestones. Earns
                100 RP each.
              </li>
              <li>
                <strong>Gold</strong> &mdash; Advanced achievements. Earns 200
                RP each.
              </li>
              <li>
                <strong>Platinum</strong> &mdash; Elite accomplishments. Earns
                500 RP each.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Categories</h4>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>
                <strong>Operating Milestones</strong> &mdash; First QSO, 100
                QSOs, 1000 QSOs, etc.
              </li>
              <li>
                <strong>Band Achievements</strong> &mdash; Working all HF bands,
                making contacts on specific bands.
              </li>
              <li>
                <strong>Mode Achievements</strong> &mdash; Operating on
                different modes (CW, SSB, FT8, etc.).
              </li>
              <li>
                <strong>Social Achievements</strong> &mdash; Sharing your
                profile, following operators, completing your profile.
              </li>
            </ul>
          </div>

          <p>
            Each badge displays an icon, a name, a description of how to earn
            it, and the date it was earned. Badges also contribute RP toward
            your operator rank.
          </p>

          <HelpCallout type="tip">
            Check your Awards tab regularly &mdash; you may have earned badges
            without realizing it. Many badges are awarded retroactively based on
            your existing logbook data.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ── Statistics ───────────────────────────────────────────────── */}
      <HelpAccordion
        id="statistics"
        title="Statistics"
        summary="QSO counts, band/mode breakdowns, streaks, and entity tracking"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Stats tab on your profile page provides a comprehensive
            breakdown of your operating activity. Statistics update
            automatically as you log QSOs and use the app.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>QSO Counts by Band</strong> &mdash; Total contacts per
              band from 160m through 2m, giving you a clear picture of which
              bands you operate on most.
            </li>
            <li>
              <strong>QSO Counts by Mode</strong> &mdash; Breakdown by operating
              mode (SSB, CW, FT8, FT4, RTTY, and others).
            </li>
            <li>
              <strong>Countries Worked</strong> &mdash; DXCC entity count
              showing total countries confirmed and unconfirmed.
            </li>
            <li>
              <strong>States Worked</strong> &mdash; US state count for Worked
              All States (WAS) tracking.
            </li>
            <li>
              <strong>Login Streak</strong> &mdash; Your current consecutive
              days using Propulse. The streak increments each calendar day you
              log in and resets if you miss a day.
            </li>
            <li>
              <strong>Longest Streak</strong> &mdash; Your all-time longest
              daily login streak record.
            </li>
            <li>
              <strong>Total Rank Points</strong> &mdash; Your accumulated RP
              with a breakdown showing contributions from each category
              (achievements, QSOs, DXCC, streaks, equipment, etc.).
            </li>
          </ul>

          <p>
            A link at the bottom of the Stats tab takes you to the full Logbook
            page for detailed QSO browsing and analysis.
          </p>
        </div>
      </HelpAccordion>

      {/* ── QSL Cards ────────────────────────────────────────────────── */}
      <HelpAccordion
        id="qsl-cards"
        title="QSL Cards"
        summary="Digital QSL generation and external service integration"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The QSL Summary on your profile&apos;s Overview tab shows your QSL
            confirmation status and integration with external services.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Digital QSL Card</strong> &mdash; Propulse generates a
              digital QSL card featuring your callsign, grid, operator name, and
              stats highlights.
            </li>
            <li>
              <strong>LoTW Integration</strong> &mdash; Logbook of The World
              confirmation tracking. Enable in your service credentials.
            </li>
            <li>
              <strong>eQSL Integration</strong> &mdash; Electronic QSL card
              exchange via eQSL.cc.
            </li>
            <li>
              <strong>ClubLog</strong> &mdash; DXCC tracking and analysis via
              ClubLog API.
            </li>
            <li>
              <strong>QRZ</strong> &mdash; QRZ.com lookup integration.
            </li>
          </ul>

          <HelpCallout type="pro">
            Pro users can upload custom images for their QSL card and profile,
            including gear photos and station images. Images are stored securely
            on Supabase storage.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ── Public Profiles ──────────────────────────────────────────── */}
      <HelpAccordion
        id="public-profiles"
        title="Public Profiles"
        summary="Viewing other operators, following, and privacy controls"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            Visit any operator&apos;s profile at{" "}
            <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono">
              /profile/&#123;callsign&#125;
            </code>
            . Public profiles show the operator&apos;s callsign, grid, bio,
            social links, and statistics based on their privacy settings.
            Viewing other profiles requires a signed-in account.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Following Operators
            </h4>
            <p>
              When viewing another operator&apos;s profile, you can follow them
              using the Follow button. Your followed operators appear in the
              Friends list on the Social tab of your own profile. Following is
              one-directional &mdash; the other operator is not notified.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Privacy Controls
            </h4>
            <p>
              Control what other operators can see on your profile. The
              Visibility Settings panel on your Social tab lets you configure:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 mt-2">
              <li>
                <strong>Location</strong> &mdash; Show or hide your grid square
                on your public profile.
              </li>
              <li>
                <strong>Statistics</strong> &mdash; Public or private. Controls
                whether QSO counts, band breakdowns, and entity counts are
                visible to other users.
              </li>
              <li>
                <strong>Activity</strong> &mdash; Show or hide social links and
                activity details.
              </li>
            </ul>
            <p className="mt-2">
              Basic info (callsign) is always visible if you have an account.
              All other fields are configurable.
            </p>
          </div>

          <HelpCallout type="note">
            Other operators can find your profile by searching your callsign.
            Control what is visible through your privacy settings on the Social
            tab.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ── Completeness ─────────────────────────────────────────────── */}
      <HelpAccordion
        id="completeness"
        title="Completeness Indicator"
        summary="What contributes to your profile completion percentage"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The profile completeness percentage tracks how many key profile
            fields you have filled out. It is displayed on your profile card and
            factors into your rank points.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Fields That Count
            </h4>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>
                <strong>Callsign</strong> &mdash; Required field. Your amateur
                radio callsign.
              </li>
              <li>
                <strong>Grid Square</strong> &mdash; Your Maidenhead locator.
              </li>
              <li>
                <strong>Operator Name</strong> &mdash; Your name as it appears
                to other operators.
              </li>
              <li>
                <strong>Bio</strong> &mdash; Freeform text about yourself and
                your station.
              </li>
              <li>
                <strong>License Class</strong> &mdash; Your current license
                level (Technician, General, Extra, Advanced, or Novice).
              </li>
              <li>
                <strong>Equipment</strong> &mdash; At least one radio registered
                in your shack.
              </li>
              <li>
                <strong>Avatar/Photo</strong> &mdash; A profile image (Pro
                feature) or default avatar.
              </li>
            </ul>
          </div>

          <p>
            Each field contributes equally to the percentage. Reaching 100%
            shows a full, professional profile to other operators and earns a
            one-time bonus of 100 Rank Points.
          </p>

          <HelpCallout type="tip">
            A complete profile earns 100 RP toward your operator rank. Fill out
            every section &mdash; callsign, grid, name, bio, license, equipment,
            and photo &mdash; to maximize your score and present a polished
            presence to the community.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* ── Overview Tab Details ──────────────────────────────────────── */}
      <HelpAccordion
        id="overview-tab"
        title="Overview Tab"
        summary="Station identity, license, bio, social links, equipment, and QSL"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            The Overview tab is the default view on your profile page and
            contains the core sections that define your station.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Station Identity
            </h4>
            <p>
              Displays your callsign, operator name, and grid square. On
              desktop, you can edit these inline via the sidebar card. On
              mobile, a full form is shown. Changes are validated &mdash;
              callsigns must match amateur (W5XXX, VE3ABC) or GMRS (WSLK349)
              formats, and grid squares must be valid Maidenhead locators.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">License Card</h4>
            <p>
              Displays your license class, license history timeline, and any
              upgrade milestones you have recorded. You can track your
              progression from Technician through Extra with dated entries.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Bio</h4>
            <p>
              Freeform text about yourself and your station. Write about your
              operating interests, equipment, favorite bands, or anything else
              you want other operators to know.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Social Links</h4>
            <p>
              Links to your QRZ, HamQTH, and other profiles. QRZ and HamQTH
              links are auto-generated when you set your callsign. You can also
              add custom links manually.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Equipment Summary
            </h4>
            <p>
              A summary of the equipment registered in your Shack (radios,
              antennas, feedlines, etc.). Links to the full Shack page for
              detailed equipment management and station chain building.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* ── Social Tab ───────────────────────────────────────────────── */}
      <HelpAccordion
        id="social-tab"
        title="Social Tab"
        summary="Friends list, activity feed, visibility settings, and share card"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Social tab on your profile provides community features for
            connecting with other operators.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Friends List</strong> &mdash; Operators you follow. See
              their callsign, grid, and recent activity at a glance.
            </li>
            <li>
              <strong>Activity Feed</strong> &mdash; A timeline of recent events
              from operators you follow (new QSOs, achievements, rank-ups).
            </li>
            <li>
              <strong>Visibility Settings</strong> &mdash; Control what parts of
              your profile are visible to other operators (location, stats,
              activity).
            </li>
            <li>
              <strong>Share Card</strong> &mdash; Generate a shareable card
              image of your profile for social media or QSL exchanges.
            </li>
          </ul>
        </div>
      </HelpAccordion>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <HelpFAQ
        items={[
          {
            question: "How do I earn XP (Rank Points)?",
            answer:
              "Rank Points are earned through activity: logging QSOs (1 RP each), earning achievements (50-500 RP each), working unique DXCC entities (25 RP each), maintaining daily login streaks (25-2,000 RP), registering equipment (5 RP each), completing station chains (15 RP each), reaching 100% profile completeness (100 RP), and sharing your profile card (10 RP each). Every contact counts, and streaks are a powerful way to accumulate points over time.",
          },
          {
            question: "Can other people see my profile?",
            answer:
              "Only if you have a signed-in account. You control what's visible through Visibility Settings on your Social tab. Basic info (callsign) is visible to other Propulse users, while your grid square, statistics, badges, and detailed activity are configurable between public and private. Without an account, you have no public profile.",
          },
          {
            question: "How do I upload a profile photo?",
            answer:
              "Profile photos are a Pro feature. Go to your profile page and click the avatar area to upload an image. Supported formats: JPG, PNG, WebP. Images are stored securely on Supabase storage. The image is displayed as a circular avatar on your profile card and public profile.",
          },
        ]}
      />
    </div>
  );
}
