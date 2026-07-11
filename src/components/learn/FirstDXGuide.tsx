import { Card } from "@/components/ui";

interface StepProps {
  number: number;
  title: string;
  children: React.ReactNode;
}

function Step({ number, title, children }: StepProps) {
  return (
    <div className="relative">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-plasma-orange/20 border border-plasma-orange/40 flex items-center justify-center">
          <span className="font-bold text-plasma-orange">{number}</span>
        </div>
        <div className="flex-1 pt-1">
          <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>
          <div className="space-y-3">{children}</div>
        </div>
      </div>
      {number < 5 && (
        <div className="absolute left-5 top-12 bottom-0 w-px bg-white/10 -mb-2" />
      )}
    </div>
  );
}

function ProTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-signal-green/10 border border-signal-green/30 rounded-lg p-3 my-3">
      <div className="flex items-start gap-2">
        <span className="text-signal-green font-bold">TIP:</span>
        <p className="text-sm text-gray-200">{children}</p>
      </div>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-alert-red/10 border border-alert-red/30 rounded-lg p-3 my-3">
      <div className="flex items-start gap-2">
        <span className="text-alert-red font-bold">AVOID:</span>
        <p className="text-sm text-gray-200">{children}</p>
      </div>
    </div>
  );
}

/**
 * FirstDXGuide - Step-by-step guide for making your first DX contact
 */
export function FirstDXGuide() {
  return (
    <div className="space-y-6">
      <Card>
        <p className="text-gray-300 mb-4">
          Making your first long-distance (DX) contact is an exciting milestone.
          This guide walks you through everything you need to know, from
          preparation to logging your QSO.
        </p>

        <div className="bg-aurora-purple/10 border border-aurora-purple/30 rounded-lg p-4">
          <h4 className="font-semibold text-aurora-purple mb-2">What is DX?</h4>
          <p className="text-sm text-gray-300">
            DX means "distance" and refers to making contacts with stations in
            faraway countries. For US stations, DX typically means anywhere
            outside North America. Your first DX contact might be to Europe,
            South America, Japan, or anywhere around the world!
          </p>
        </div>
      </Card>

      <div className="space-y-8">
        <Card>
          <Step number={1} title="Setting Up Your Station">
            <p className="text-gray-300">
              You don't need expensive equipment to work DX. Many hams make
              worldwide contacts with modest stations. Here's what you need:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="font-medium text-white mb-2">
                  Essential Equipment
                </h4>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>- HF transceiver (any power level works)</li>
                  <li>- Antenna (dipole is fine to start)</li>
                  <li>- Antenna tuner (recommended)</li>
                  <li>- Computer for FT8 (optional but helpful)</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="font-medium text-white mb-2">Power Levels</h4>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>- QRP (5W): Challenging but possible</li>
                  <li>- 100W: The sweet spot for most</li>
                  <li>- High power: Not needed for first DX</li>
                </ul>
              </div>
            </div>

            <ProTip>
              Your antenna matters more than power. A good antenna at 100W beats
              a poor antenna at 1000W. Even a simple wire dipole can work the
              world.
            </ProTip>
          </Step>
        </Card>

        <Card>
          <Step number={2} title="Finding Signals">
            <p className="text-gray-300">
              Before you can make a contact, you need to find stations to work.
              Here's how to hunt for DX:
            </p>

            <div className="bg-white/5 rounded-lg p-4 mt-4">
              <h4 className="font-medium text-plasma-orange mb-3">
                Where to Listen
              </h4>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="bg-plasma-orange/20 text-plasma-orange px-2 py-0.5 rounded text-xs">
                    FT8
                  </span>
                  <div>
                    <p className="text-white">
                      14.074 MHz (20m) - Best for beginners
                    </p>
                    <p className="text-gray-400">
                      FT8 shows you exactly who's on the air and where they are.
                      Software decodes stations you can't even hear by ear.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="bg-cosmic-cyan/20 text-cosmic-cyan px-2 py-0.5 rounded text-xs">
                    SSB
                  </span>
                  <div>
                    <p className="text-white">14.195-14.350 MHz (20m)</p>
                    <p className="text-gray-400">
                      Listen for stations calling "CQ DX" or with
                      foreign-sounding callsigns. Accents can help identify the
                      region.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="bg-signal-green/20 text-signal-green px-2 py-0.5 rounded text-xs">
                    CW
                  </span>
                  <div>
                    <p className="text-white">14.000-14.070 MHz (20m)</p>
                    <p className="text-gray-400">
                      CW gets through when SSB can't. Even slow CW (13-15 WPM)
                      can work DX effectively.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 mt-4">
              <h4 className="font-medium text-cosmic-cyan mb-2">
                Use DX Clusters
              </h4>
              <p className="text-sm text-gray-300">
                DX clusters (like DX Summit or DXHeat) show real-time spots of
                DX stations. When someone hears a DX station, they post it to
                the cluster. You can see what's active right now and find their
                frequency.
              </p>
            </div>

            <ProTip>
              Check propagation conditions on Propulse before operating. If the
              K-Index is high or solar flux is low, conditions may be poor. Pick
              a day when conditions are favorable for your first attempt.
            </ProTip>

            <Warning>
              Don't just tune to an empty frequency and start calling CQ. Spend
              time listening first to understand what stations are on the air
              and how contacts are being made.
            </Warning>
          </Step>
        </Card>

        <Card>
          <Step number={3} title="Making the Contact">
            <p className="text-gray-300">
              You've found a DX station - now it's time to make contact. The
              procedure varies by mode, but the basics are the same.
            </p>

            <div className="bg-white/5 rounded-lg p-4 mt-4">
              <h4 className="font-medium text-white mb-3">
                SSB Contact Procedure
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-3">
                  <span className="text-plasma-orange font-mono w-6">1.</span>
                  <p className="text-gray-300">
                    <span className="text-white">
                      Wait for them to call CQ or finish a contact
                    </span>
                    <br />
                    Listen for "CQ DX" or the end of their current QSO
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-plasma-orange font-mono w-6">2.</span>
                  <p className="text-gray-300">
                    <span className="text-white">
                      Give your callsign clearly
                    </span>
                    <br />
                    Just your call, once or twice: "W1ABC" - don't ramble
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-plasma-orange font-mono w-6">3.</span>
                  <p className="text-gray-300">
                    <span className="text-white">Exchange signal reports</span>
                    <br />
                    They give you an RS report (like 59), you give them one back
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-plasma-orange font-mono w-6">4.</span>
                  <p className="text-gray-300">
                    <span className="text-white">
                      Exchange name and location (optional)
                    </span>
                    <br />
                    Keep it brief: "Name is John, QTH is California"
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-plasma-orange font-mono w-6">5.</span>
                  <p className="text-gray-300">
                    <span className="text-white">Sign off</span>
                    <br />
                    "Thanks for the contact, 73" (73 = best wishes)
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 mt-4">
              <h4 className="font-medium text-white mb-3">
                FT8 Contact (Automated)
              </h4>
              <p className="text-sm text-gray-300">
                FT8 software handles the exchange automatically. You click on a
                station's callsign, and the software exchanges grid squares and
                signal reports. A complete contact takes about 90 seconds.
              </p>
            </div>

            <ProTip>
              Keep your transmissions short. DX stations often have pileups
              (many stations calling at once). Give your call once or twice,
              then listen. If they don't come back to you, wait and try again.
            </ProTip>

            <Warning>
              Never transmit on top of a DX station. If they're transmitting,
              you should be listening. Operating "split" (transmitting on a
              different frequency) is common for rare DX.
            </Warning>
          </Step>
        </Card>

        <Card>
          <Step number={4} title="Logging Your Contact">
            <p className="text-gray-300">
              Congratulations on your first DX QSO! Now you need to log it
              properly for award credits and personal records.
            </p>

            <div className="bg-white/5 rounded-lg p-4 mt-4">
              <h4 className="font-medium text-white mb-3">
                Essential Log Information
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-400">Date & Time (UTC)</div>
                <div className="text-white">e.g., 2024-01-15 14:35</div>
                <div className="text-gray-400">Their Callsign</div>
                <div className="text-white">e.g., DL1ABC</div>
                <div className="text-gray-400">Frequency/Band</div>
                <div className="text-white">e.g., 14.250 MHz / 20m</div>
                <div className="text-gray-400">Mode</div>
                <div className="text-white">e.g., SSB, CW, FT8</div>
                <div className="text-gray-400">RST Sent/Received</div>
                <div className="text-white">e.g., 59/59</div>
              </div>
            </div>

            <div className="bg-cosmic-cyan/10 border border-cosmic-cyan/30 rounded-lg p-4 mt-4">
              <h4 className="font-medium text-cosmic-cyan mb-2">
                Use Propulse Logbook
              </h4>
              <p className="text-sm text-gray-300">
                Propulse includes a built-in logbook where you can record all
                your contacts. It automatically tracks DXCC entities, keeps your
                QSO count, and can export to ADIF format for uploading to LoTW
                or other logging services.
              </p>
            </div>

            <ProTip>
              Log immediately after each contact while the details are fresh.
              Don't wait until the end of your session - you might forget
              important details.
            </ProTip>
          </Step>
        </Card>

        <Card>
          <Step number={5} title="Confirming Your Contact (QSL)">
            <p className="text-gray-300">
              To get credit for awards like DXCC, you need to confirm your
              contacts. There are several ways to do this.
            </p>

            <div className="space-y-4 mt-4">
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="font-medium text-plasma-orange mb-2">
                  Logbook of The World (LoTW)
                </h4>
                <p className="text-sm text-gray-300">
                  ARRL's electronic confirmation system. When both stations
                  upload their logs, matching contacts are automatically
                  confirmed. Fast, free, and paperless. Sign up at lotw.arrl.org
                </p>
              </div>

              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="font-medium text-aurora-purple mb-2">
                  QSL Cards (Traditional)
                </h4>
                <p className="text-sm text-gray-300">
                  Physical postcards exchanged through the mail. Can be sent
                  direct (to their address) or via QSL bureaus (slower but
                  cheaper). Many hams collect QSL cards as souvenirs of their
                  contacts.
                </p>
              </div>

              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="font-medium text-cosmic-cyan mb-2">
                  eQSL / QRZ Logbook
                </h4>
                <p className="text-sm text-gray-300">
                  Alternative electronic confirmation systems. Not accepted for
                  DXCC but useful for other awards and personal records. Easy to
                  set up and use.
                </p>
              </div>
            </div>

            <ProTip>
              Set up LoTW right away. It's the standard for DXCC credit. Many
              DXpeditions upload to LoTW quickly after returning home, so your
              confirmation might appear within weeks.
            </ProTip>
          </Step>
        </Card>
      </div>

      {/* Final encouragement */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-3">
          You've Got This!
        </h3>
        <p className="text-gray-300 mb-4">
          Every experienced DXer started with their first contact. Don't be
          discouraged if it takes a few attempts. Here's what to remember:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-signal-green/10 border border-signal-green/30 rounded-lg p-3">
            <h4 className="font-medium text-signal-green mb-1">Patience</h4>
            <p className="text-sm text-gray-300">
              Propagation changes constantly. If the band is dead now, try again
              later or tomorrow.
            </p>
          </div>
          <div className="bg-signal-green/10 border border-signal-green/30 rounded-lg p-3">
            <h4 className="font-medium text-signal-green mb-1">Practice</h4>
            <p className="text-sm text-gray-300">
              Listening is a skill. The more you listen, the better you'll get
              at picking out callsigns from the noise.
            </p>
          </div>
          <div className="bg-signal-green/10 border border-signal-green/30 rounded-lg p-3">
            <h4 className="font-medium text-signal-green mb-1">Persistence</h4>
            <p className="text-sm text-gray-300">
              In a pileup, the station that persists (politely) eventually gets
              through. Keep trying!
            </p>
          </div>
          <div className="bg-signal-green/10 border border-signal-green/30 rounded-lg p-3">
            <h4 className="font-medium text-signal-green mb-1">Have Fun</h4>
            <p className="text-sm text-gray-300">
              This is a hobby! Enjoy the thrill of the chase and the excitement
              when that distant station comes back to you.
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-plasma-orange/10 border border-plasma-orange/30 rounded-lg">
          <p className="text-center text-gray-200">
            <span className="text-plasma-orange font-semibold">
              Ready to start?
            </span>{" "}
            Check the Solar Pulse page for current conditions, then head to your
            radio and tune to 14.074 MHz FT8 or 14.200 MHz SSB. Good luck and
            73!
          </p>
        </div>
      </Card>
    </div>
  );
}

export default FirstDXGuide;
