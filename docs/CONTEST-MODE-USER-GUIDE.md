# Contest Mode User Guide

ProPulse Contest Mode provides a high-speed, keyboard-first contest logging environment optimized for rapid QSO entry, real-time scoring, and accurate multiplier tracking.

## Overview

Contest Mode offers:

- **One-line entry** - Log QSOs with a single input: callsign, RST, and exchange
- **Real-time scoring** - Live score calculation with QSO points and multipliers
- **Dupe detection** - Instant duplicate warnings with per-band/mode accuracy
- **Multiplier tracking** - Visual grids and lists showing worked/needed multipliers
- **Keyboard hotkeys** - Full keyboard operation without mouse dependency
- **Run/S&P modes** - ESM (Enter Sends Message) state machine for both operating styles
- **Cabrillo export** - Generate submission-ready log files
- **ADIF import/export** - Interchange with other logging software
- **Call history** - Import SCP (Super Check Partial) data for faster entry
- **Contest spots** - DX cluster integration with contest-aware filtering
- **Band map** - Visual frequency display with dupe/mult status coloring
- **Bridge integration** - Optional rig control for frequency/mode sync

## Getting Started

### Starting a New Contest Session

1. Navigate to the **Contest** page from the main navigation
2. Click **Start Contest** to open the configuration modal
3. Select your contest from the dropdown (organized by sponsor)
4. Enter your exchange in the **My Exchange** field:
   - For CQWW: Your CQ zone (e.g., `05`)
   - For Sweepstakes: `A 72 ORG` (precedence, check, section)
   - For Field Day: `2A ENY` (class and section)
5. Select your categories:
   - **Operator**: Single-Op or Multi-Op
   - **Band**: All Band or Single Band
   - **Power**: High, Low, or QRP
   - **Mode**: CW, SSB, Digital, or Mixed
   - **Assisted**: Assisted or Non-Assisted (if applicable)
6. Optionally expand **Cabrillo Export Info** to prefill:
   - Operator name
   - Email address
   - Club affiliation
   - Station location (state/section/DX)
7. Click **Start Contest**

Your session begins immediately with the cursor focused on the entry field.

## PropSphere Integration (Map-First Contesting)

Contest Mode is also available inside **PropSphere** (`/map`) so you can operate without leaving the map context.

### Ops Console (DX | Contest)

1. Start (or resume) a contest session on the **Contest** page.
2. Navigate to **PropSphere** (`/map`).
3. Expand the bottom console (expand icon on the DX Cluster drawer) to open the **Ops Console**.
4. Select the **Contest** tab to access:
   - One-line entry + Run/S&P controls
   - Contest-aware spots list + band map

When a contest session is active, the Ops Console defaults to the **Contest** tab for that session (you can opt out by switching to **DX**).

### Lite Mode Contest HUD

In **Lite Mode** (map-first), PropSphere shows a minimal **Contest HUD** pill:

- Open **Contest** to show the bottom sheet entry.
- Use **Rec/Stop** to toggle voice capture.
- Close the HUD with the **X** for the current session.

### Focus and Prefill Rules

- **Focus entry hotkey:** `Alt+E` (also available via the **Focus** button in the dock).
- **Spot → prefill behavior:**
  - In **S&P**, clicking a spot will set the map target and prefill the entry draft.
  - In **RUN**, spot clicks do **not** prefill by default to avoid draft pollution (toggle **Prefill in RUN** in the dock if desired).
- If you are actively typing, spot-based prefill will prompt before replacing the current draft.

### Voice Entry (Optional)

Voice entry is a helper workflow: **you must confirm/apply a candidate** before it affects your log.

- **Voice toggle hotkey:** `Ctrl+Shift+.` (also available in the dock UI).
- After recording, ProPulse generates one-line entry candidates you can **Apply** to the draft.
- If voice transcription is unavailable in your browser, the UI will show **Voice N/A** and manual typing remains fully functional.

## One-Line Entry

The one-line entry field accepts QSO data in a single line. The format depends on the contest but generally follows:

```
CALLSIGN [RST] EXCHANGE
```

### Entry Examples

| Contest          | Entry               | Parsed As                                       |
| ---------------- | ------------------- | ----------------------------------------------- |
| CQWW CW          | `W1AW 599 05`       | W1AW, RST 599, Zone 05                          |
| CQWW CW          | `W1AW 05`           | W1AW, RST 599 (default), Zone 05                |
| Sweepstakes      | `W1AW 1234 A 72 CT` | W1AW, Serial 1234, Prec A, Check 72, Section CT |
| Field Day        | `W1AW 2A CT`        | W1AW, Class 2A, Section CT                      |
| ARRL DX (DX stn) | `K1ABC 599 CA`      | K1ABC, RST 599, State CA                        |

### Entry Behavior

- **Auto-capitalization** - Input is automatically converted to uppercase
- **RST defaults** - If omitted, RST defaults to 599 (CW) or 59 (SSB)
- **Space-separated** - Fields are separated by spaces
- **Real-time parsing** - Validation occurs as you type

### Status Indicators

The entry field displays real-time status:

| Badge        | Color | Meaning                                   |
| ------------ | ----- | ----------------------------------------- |
| **DUPE**     | Red   | Callsign already worked on this band/mode |
| **NEW MULT** | Green | This QSO provides a new multiplier        |

The callsign echo below the input shows:

- Parsed callsign in white (normal) or red (dupe)
- New multiplier values in green (e.g., `+14` for Zone 14)
- Validation warnings in amber
- Validation errors in red

## Keyboard Hotkeys Reference

Contest Mode is designed for keyboard-first operation. All core functions are accessible without a mouse.

### Core Hotkeys

| Key      | Action                | Description                                            |
| -------- | --------------------- | ------------------------------------------------------ |
| `Enter`  | Log QSO / Advance ESM | Logs the current QSO or advances the ESM state machine |
| `Escape` | Clear Input           | Wipes the entry field and resets ESM state             |
| `Ctrl+Z` | Undo Last QSO         | Removes the most recently logged QSO                   |
| `Ctrl+E` | Edit Last QSO         | Opens the edit modal for the last logged QSO           |

### Band Quick-Select

| Key     | Band |
| ------- | ---- |
| `Alt+1` | 160m |
| `Alt+2` | 80m  |
| `Alt+3` | 40m  |
| `Alt+4` | 20m  |
| `Alt+5` | 15m  |
| `Alt+6` | 10m  |
| `Alt+7` | 6m   |
| `Alt+8` | 2m   |
| `Alt+9` | 70cm |

### Function Key Macros (Phase 7)

| Key      | Default Macro | Purpose             |
| -------- | ------------- | ------------------- |
| `F1`     | CQ            | Call CQ             |
| `F2`     | EXCH          | Send exchange       |
| `F3`     | TU            | Thank you / QRZ     |
| `F4`     | QRZ           | Who is calling?     |
| `F5`     | AGN           | Please repeat       |
| `F6`     | CFM           | Confirm             |
| `F7`     | NR            | Your number?        |
| `F8`     | 73            | Sign off            |
| `F9-F12` | Custom        | User-defined macros |

Note: Macro transmission requires bridge connection (see Bridge Setup section).

## Run Mode vs S&P Mode

Contest Mode supports two operating styles with different ESM (Enter Sends Message) sequences.

### Run Mode (Calling CQ)

Use Run mode when holding a frequency and calling CQ.

**ESM Sequence:**

1. `IDLE` - Press Enter to send CQ
2. `CQ_SENT` - CQ transmitted, waiting for reply
3. `EXCH_SENT` - Exchange sent after receiving caller
4. `TU_SENT` - TU/QRZ sent, press Enter to log and return to CQ

### S&P Mode (Search & Pounce)

Use S&P mode when tuning across the band answering other stations.

**ESM Sequence:**

1. `IDLE` - Press Enter to send your call
2. `CALLING` - Your call sent, waiting for response
3. `EXCH_SENT` - Exchange sent after they respond, press Enter to log

### Switching Modes

The current operating mode is displayed in the session status. Toggle between modes using the Run/S&P selector in the contest interface.

## Multiplier Tracking

Contest Mode automatically extracts and tracks multipliers based on contest rules.

### Multiplier Types

| Type        | Source          | Examples      |
| ----------- | --------------- | ------------- |
| CQ Zone     | Exchange        | Zones 1-40    |
| ITU Zone    | Exchange        | Zones 1-90    |
| DXCC        | Callsign prefix | K, VE, JA, DL |
| State       | Exchange        | CA, NY, TX    |
| Section     | Exchange        | ORG, ENY, LAX |
| WPX Prefix  | Callsign        | W1, K3, VE7   |
| Grid Square | Exchange        | FN42, EM73    |

### Multiplier Panel

The multiplier panel displays:

- **Worked count** - Total unique multipliers
- **Visual grid** - For zones (1-40 CQ, 1-90 ITU) and states
- **List view** - For DXCC, prefixes, sections, and grids
- **Recent additions** - Newest multipliers highlighted with pulse animation

### NEW MULT Indicator

When entering a callsign that will provide a new multiplier:

- The entry field border turns green
- A `NEW MULT` badge appears
- The multiplier value shows below the input (e.g., `+14`)

### Needed Multipliers List

The Needed Multipliers panel shows:

- Multipliers you haven't worked on any band
- Multipliers you need on the current band (for per-band mults)
- Priority ranking based on strategic value

## Spots Panel and Bandmap

### Contest Spots Panel

The spots panel shows DX cluster spots with contest-aware tagging:

| Status   | Badge | Color       | Meaning                     |
| -------- | ----- | ----------- | --------------------------- |
| DUPE     | Red   | Gray row    | Already worked              |
| NEW MULT | Green | Highlighted | Provides new multiplier     |
| NEEDED   | Cyan  | Highlighted | Needed mult on another band |
| (none)   | -     | Normal      | Available to work           |

**Filters:**

- **Band**: Current / HF / All
- **Mode**: Current / Any
- **Needed Only**: Show only multiplier spots
- **Hide Dupes**: Filter out already-worked calls
- **Age**: 5m / 15m / 30m / 1h

Click a spot to:

1. Prefill the callsign in the entry field
2. Optionally tune your rig (with bridge connected)

### Contest Bandmap

The bandmap provides a visual frequency/time display:

- **X-axis**: Frequency within the current band
- **Y-axis**: Time (newest at top, 30-minute window)
- **Spot colors**:
  - Orange: NEW MULT (asterisk marker)
  - Cyan: NEEDED multiplier
  - Green: Available (not worked)
  - Gray: DUPE
- **Current frequency**: Dashed orange line (with bridge)

Click a spot to select it for logging.

## Cabrillo Export

Generate a Cabrillo log file for contest submission.

### Exporting Your Log

1. From the Contest page, access the export menu
2. Click **Export Cabrillo**
3. Review the preview showing:
   - QSO count
   - Dupe count
   - Claimed score
4. Check validation warnings (missing email, name, etc.)
5. Select file format: `.cbr` (Cabrillo) or `.log`
6. Click **Download** or **Copy** to clipboard

### Cabrillo Validation

The export validates required fields:

- **Errors** (block download):
  - Missing station callsign
  - Missing contest identifier
  - No valid QSOs
- **Warnings** (allow download):
  - Missing email address
  - Missing operator name
  - Missing location

### Cabrillo Header Fields

Configure these during contest setup or in the export modal:

- `CALLSIGN`: Your station callsign
- `CATEGORY-OPERATOR`: Single-Op / Multi-Op
- `CATEGORY-ASSISTED`: Assisted / Non-Assisted
- `CATEGORY-BAND`: All / Single band
- `CATEGORY-MODE`: CW / SSB / RTTY / Mixed
- `CATEGORY-POWER`: High / Low / QRP
- `NAME`: Operator name
- `EMAIL`: Contact email
- `CLUB`: Club affiliation
- `LOCATION`: State / Section / DX

## ADIF Import/Export

### Exporting to ADIF

1. Open the ADIF Import/Export modal
2. Select the **Export** tab
3. Configure options:
   - **Include ADIF header**: Adds version and program info
   - **Include ProPulse fields**: Preserves dupe/mult data
4. Click **Generate Preview**
5. Click **Download ADIF File**

The ADIF export includes standard fields plus ProPulse-specific APP fields for round-trip data preservation.

### Importing from ADIF

1. Open the ADIF Import/Export modal
2. Select the **Import** tab
3. Click **Browse** or drag-and-drop your `.adi` file
4. Review the import preview:
   - Records parsed
   - Duplicates skipped
   - Import errors
5. Optionally check **Replace existing history**
6. Click **Import**

Imported QSOs are validated and integrated into your session with automatic dupe detection.

## Call History Import

Import call history to enhance SCP (Super Check Partial) suggestions.

### Importing Call History

1. Open the Call History Import modal
2. Select file format:
   - **Auto-detect**: Analyzes file structure
   - **Simple CSV**: Header row with CALL column
   - **N1MM**: Export from N1MM Logger+
3. Upload your file (drag-drop or browse)
4. Review parsed entries and any errors
5. Choose to **Merge** or **Replace** existing history
6. Click **Import**

### Supported Formats

**Simple CSV:**

```csv
CALL,EXCHANGE,NAME,SECTION
W1AW,05,HIRAM,CT
K3LR,05,TIM,WPA
```

**N1MM Call History:**
Export from N1MM Logger+ via Tools > Generate Call History

### Using Call History

Once imported, call history enhances:

- SCP suggestions as you type
- Exchange prefill for known stations
- Section/zone lookups

## Bridge Setup (Optional)

The bridge provides rig control integration for frequency/mode synchronization.

### Requirements

- ProPulse Bridge application running on your computer
- Supported rig with CAT control
- WebSocket connection to bridge (default: `ws://127.0.0.1:9867`)

### Connection Status

The bridge status indicator shows:

- **Green dot**: Connected - rig control active
- **Orange dot** (pulsing): Connecting
- **Gray dot**: Offline - working without bridge
- **Red dot**: Error - connection failed

### Features with Bridge

When connected, the bridge enables:

- Automatic band/mode detection from rig
- Frequency display in entry area and bandmap
- Spot clicking tunes the rig
- Macro transmission via rig (Phase 7)

### Working Without Bridge

Contest Mode fully functions without bridge connection:

- Manual band/mode selection via dropdowns
- Alt+1-9 for quick band changes
- All logging and scoring features available

## Troubleshooting

### Common Issues

**QSO not logging when pressing Enter**

- Verify the entry contains at least a valid callsign
- Check for validation errors shown below the input
- Ensure the input field has focus

**Dupe indicator not showing**

- Confirm the callsign is fully entered (minimum 2 characters)
- Verify the band/mode matches a previous QSO
- Check the contest's dupe rules (per-band, per-mode, or contest-wide)

**Multiplier not detected**

- Ensure the exchange field is correctly entered
- Verify the contest definition includes this multiplier type
- Check if the multiplier was already worked (check Multiplier Panel)

**Bridge connection failing**

- Verify ProPulse Bridge is running
- Check the WebSocket URL (default: `ws://127.0.0.1:9867`)
- Review bridge logs for connection errors

**Cabrillo export missing fields**

- Configure station callsign in Settings
- Fill in Cabrillo metadata during contest setup
- Check validation warnings in export modal

**Hotkeys not working**

- Ensure focus is on the entry field
- Check for modal dialogs blocking input
- Verify no browser extensions intercepting keys
- Function keys may require Fn key on some keyboards

### Recovering from Mistakes

**Logged wrong callsign:**

1. Press `Ctrl+Z` to undo the last QSO, or
2. Press `Ctrl+E` to edit the last QSO, or
3. Click the edit icon in the QSO table

**Accidentally ended contest:**

- Session history preserves your data
- Start a new session or contact support for recovery

**Lost QSO data:**

- Contest data persists in browser localStorage
- Export regularly to ADIF as backup
- Check browser's stored data if issues occur

### Performance Tips

- **Large logs (5,000+ QSOs)**: Initial load may take 1-2 seconds
- **Slow spots**: Reduce age filter in spots panel
- **Bandmap lag**: Fewer spots render faster with smaller time windows
- **Browser memory**: Close unused tabs during intensive operation

## Keyboard Reference Card

Print this card for quick reference during contests:

```
+--------------------------------------------------+
|                 CONTEST HOTKEYS                  |
+--------------------------------------------------+
| Enter     | Log QSO / Advance ESM               |
| Escape    | Clear input / Reset ESM             |
| Ctrl+Z    | Undo last QSO                       |
| Ctrl+E    | Edit last QSO                       |
+--------------------------------------------------+
|                  BAND SELECT                     |
+--------------------------------------------------+
| Alt+1 160m | Alt+4 20m | Alt+7 6m               |
| Alt+2  80m | Alt+5 15m | Alt+8 2m               |
| Alt+3  40m | Alt+6 10m | Alt+9 70cm             |
+--------------------------------------------------+
|                    MACROS                        |
+--------------------------------------------------+
| F1 CQ    | F3 TU   | F5 AGN  | F7 NR            |
| F2 EXCH  | F4 QRZ  | F6 CFM  | F8 73            |
+--------------------------------------------------+
```
