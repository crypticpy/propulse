import { HelpAccordion } from "@/components/help/HelpAccordion";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpFAQ } from "@/components/help/HelpFAQ";

export function SdrConsoleSection() {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <p className="text-sm leading-relaxed text-gray-300">
        The SDR Console connects to your radio hardware through the Propulse
        Radio Daemon, providing frequency control, spectrum/waterfall display,
        DSP processing, and integration with WSJT-X and DX clusters — all from
        your browser.
      </p>

      {/* Connecting to a Radio */}
      <HelpAccordion
        id="connecting"
        title="Connecting to a Radio"
        summary="Setting up the daemon connection and device discovery"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Propulse Radio Daemon is a lightweight binary that runs locally
            on your computer and bridges your SDR or traditional radio hardware
            to the Propulse web application. It communicates with the browser
            via WebSocket.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Default connection</strong> —{" "}
              <code className="text-xs font-mono text-gray-200 bg-white/5 px-1.5 py-0.5 rounded">
                ws://127.0.0.1:9867
              </code>
              . This is the local WebSocket endpoint where the daemon listens.
            </li>
            <li>
              <strong>Configure the daemon URL</strong> — If your daemon is on a
              different machine or port, use the "Change Daemon" button to enter
              a new URL, or configure it in Settings under Connections.
            </li>
            <li>
              <strong>Device discovery</strong> — After connecting to the
              daemon, it automatically discovers available radio devices
              (RTL-SDR, HackRF, traditional radios via CAT/Hamlib). Select a
              device from the dropdown and click Connect.
            </li>
            <li>
              <strong>Auto-reconnect</strong> — Connection state persists. When
              you return to the SDR Console, it automatically reconnects to your
              last-used device if it's still available.
            </li>
            <li>
              <strong>mDNS discovery</strong> — When the device picker is open,
              the daemon also performs mDNS network discovery to find other
              daemons on your local network.
            </li>
          </ul>

          <HelpCallout type="note">
            The daemon must be running on the machine connected to your radio
            hardware. If Propulse is running on the same machine, use the
            default localhost URL. If you're accessing Propulse from a different
            device (e.g., a tablet), configure the daemon to bind to 0.0.0.0 and
            use the daemon machine's LAN IP address.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Radio Controls */}
      <HelpAccordion
        id="radio-controls"
        title="Radio Controls"
        summary="Frequency, mode, PTT, AGC, antenna, and gain"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <div>
            <h4 className="text-white font-semibold mb-1">Frequency Tuning</h4>
            <p>
              Enter a frequency directly in the input field with a unit selector
              (MHz, kHz, or Hz). Press Enter or click Tune to apply. The
              frequency syncs bidirectionally with the connected radio — tuning
              in Propulse updates the radio, and tuning on the radio updates
              Propulse.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Mode Selection</h4>
            <p>
              A dropdown of modes supported by your specific device (AM, FM,
              LSB, USB, CW, etc.). The available modes depend on the connected
              hardware's capabilities. Changing the mode sends a command to the
              radio immediately.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">PTT / Transmit</h4>
            <p>
              Push-to-talk button for devices that support transmit. Shows "PTT
              ON" in red when active, "PTT" when idle. Devices that are
              receive-only (like RTL-SDR) display "RX Only" instead — the PTT
              button is not available.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">AGC</h4>
            <p>
              Automatic Gain Control toggle. When enabled (green), the radio
              automatically adjusts gain to maintain consistent signal levels.
              Disable AGC when you need manual gain control, such as during
              weak-signal work where AGC might mask subtle signals.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Antenna Selection</h4>
            <p>
              If your device has multiple antenna inputs, a dropdown lets you
              select which antenna port to use. This is common on devices like
              HackRF which have separate antenna connectors.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Gain Stages</h4>
            <p>
              Per-stage gain sliders that vary by device. SDR devices typically
              have multiple gain stages (LNA gain, mixer gain, IF gain). Each
              slider shows the stage name, current value, and allows real-time
              adjustment with 50 ms debounce for smooth, responsive control
              without flooding the radio with commands.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* DSP Controls */}
      <HelpAccordion
        id="dsp-controls"
        title="DSP Controls"
        summary="Filter bandwidth, noise reduction, and noise blanker"
      >
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            DSP (Digital Signal Processing) controls are available on devices
            that support audio streaming (SDR devices). These controls shape the
            received audio to improve intelligibility and reduce interference.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1">Filter (Passband)</h4>
            <p>
              Dual sliders for low and high cutoff frequency that define the
              receive passband in Hz. The filter adjusts which audio frequencies
              pass through to your speaker or headphones. Changes are applied
              with 75 ms debounce for a responsive feel. The current passband
              range is displayed in Hz above the sliders.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Noise Reduction (NR)
            </h4>
            <p>
              Toggle on/off with a level control from 0 to 5. Noise Reduction
              uses adaptive filtering to reduce steady-state noise like hiss,
              hum, or broadband noise. Higher levels provide more aggressive
              noise reduction but may introduce artifacts on some signals.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">
              Noise Blanker (NB)
            </h4>
            <p>
              Toggle on/off with a threshold control from 0 to 100. The Noise
              Blanker removes impulse noise — short, sharp spikes caused by
              ignition interference, switching power supplies, electric fences,
              and similar sources. It works by detecting and blanking (muting)
              brief noise pulses. Adjust the threshold so that noise pulses are
              removed without blanking desired signals.
            </p>
          </div>

          <HelpCallout type="tip">
            For SSB, try NR level 2-3 and a 2.4 kHz filter (300-2700 Hz). For
            CW, use NR 3-4 and a 500 Hz filter centered on your sidetone pitch.
            Start conservative and adjust by ear — over-processing can degrade
            signal readability.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Spectrum & Waterfall */}
      <HelpAccordion
        id="spectrum-waterfall"
        title="Spectrum & Waterfall"
        summary="Real-time FFT display with zoom, pan, and click-to-tune"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The SDR Console provides two complementary real-time displays when
            FFT streaming is active:
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1">Spectrum Display</h4>
            <p>
              A real-time Fast Fourier Transform (FFT) display using a
              4096-point FFT at 20 frames per second, with averaging set to 4
              for smooth, stable traces. The spectrum shows signal strength
              (vertical axis) versus frequency (horizontal axis), letting you
              see all signals within your current bandwidth at a glance.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1">Waterfall Display</h4>
            <p>
              A persistent time-versus-frequency display where signals paint as
              colored traces that scroll downward over time. The waterfall makes
              it easy to spot intermittent signals, identify repeating patterns,
              and see the "history" of what has appeared on the band.
            </p>
          </div>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Zoom and Pan</strong> — Use the mouse wheel to zoom in/out
              on the frequency axis. Click and drag to pan across the frequency
              range. The zoom level (span in Hz) is remembered per session.
            </li>
            <li>
              <strong>Click-to-Tune</strong> — Click any point on the spectrum
              or waterfall to instantly tune the radio to that frequency. This
              is the fastest way to jump to a signal you see.
            </li>
            <li>
              <strong>Range Selection</strong> — Click and drag to select a
              frequency range on the waterfall. This tunes to the center of the
              selected range and automatically adjusts the filter bandwidth to
              match the selection width.
            </li>
            <li>
              <strong>Overlay Markers</strong> — DX cluster spots appear as
              orange markers (top 15 visible) and WSJT-X decodes appear as cyan
              markers (top 20) on the waterfall, with callsign labels. Click a
              marker to tune to that frequency.
            </li>
          </ul>

          <p>
            <strong>Streaming Controls:</strong> Start and stop FFT and Audio
            streams independently using the buttons in the Radio Controls panel.
            FFT streaming is auto-started when you first connect to an SDR
            device. Audio streams at 48 kHz PCM (16-bit signed integer).
          </p>
        </div>
      </HelpAccordion>

      {/* WSJT-X Integration */}
      <HelpAccordion
        id="wsjtx"
        title="WSJT-X Integration"
        summary="Live decodes, frequency sync, and status display"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The SDR Console integrates with WSJT-X via UDP, displaying live
            digital mode activity alongside the waterfall display.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong>Connection</strong> — WSJT-X connects to the daemon via
              UDP on port 2237 (configurable in Settings). No configuration is
              needed in most setups — just start WSJT-X on the same machine as
              the daemon.
            </li>
            <li>
              <strong>Status Display</strong> — When WSJT-X is connected, the
              Decodes & Spots panel shows the WSJT-X dial frequency, active mode
              (FT8, FT4, JT65, etc.), and RX/TX delta frequency offsets.
            </li>
            <li>
              <strong>Decode Table</strong> — Real-time list of decoded messages
              showing timestamp, SNR, delta frequency, and the full message
              content. The most recent 200 decodes are retained (FIFO). The
              table updates live as new decode cycles complete.
            </li>
            <li>
              <strong>Waterfall Overlay</strong> — Decoded signals appear as
              cyan markers on the SDR waterfall at their actual RF frequency.
              For LSB modes, the frequency offset calculation is{" "}
              <code className="text-xs font-mono text-gray-200 bg-white/5 px-1.5 py-0.5 rounded">
                RF = dial - deltaFreq
              </code>
              ; for USB modes,{" "}
              <code className="text-xs font-mono text-gray-200 bg-white/5 px-1.5 py-0.5 rounded">
                RF = dial + deltaFreq
              </code>
              .
            </li>
          </ul>

          <HelpCallout type="tip">
            Keep both Propulse and WSJT-X open simultaneously. Propulse handles
            the wideband spectrum view and DX cluster integration while WSJT-X
            handles the decode and transmit workflow. Together they give you a
            complete picture of digital mode activity on the band.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* DX Cluster Overlay */}
      <HelpAccordion
        id="cluster-overlay"
        title="DX Cluster Overlay"
        summary="Spot markers on the waterfall display"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            DX cluster spots that fall within your visible bandwidth
            automatically appear as overlay markers on the waterfall display.
          </p>

          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              Spots appear as <strong>orange markers</strong> with callsign
              labels. Up to 15 spot markers are visible on the waterfall at a
              time to keep the display readable.
            </li>
            <li>
              Click any marker to tune the radio to that spot's frequency — this
              is the fastest way to jump to a spotted station.
            </li>
            <li>
              A maximum of 200 spot messages are retained in memory using a
              first-in, first-out (FIFO) buffer. Older spots are discarded as
              new ones arrive.
            </li>
            <li>
              The DX Cluster Spots list in the Decodes & Spots panel shows the
              spotted callsign, frequency in kHz, and the spotter's comment for
              each spot.
            </li>
          </ul>
        </div>
      </HelpAccordion>

      {/* Bridge & Daemon Setup */}
      <HelpAccordion
        id="daemon-setup"
        title="Bridge & Daemon Setup"
        summary="Installing the Radio Daemon on your computer"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The Propulse Radio Daemon is a lightweight binary that bridges your
            hardware to the browser. It discovers connected radio devices and
            streams control commands, FFT data, and audio over WebSocket.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              Platform-Specific Installation
            </h4>
            <ul className="list-disc list-inside space-y-2 pl-1">
              <li>
                <strong>Windows</strong> — Download the{" "}
                <code className="text-xs font-mono text-gray-200 bg-white/5 px-1.5 py-0.5 rounded">
                  .exe
                </code>{" "}
                binary from the GitHub releases page. Run it directly from
                PowerShell or Explorer. You may need to configure Windows
                Firewall to allow inbound connections on port 9867 if accessing
                from another device.
              </li>
              <li>
                <strong>macOS</strong> — Download the universal binary, make it
                executable with{" "}
                <code className="text-xs font-mono text-gray-200 bg-white/5 px-1.5 py-0.5 rounded">
                  chmod +x
                </code>
                , and run from Terminal. macOS may require you to allow the
                binary in System Preferences &rarr; Security & Privacy on first
                launch.
              </li>
              <li>
                <strong>Linux</strong> — Download the binary for your
                architecture (x86_64 or aarch64 for Raspberry Pi), make it
                executable with{" "}
                <code className="text-xs font-mono text-gray-200 bg-white/5 px-1.5 py-0.5 rounded">
                  chmod +x
                </code>
                , and run. Devices are auto-discovered via libusb. You may need
                to install udev rules for your SDR device for non-root access.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">Configuration</h4>
            <p>
              The daemon creates a configuration file on first run. The config
              specifies the WebSocket port (default 9867), allowed origins,
              device filters, and optional SDRconnect bridge settings. The
              daemon's connection panel in Propulse displays platform info, CPU
              usage, and memory usage for the daemon process.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-1.5">
              HTTPS / Mixed Content
            </h4>
            <p>
              If you are using Propulse on HTTPS (e.g., the deployed site at
              propulse.vercel.app), browsers normally block insecure WebSocket
              connections. Install the Propulse Chrome bridge extension
              (included in the source repository under{" "}
              <code className="text-xs font-mono text-gray-200 bg-white/5 px-1.5 py-0.5 rounded">
                extensions/propulse-daemon-bridge
              </code>
              ) to proxy the connection, or run Propulse locally on
              http://localhost.
            </p>
          </div>
        </div>
      </HelpAccordion>

      {/* Supported Hardware */}
      <HelpAccordion
        id="hardware"
        title="Supported Hardware"
        summary="Compatible SDR and traditional radio hardware"
      >
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <ul className="list-disc list-inside space-y-2 pl-1">
            <li>
              <strong>RTL-SDR</strong> — USB dongle receivers based on the
              RTL2832U chipset. Receive only, wideband coverage. Extremely
              affordable and widely available. Ideal for monitoring and
              waterfall display.
            </li>
            <li>
              <strong>HackRF</strong> — HackRF One. Half-duplex transceiver
              covering 1 MHz to 6 GHz. Supports both receive and transmit.
              Multiple antenna ports and gain stages.
            </li>
            <li>
              <strong>Traditional Radios (CAT/Hamlib)</strong> — Yaesu, Kenwood,
              Icom, Elecraft, FlexRadio, and other brands with computer control
              (CAT) interfaces. The daemon interfaces with these radios through
              Hamlib, supporting over 2,000 radio models. Frequency, mode, PTT,
              and S-meter readings are available.
            </li>
            <li>
              <strong>SDRconnect</strong> — Bridge to SDRconnect-compatible
              devices over your local network. The daemon connects to
              SDRconnect's WebSocket API (port 5454, v1.0.6+) and streams IQ
              data for FFT and audio processing within Propulse.
            </li>
          </ul>

          <HelpCallout type="note">
            Hardware adapter support is actively being expanded. Check the Radio
            Daemon releases page on GitHub for the latest device compatibility
            list. If your device is not currently supported, file an issue on
            the project repository.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* FAQ */}
      <HelpFAQ
        items={[
          {
            question: "How do I install the daemon?",
            answer:
              "Download the binary for your platform from the Propulse GitHub releases page or the Setup Help page in the SDR Console. On macOS and Linux, make it executable with 'chmod +x' and run it from the terminal. On Windows, run the .exe directly. The daemon opens a WebSocket on port 9867 that Propulse connects to automatically when you visit the SDR Console page.",
          },
          {
            question: "Which SDR devices are supported?",
            answer:
              "Currently supported: RTL-SDR dongles (receive only), HackRF One (half-duplex TX/RX), traditional radios via CAT/Hamlib (Yaesu, Kenwood, Icom, Elecraft, and more), and SDRconnect-compatible devices over LAN. Device support is continuously expanding — check the daemon releases page for the latest compatibility updates.",
          },
          {
            question: "Why can't I transmit?",
            answer:
              "Transmission requires a device that supports TX. RTL-SDR devices are receive-only — the PTT button will show 'RX Only' for these devices. For transmit capability, use a HackRF or a traditional radio connected via CAT/Hamlib. Also verify that PTT is enabled in your daemon configuration and that your radio is not in a locked or split mode that prevents transmission.",
          },
        ]}
      />
    </div>
  );
}
