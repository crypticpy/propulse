/**
 * Glossary Data
 * Ham radio and propagation terminology definitions
 */

export interface GlossaryTerm {
  term: string;
  short: string; // One-line definition
  long: string; // Detailed explanation
  related?: string[]; // Related terms
  seeAlso?: string[]; // Links to other sections
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    term: "A-Index",
    short: "Daily average of geomagnetic activity",
    long: "The A-Index is a daily average of the eight 3-hour K-Index values, providing a broader picture of geomagnetic conditions. Values range from 0 to 400, with higher values indicating more disturbed conditions. An A-Index under 10 is considered quiet and good for HF propagation.",
    related: ["K-Index", "Geomagnetic Storm"],
  },
  {
    term: "Antenna",
    short: "Device for transmitting and receiving radio waves",
    long: "An antenna converts electrical energy into radio waves for transmission, and radio waves back into electrical energy for reception. Common HF antennas include dipoles, verticals, beams, and wire antennas. Antenna choice significantly affects your ability to make DX contacts.",
    related: ["Dipole", "Vertical", "Beam"],
  },
  {
    term: "Auroral",
    short: "Propagation affected by aurora borealis activity",
    long: "Auroral propagation occurs when radio signals scatter off the ionized particles in the auroral zone. This can provide unusual propagation paths on VHF/UHF but typically degrades HF propagation, especially on polar paths. Aurora is associated with geomagnetic storms.",
    related: ["K-Index", "Geomagnetic Storm", "Polar Path"],
  },
  {
    term: "Backscatter",
    short: "Signals reflected back from distant ionosphere",
    long: "Backscatter occurs when signals travel to a distant point in the ionosphere and are reflected back toward the transmitter. This can allow contacts into areas that would normally be in the skip zone. The signals often have a distinctive fluttery quality.",
    related: ["Skip Zone", "Skip"],
  },
  {
    term: "Band",
    short: "Range of frequencies allocated for amateur radio",
    long: "Amateur radio bands are specific frequency ranges allocated for ham radio use. HF bands range from 160 meters (1.8 MHz) to 10 meters (28 MHz). Each band has different propagation characteristics - lower bands work better at night, higher bands during the day.",
    related: ["MUF", "Propagation"],
  },
  {
    term: "Beam",
    short: "Directional antenna that focuses signal in one direction",
    long: "A beam antenna (like a Yagi) focuses transmitted power in a specific direction and receives signals preferentially from that direction. Beams provide gain over a dipole and help reduce interference. They can be rotated to point toward different parts of the world.",
    related: ["Antenna", "Dipole", "Vertical"],
  },
  {
    term: "CQ",
    short: "General call inviting any station to respond",
    long: "CQ is a general call used to invite any station to make contact. 'CQ DX' specifically seeks long-distance contacts. When you hear someone calling CQ, they are looking for someone to talk to. Proper format: 'CQ CQ CQ this is [callsign] calling CQ.'",
    related: ["QSO", "DX"],
  },
  {
    term: "CW",
    short: "Continuous Wave - Morse code communication",
    long: "CW (Continuous Wave) refers to Morse code transmission, the oldest form of radio communication still in active use. CW is highly efficient and can get through when voice modes fail. Many DXers prefer CW for its ability to work weak signals and its narrow bandwidth.",
    related: ["SSB", "FT8"],
  },
  {
    term: "D Layer",
    short: "Lowest ionospheric layer, absorbs low-frequency signals",
    long: "The D layer is the lowest region of the ionosphere (50-90 km altitude), existing only during daylight. It absorbs rather than reflects radio waves, particularly affecting lower frequencies like 160m and 80m. This is why these bands work better at night when the D layer disappears.",
    related: ["E Layer", "F Layer", "Ionosphere"],
  },
  {
    term: "Dipole",
    short: "Basic wire antenna, half wavelength long",
    long: "A dipole is a fundamental antenna design consisting of two conductive elements fed at the center. A half-wave dipole is the most common form, with each leg being a quarter wavelength long. Dipoles are simple to build and effective for HF communication.",
    related: ["Antenna", "Beam", "Vertical"],
  },
  {
    term: "DX",
    short: "Long-distance radio contact",
    long: "In amateur radio, DX refers to making contact with stations in distant countries or regions. What qualifies as 'DX' varies by location - for US stations, DX typically means contacts outside North America. DXing is the pursuit of making these long-distance contacts.",
    related: ["DXCC", "DXpedition", "QSO"],
  },
  {
    term: "DXCC",
    short: "DX Century Club - award for 100 country contacts",
    long: "DXCC (DX Century Club) is the most prestigious DX award, issued by ARRL for confirmed contacts with 100 or more DXCC entities (countries/territories). There are currently 340 entities. Honor Roll requires 331+ entities, and the top goal is working all current entities.",
    related: ["DX", "QSL", "LoTW"],
  },
  {
    term: "DXpedition",
    short: "Expedition to activate a rare location for DX contacts",
    long: "A DXpedition is a trip to a rare or unusual location specifically to make amateur radio contacts. Operators travel to remote islands, uninhabited territories, or countries with few active hams. DXpeditions provide opportunities for others to contact rare entities.",
    related: ["DX", "DXCC"],
  },
  {
    term: "E Layer",
    short: "Middle ionospheric layer, supports short-skip propagation",
    long: "The E layer (90-150 km altitude) can provide regional propagation, especially on higher HF bands. Sporadic E (Es) is an enhanced form that can provide excellent propagation on 10m and 6m, and occasionally even VHF. Es events are unpredictable but often occur in summer.",
    related: ["D Layer", "F Layer", "Sporadic E", "Ionosphere"],
  },
  {
    term: "F Layer",
    short: "Highest ionospheric layer, primary HF propagation layer",
    long: "The F layer (150-500 km altitude) is responsible for most long-distance HF propagation. It splits into F1 and F2 during the day, with F2 being the primary DX layer. The F2 layer's height and density vary with solar activity, time of day, and season.",
    related: ["D Layer", "E Layer", "Ionosphere", "MUF"],
  },
  {
    term: "Fade",
    short: "Variation in signal strength",
    long: "Fading is the variation in received signal strength caused by changing propagation conditions. It can be slow (over minutes) or fast (flutter). Causes include multipath interference, ionospheric movement, and changing absorption. QSB is the Q-code for fading.",
    related: ["QSB", "Multipath", "Propagation"],
  },
  {
    term: "FOT",
    short: "Frequency of Optimum Traffic",
    long: "FOT (Frequency of Optimum Traffic) is typically about 85% of the MUF. It provides reliable propagation with less fading than frequencies closer to the MUF. Operating at or below the FOT gives the best chance of maintaining a solid contact.",
    related: ["MUF", "LUF"],
  },
  {
    term: "FT8",
    short: "Popular digital mode for weak signal communication",
    long: "FT8 is a digital mode designed for making contacts with weak signals. Developed by Joe Taylor (K1JT), it uses 15-second transmission periods and can decode signals well below the noise floor. FT8 has become extremely popular for DX contacts, especially during poor conditions.",
    related: ["CW", "SSB"],
  },
  {
    term: "Geomagnetic Storm",
    short: "Disturbance in Earth's magnetic field affecting propagation",
    long: "A geomagnetic storm is a temporary disturbance of Earth's magnetosphere caused by solar wind. Storms are rated G1-G5, with higher numbers being more severe. They can severely degrade HF propagation, especially on polar paths, and cause radio blackouts.",
    related: ["K-Index", "A-Index", "Auroral"],
  },
  {
    term: "Gray Line",
    short: "Sunrise/sunset terminator zone with enhanced propagation",
    long: "The gray line is the twilight zone between day and night on Earth. Propagation along the gray line can be exceptional because the D layer (which absorbs signals) is weak while the F layer is still ionized. Dawn and dusk are prime times for DX on all bands.",
    related: ["D Layer", "F Layer", "Propagation"],
    seeAlso: ["Your First DX"],
  },
  {
    term: "Ground Wave",
    short: "Radio waves traveling along Earth's surface",
    long: "Ground wave propagation follows the Earth's surface rather than refracting off the ionosphere. It's reliable but limited in range (typically under 100 miles on HF). Ground wave is the primary mode for local AM broadcast stations and works best at lower frequencies.",
    related: ["Sky Wave", "NVIS"],
  },
  {
    term: "Ionosphere",
    short: "Atmospheric layer that reflects radio waves",
    long: "The ionosphere is the ionized portion of Earth's upper atmosphere (50-1000 km). Solar radiation ionizes gases, creating layers (D, E, F) that can reflect radio waves back to Earth. This reflection enables long-distance HF communication around the world.",
    related: ["D Layer", "E Layer", "F Layer", "Propagation"],
    seeAlso: ["Propagation 101"],
  },
  {
    term: "K-Index",
    short: "3-hour measure of geomagnetic activity (0-9)",
    long: "The K-Index is a 3-hour measurement of geomagnetic activity on a scale of 0-9. Values 0-2 indicate quiet conditions good for HF. Values 3-4 are unsettled. Values 5+ indicate storm conditions that can severely degrade HF propagation, especially on polar paths.",
    related: ["A-Index", "Geomagnetic Storm"],
    seeAlso: ["Propagation 101"],
  },
  {
    term: "Long Path",
    short: "Propagation the long way around the Earth",
    long: "Long path refers to signals that travel the longer great-circle route around Earth to reach a destination. Sometimes long path provides better propagation than short path due to more favorable ionospheric conditions along the route. Long path is typically 180 degrees from short path.",
    related: ["Short Path", "Great Circle"],
  },
  {
    term: "LoTW",
    short: "Logbook of The World - electronic QSL confirmation",
    long: "Logbook of The World (LoTW) is ARRL's online system for confirming contacts electronically. When both stations upload their logs, matching QSOs are automatically confirmed. LoTW confirmations count toward DXCC and other awards. It's faster and cheaper than paper QSL cards.",
    related: ["QSL", "DXCC"],
  },
  {
    term: "LUF",
    short: "Lowest Usable Frequency",
    long: "LUF (Lowest Usable Frequency) is the lowest frequency that will provide a usable signal between two points. Below the LUF, signals are too weak due to D-layer absorption. The LUF varies with time of day, season, and solar activity.",
    related: ["MUF", "FOT"],
  },
  {
    term: "MUF",
    short: "Maximum Usable Frequency for ionospheric propagation",
    long: "MUF (Maximum Usable Frequency) is the highest frequency that will be refracted back to Earth by the ionosphere for a given path. Above the MUF, signals pass through to space. The MUF varies with solar activity, time of day, and path geometry.",
    related: ["FOT", "LUF", "Solar Flux"],
    seeAlso: ["Propagation 101", "Band Guide"],
  },
  {
    term: "Multipath",
    short: "Signal arriving via multiple propagation paths",
    long: "Multipath occurs when signals reach the receiver via different routes (e.g., different ionospheric hops). The slight time differences cause interference patterns, resulting in fading and distortion. Multipath is common on HF and can make signals difficult to copy.",
    related: ["Fade", "Skip"],
  },
  {
    term: "NVIS",
    short: "Near Vertical Incidence Skywave - regional propagation",
    long: "NVIS (Near Vertical Incidence Skywave) is a propagation mode where signals go nearly straight up and are reflected back down, providing coverage within about 300 miles. It works best on 80m and 40m and fills the gap between ground wave and skip zone coverage.",
    related: ["Ground Wave", "Skip Zone"],
  },
  {
    term: "Polar Path",
    short: "Propagation route passing near Earth's poles",
    long: "Polar paths are propagation routes that pass near the north or south pole. These paths are most susceptible to disruption during geomagnetic storms because auroral activity is concentrated near the poles. Monitor K-Index carefully when working polar paths.",
    related: ["K-Index", "Auroral", "Geomagnetic Storm"],
  },
  {
    term: "Propagation",
    short: "How radio waves travel from transmitter to receiver",
    long: "Propagation refers to how radio signals travel from transmitter to receiver. On HF, the primary mode is skywave propagation via the ionosphere. Propagation conditions vary with solar activity, time of day, season, and frequency. Understanding propagation is key to successful DX.",
    related: ["Ionosphere", "Sky Wave", "Ground Wave"],
    seeAlso: ["Propagation 101"],
  },
  {
    term: "QRM",
    short: "Man-made interference",
    long: "QRM is interference from other stations or man-made sources like power lines, computers, or switching power supplies. 'QRM' as a Q-signal means 'I am being interfered with.' Reducing QRM often involves improving station filtering or finding the interference source.",
    related: ["QRN"],
  },
  {
    term: "QRN",
    short: "Natural noise/static",
    long: "QRN refers to natural noise, primarily from atmospheric sources like thunderstorms. It's most prevalent on lower bands (160m, 80m) during summer. 'QRN' as a Q-signal means 'I am troubled by static.' QRN can make weak signals difficult to copy.",
    related: ["QRM"],
  },
  {
    term: "QSB",
    short: "Fading of signals",
    long: "QSB is the Q-signal for fading - variation in signal strength over time. Causes include multipath propagation, changing ionospheric conditions, and antenna movement. Fast QSB (flutter) often indicates auroral propagation or multipath. Slow QSB is common on long paths.",
    related: ["Fade", "Multipath"],
  },
  {
    term: "QSL",
    short: "Confirmation of contact, often via card",
    long: "QSL means 'I confirm receipt' and refers to the practice of exchanging confirmation cards after a contact. QSL cards are used for award credits and as collectibles. Modern alternatives include LoTW (electronic) and eQSL. 'QSL?' means 'Can you confirm?'",
    related: ["LoTW", "DXCC"],
    seeAlso: ["Your First DX"],
  },
  {
    term: "QSO",
    short: "A contact/conversation between stations",
    long: "QSO is the Q-signal for a contact or conversation between amateur radio stations. A basic QSO includes an exchange of callsigns, signal reports, and often names and locations. Contest QSOs are brief exchanges, while ragchews can last hours.",
    related: ["CQ", "RST"],
  },
  {
    term: "RST",
    short: "Signal report: Readability, Strength, Tone",
    long: "RST is the standard signal report system. R (Readability) is 1-5, S (Strength) is 1-9, and T (Tone) is 1-9 (for CW only). A report of '59' means perfect readability and very strong signal. '599' is the standard 'perfect' CW report. Be honest with reports!",
    related: ["QSO"],
    seeAlso: ["Your First DX"],
  },
  {
    term: "Short Path",
    short: "Propagation via the shortest great-circle route",
    long: "Short path is the most direct great-circle route between two stations. It's usually the primary propagation path, but long path can sometimes be better. Beam headings and propagation predictions typically assume short path unless otherwise noted.",
    related: ["Long Path", "Great Circle"],
  },
  {
    term: "SFI",
    short: "Solar Flux Index - measure of solar radio emissions",
    long: "The Solar Flux Index (SFI) measures radio emissions from the sun at 10.7 cm wavelength. It ranges from about 65 (solar minimum) to 300+ (solar maximum). Higher SFI generally means better HF propagation, especially on higher bands. SFI above 150 is considered excellent.",
    related: ["Sunspot Number", "Solar Cycle"],
    seeAlso: ["Propagation 101"],
  },
  {
    term: "Skip",
    short: "Radio wave reflected by the ionosphere",
    long: "Skip refers to the refraction of radio waves by the ionosphere, allowing them to 'skip' over the horizon for long-distance communication. Multiple hops (multi-hop skip) can enable worldwide contacts. The skip distance varies with frequency and ionospheric conditions.",
    related: ["Skip Zone", "Ionosphere", "F Layer"],
  },
  {
    term: "Skip Zone",
    short: "Area too far for ground wave, too close for sky wave",
    long: "The skip zone is the area between the limit of ground wave coverage and where the first skywave signals return to Earth. Stations in the skip zone cannot hear you. Skip zone distance varies with frequency - higher frequencies have larger skip zones.",
    related: ["Skip", "Ground Wave", "NVIS"],
  },
  {
    term: "Sky Wave",
    short: "Radio waves refracted by the ionosphere",
    long: "Sky wave propagation occurs when radio waves are bent back toward Earth by the ionosphere. This is the primary mode for long-distance HF communication. Sky wave range depends on frequency, ionospheric conditions, and the number of hops between ground and ionosphere.",
    related: ["Ground Wave", "Ionosphere", "Skip"],
  },
  {
    term: "Solar Cycle",
    short: "11-year cycle of solar activity",
    long: "The solar cycle is an approximately 11-year pattern of solar activity, measured by sunspot numbers. During solar maximum, HF propagation is excellent with high MUFs. During solar minimum, higher bands may be closed. We're currently in Solar Cycle 25.",
    related: ["Sunspot Number", "SFI"],
    seeAlso: ["Propagation 101"],
  },
  {
    term: "Solar Flux",
    short: "Radio emissions from the sun at 10.7 cm",
    long: "Solar flux (also called SFI or F10.7) measures solar radio emissions at 2800 MHz (10.7 cm wavelength). It correlates with solar activity and ionospheric ionization. Higher values (150+) indicate better HF conditions, especially on higher bands.",
    related: ["SFI", "Solar Cycle", "MUF"],
  },
  {
    term: "Sporadic E",
    short: "Temporary intense E-layer ionization",
    long: "Sporadic E (Es) is temporary patches of intense ionization in the E layer that can provide excellent propagation on 10m, 6m, and even 2m. Es is most common during summer months and can appear suddenly. Watch for sudden openings on the higher bands during Es events.",
    related: ["E Layer", "MUF"],
    seeAlso: ["Band Guide"],
  },
  {
    term: "SSB",
    short: "Single Sideband - voice transmission mode",
    long: "Single Sideband (SSB) is the most common voice mode on HF amateur radio. It uses only one sideband of an AM signal, making it more efficient. LSB (Lower Sideband) is used below 10 MHz, USB (Upper Sideband) above 10 MHz by convention.",
    related: ["CW", "FT8"],
  },
  {
    term: "Sunspot Number",
    short: "Count of visible spots on the sun's surface",
    long: "The Sunspot Number (SSN) counts visible spots on the sun, indicating solar activity level. Higher SSN means more ionization and better HF propagation. SSN ranges from near 0 at solar minimum to 200+ at solar maximum. SSN correlates with Solar Flux Index.",
    related: ["Solar Cycle", "SFI"],
  },
  {
    term: "UTC",
    short: "Coordinated Universal Time - ham radio standard time",
    long: "UTC (Coordinated Universal Time) is the standard time reference for amateur radio worldwide. Using UTC avoids confusion about time zones. Log all contacts in UTC. UTC is the same as GMT (Greenwich Mean Time) and Zulu time. Propulse displays UTC in the header.",
    related: ["QSO"],
  },
  {
    term: "Vertical",
    short: "Vertical antenna, often ground-mounted",
    long: "A vertical antenna is oriented vertically and is often ground-mounted with a radial system. Verticals have a low angle of radiation, making them excellent for DX. They're omnidirectional (no need to rotate) but may be noisier than horizontally polarized antennas.",
    related: ["Antenna", "Dipole", "Beam"],
  },
  {
    term: "Waterfall",
    short: "Visual display of radio signals over time",
    long: "A waterfall display shows radio signals as a scrolling spectrum, with frequency on one axis and time on the other. Signal strength is shown by color intensity. Waterfalls are essential for digital modes like FT8, making it easy to see and click on signals.",
    related: ["FT8"],
  },
];

/**
 * Get a glossary term by name (case-insensitive)
 */
export function getGlossaryTerm(term: string): GlossaryTerm | undefined {
  return GLOSSARY.find((t) => t.term.toLowerCase() === term.toLowerCase());
}

/**
 * Search glossary terms
 */
export function searchGlossary(query: string): GlossaryTerm[] {
  const q = query.toLowerCase();
  return GLOSSARY.filter(
    (t) =>
      t.term.toLowerCase().includes(q) ||
      t.short.toLowerCase().includes(q) ||
      t.long.toLowerCase().includes(q),
  );
}

/**
 * Get glossary terms grouped by first letter
 */
export function getGlossaryByLetter(): Record<string, GlossaryTerm[]> {
  const grouped: Record<string, GlossaryTerm[]> = {};

  for (const term of GLOSSARY) {
    const letter = term.term[0].toUpperCase();
    if (!grouped[letter]) {
      grouped[letter] = [];
    }
    grouped[letter].push(term);
  }

  return grouped;
}
