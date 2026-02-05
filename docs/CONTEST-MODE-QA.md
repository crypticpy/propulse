# Contest Mode QA Checklist

This document provides comprehensive test scenarios for Contest Mode, organized by contest type and feature area. Use this checklist for manual verification before releases.

## Test Environment Setup

Before testing, ensure:

- [ ] Browser: Chrome, Firefox, or Safari (latest version)
- [ ] Browser DevTools console open (F12)
- [ ] LocalStorage cleared for fresh state: `localStorage.removeItem('propulse-contest')`
- [ ] Station callsign configured in Settings (e.g., W1AW)

---

## Contest Type Test Scenarios

### CQWW CW/SSB Flow

**Setup:**

1. Start a new contest session
2. Select "CQ World Wide DX Contest - CW" (or SSB)
3. Enter exchange: `05` (your CQ zone)
4. Categories: Single-Op, All Band, High Power, CW (or SSB)
5. Click "Start Contest"

**Test Cases:**

| #   | Test                    | Steps                                  | Expected Result                                        |
| --- | ----------------------- | -------------------------------------- | ------------------------------------------------------ |
| 1   | Basic QSO logging       | Enter `W1AW 599 14` and press Enter    | QSO logged with callsign W1AW, RST 599, Zone 14        |
| 2   | RST omission            | Enter `K3LR 05` and press Enter        | QSO logged with default RST (599 for CW, 59 for SSB)   |
| 3   | Zone multiplier         | Enter `JA1AAA 599 25` and press Enter  | Zone 25 added to multipliers, NEW MULT indicator shown |
| 4   | DXCC multiplier         | Enter first JA call                    | DXCC "JA" added to multipliers                         |
| 5   | Dupe detection          | Enter same callsign again on same band | DUPE badge appears, QSO logged with 0 points           |
| 6   | Different band not dupe | Change to 40m, enter same callsign     | Not marked as dupe (per-band dupe rule)                |
| 7   | Zone range validation   | Enter `W1AW 599 45`                    | Warning for invalid zone (1-40 valid)                  |
| 8   | Score calculation       | Log 3 QSOs with 2 zone mults           | Score = QSO points x multipliers                       |

### ARRL Sweepstakes Flow

**Setup:**

1. Start a new contest session
2. Select "ARRL November Sweepstakes - CW" (or Phone)
3. Enter exchange: `A 72 ORG` (precedence, check, section)
4. Categories: Single-Op, All Band, Low Power, CW
5. Click "Start Contest"

**Test Cases:**

| #   | Test                  | Steps                      | Expected Result                                     |
| --- | --------------------- | -------------------------- | --------------------------------------------------- |
| 1   | Full exchange logging | Enter `W1AW 1 B 56 CT`     | Serial 1, Precedence B, Check 56, Section CT logged |
| 2   | Section multiplier    | Enter unique section call  | Section added to multipliers                        |
| 3   | Serial increment      | Log multiple QSOs          | Serial sent increments: 001, 002, 003...            |
| 4   | Precedence validation | Enter `W1AW 1 X 56 CT`     | Warning for invalid precedence (A/B/M/Q/S/U valid)  |
| 5   | Check year validation | Enter `W1AW 1 A 99 CT`     | Warning if check year seems invalid                 |
| 6   | All 83 sections       | Log sections progressively | Section grid shows worked sections                  |
| 7   | Dupe on any band      | Work W1AW on 20m, then 40m | Marked as dupe (contest-wide dupe rule)             |

### ARRL Field Day Flow

**Setup:**

1. Start a new contest session
2. Select "ARRL Field Day"
3. Enter exchange: `2A ENY` (class and section)
4. Categories: Multi-Op, All Band, Low Power, Mixed
5. Click "Start Contest"

**Test Cases:**

| #   | Test                      | Steps                             | Expected Result                    |
| --- | ------------------------- | --------------------------------- | ---------------------------------- |
| 1   | Class and section logging | Enter `W1AW 1D CT`                | Class 1D, Section CT logged        |
| 2   | Valid classes             | Test classes 1A-20A, 1B-20B, etc. | Valid classes accepted             |
| 3   | Section multiplier        | Each unique section               | Section counted as multiplier      |
| 4   | Mode points               | Log CW QSO, then SSB QSO          | CW gets 2 points, SSB gets 1 point |
| 5   | Per-mode dupes            | Work same call CW then SSB        | Both count (different modes)       |
| 6   | Natural power bonus       | Configure as battery power        | Appropriate bonus applied          |

---

## Feature Test Cases

### Starting and Ending a Session

| #   | Test                     | Steps                                    | Expected Result                           |
| --- | ------------------------ | ---------------------------------------- | ----------------------------------------- |
| 1   | Start new contest        | Click "Start Contest", fill form, submit | Contest page shows active session         |
| 2   | Empty exchange rejection | Leave "My Exchange" blank                | Start button disabled or validation error |
| 3   | Contest selection        | Select each contest from dropdown        | Contest info shows correct description    |
| 4   | Category selection       | Change each category dropdown            | Categories saved correctly                |
| 5   | Cabrillo metadata        | Fill optional fields                     | Fields appear in session config           |
| 6   | End contest              | Click "End Contest", confirm             | Session moved to history                  |
| 7   | Session persistence      | Refresh page during active session       | Session restored from localStorage        |
| 8   | Start during active      | Start new contest while one active       | Previous session saved to history         |

### Logging QSOs with One-Line Entry

| #   | Test              | Steps                                 | Expected Result                       |
| --- | ----------------- | ------------------------------------- | ------------------------------------- |
| 1   | Valid entry       | Enter `W1AW 599 05`, press Enter      | QSO appears in table                  |
| 2   | Callsign only     | Enter `W1AW`, press Enter             | QSO logged with defaults              |
| 3   | Invalid callsign  | Enter `123`, press Enter              | Nothing logged, error shown           |
| 4   | Auto-capitalize   | Enter lowercase `w1aw`                | Converted to `W1AW`                   |
| 5   | Focus management  | Press Enter after logging             | Input cleared, focus retained         |
| 6   | Escape to clear   | Enter partial data, press Escape      | Input cleared                         |
| 7   | Spacing tolerance | Enter `W1AW  599   05` (extra spaces) | Parsed correctly                      |
| 8   | Band/mode display | Observe entry header                  | Shows current band, mode, TX exchange |

### Dupe Detection and Handling

| #   | Test                      | Steps                                    | Expected Result                       |
| --- | ------------------------- | ---------------------------------------- | ------------------------------------- |
| 1   | Real-time dupe check      | Type callsign of worked station          | DUPE badge appears before Enter       |
| 2   | Dupe logged with 0 points | Press Enter on dupe                      | QSO logged, points = 0, isDupe = true |
| 3   | Dupe not counted in score | Check total score                        | Dupe QSO doesn't add to points        |
| 4   | Per-band dupe rules       | Work same call on different band         | Not dupe (for CQWW)                   |
| 5   | Per-mode dupe rules       | Work same call different mode, same band | Check contest-specific behavior       |
| 6   | Contest-wide dupes        | Work same call on any band (SS)          | Dupe detected                         |
| 7   | Dupe indicator color      | Observe entry field with dupe            | Border turns red                      |
| 8   | QSO table dupe marking    | View table after logging dupe            | Row shows dupe indicator              |

### Multiplier Tracking and NEW MULT Indicator

| #   | Test                    | Steps                        | Expected Result                      |
| --- | ----------------------- | ---------------------------- | ------------------------------------ |
| 1   | New mult detection      | Enter callsign with new zone | NEW MULT badge appears               |
| 2   | Mult value display      | Observe area below input     | Shows `+14` for new zone 14          |
| 3   | Entry field color       | Enter new mult callsign      | Border turns green                   |
| 4   | Multiplier panel update | Log new mult QSO             | Mult appears in panel                |
| 5   | Zone grid marking       | Log CQ zone multipliers      | Grid cells light up for worked zones |
| 6   | Worked mult detection   | Enter previously worked mult | No NEW MULT badge                    |
| 7   | Per-band mults          | Work zone on different band  | Shows as new if per-band rules       |
| 8   | Mult count in score     | Log 3 mults                  | Multiplier count shows 3             |

### Undo and Edit Last QSO

| #   | Test                   | Steps                         | Expected Result               |
| --- | ---------------------- | ----------------------------- | ----------------------------- |
| 1   | Ctrl+Z undo            | Log QSO, press Ctrl+Z         | QSO removed from table        |
| 2   | Score recomputed       | Undo QSO with points          | Score decreases appropriately |
| 3   | Mult removed on undo   | Undo QSO that added mult      | Multiplier removed            |
| 4   | Serial not decremented | Undo QSO                      | Serial continues incrementing |
| 5   | Ctrl+E edit last       | Log QSO, press Ctrl+E         | Edit modal opens              |
| 6   | Edit modal fields      | Modify callsign in edit modal | Changes saved correctly       |
| 7   | Edit marked flag       | Edit a QSO                    | QSO shows "edited" flag       |
| 8   | Multiple undos         | Undo 3 QSOs in sequence       | All 3 removed correctly       |
| 9   | Undo with empty log    | Press Ctrl+Z with no QSOs     | No error, nothing happens     |

### Cabrillo Export Validation

| #   | Test                   | Steps                           | Expected Result                 |
| --- | ---------------------- | ------------------------------- | ------------------------------- |
| 1   | Export modal open      | Access Cabrillo export          | Modal opens with preview        |
| 2   | QSO count display      | View stats in modal             | Correct QSO count shown         |
| 3   | Dupe count display     | View stats after logging dupes  | Dupe count accurate             |
| 4   | Claimed score display  | View stats                      | Score matches session total     |
| 5   | Missing callsign error | Export without station callsign | Error shown, download blocked   |
| 6   | Missing email warning  | Export without email            | Warning shown, download allowed |
| 7   | Preview content        | Review preview pane             | Valid Cabrillo format           |
| 8   | QSO lines              | Check QSO section               | Correct format, all fields      |
| 9   | X-QSO for dupes        | Check dupe QSO lines            | Marked as X-QSO                 |
| 10  | Download .cbr          | Click download                  | File downloads correctly        |
| 11  | Download .log          | Select .log format, download    | File has .log extension         |
| 12  | Copy to clipboard      | Click copy                      | Content copied successfully     |

### ADIF Import/Export

**Export Tests:**

| #   | Test                  | Steps                          | Expected Result                |
| --- | --------------------- | ------------------------------ | ------------------------------ |
| 1   | Export tab            | Open ADIF modal, select Export | Export options visible         |
| 2   | Generate preview      | Click Generate Preview         | ADIF content displayed         |
| 3   | Include header option | Toggle header checkbox         | Header present/absent          |
| 4   | Include APP fields    | Toggle APP fields checkbox     | ProPulse fields present/absent |
| 5   | Download ADIF         | Click Download                 | .adi file downloads            |
| 6   | File content          | Open downloaded file           | Valid ADIF format              |

**Import Tests:**

| #   | Test                | Steps                           | Expected Result             |
| --- | ------------------- | ------------------------------- | --------------------------- |
| 7   | Import tab          | Open ADIF modal, select Import  | File picker visible         |
| 8   | File selection      | Browse and select .adi file     | File name displayed         |
| 9   | Invalid file        | Select non-ADIF file            | Error message shown         |
| 10  | Parse preview       | Select valid ADIF               | QSO preview table shown     |
| 11  | Dupe detection      | Import file with existing calls | Dupes identified as skipped |
| 12  | Import confirmation | Click Import button             | QSOs added to session       |
| 13  | Imported QSO count  | Check session after import      | Correct number imported     |
| 14  | Warning display     | Import with issues              | Warnings listed             |

### Bridge Online/Offline Behavior

| #   | Test                      | Steps                         | Expected Result               |
| --- | ------------------------- | ----------------------------- | ----------------------------- |
| 1   | No bridge indicator       | Start without bridge          | Gray dot, "Offline" status    |
| 2   | All features work offline | Log QSOs without bridge       | Full functionality            |
| 3   | Manual band select        | Use Alt+1-9 keys              | Band changes                  |
| 4   | Manual mode select        | Use dropdown                  | Mode changes                  |
| 5   | Connecting indicator      | Bridge starts connecting      | Orange pulsing dot            |
| 6   | Connected indicator       | Bridge connects               | Green dot, "Connected"        |
| 7   | Connection error          | Bridge fails                  | Red dot with error message    |
| 8   | Frequency display         | Connected with frequency      | Frequency shown in entry area |
| 9   | Spot click with bridge    | Click spot in bandmap         | Rig tunes (requires bridge)   |
| 10  | Reconnection              | Bridge disconnects/reconnects | Auto-reconnection attempt     |

---

## Regression Test Checklist

Run these tests after any Contest Mode changes:

### Core Functionality

- [ ] Start new contest session
- [ ] Log basic QSO with Enter
- [ ] Dupe detection works in real-time
- [ ] NEW MULT indicator appears
- [ ] Undo last QSO (Ctrl+Z)
- [ ] Edit last QSO (Ctrl+E)
- [ ] Clear input (Escape)
- [ ] Band change (Alt+1-9)
- [ ] Score updates correctly
- [ ] Multiplier panel updates
- [ ] QSO table shows entries
- [ ] End contest session
- [ ] Session persists on refresh

### Export/Import

- [ ] Cabrillo export generates valid file
- [ ] Cabrillo includes all QSOs
- [ ] Cabrillo marks dupes as X-QSO
- [ ] ADIF export generates valid file
- [ ] ADIF import parses correctly
- [ ] Call history import works

### UI/UX

- [ ] Entry field auto-focuses on page load
- [ ] Focus maintained after logging
- [ ] Keyboard shortcuts work
- [ ] Modal dialogs open/close properly
- [ ] Responsive layout on mobile
- [ ] No console errors during operation

### PropSphere Integration (Ops Console)

- [ ] With active contest, navigate to `/map` and open Ops Console
- [ ] Ops Console defaults to Contest tab for the active session (opt-out by switching to DX)
- [ ] Draft persists across `/contest` ↔ `/map` route changes
- [ ] Map clicks do not steal entry focus (Alt+E always restores focus)
- [ ] Spot click in S&P: sets map target + prefills entry draft
- [ ] Spot click in RUN: does not prefill by default (unless Prefill-in-RUN enabled)
- [ ] Prefill never overwrites an actively-typed draft without confirmation
- [ ] Lite Mode shows Contest HUD pill and bottom-sheet entry access

### Voice Entry (Optional)

- [ ] Voice toggle hotkey `Ctrl+Shift+.` starts/stops recording (when supported)
- [ ] Voice candidates appear after recording and require explicit Apply
- [ ] Applying a voice candidate updates the draft but does not auto-log
- [ ] When voice is unavailable, UI degrades cleanly and manual entry is unaffected

### Data Integrity

- [ ] QSOs persist across sessions
- [ ] Score calculation accurate
- [ ] Multiplier count accurate
- [ ] Serial numbers increment
- [ ] Timestamps are UTC

---

## Performance Test Scenario

### High QSO Count (5,000+ QSOs)

**Setup:**

1. Import a large ADIF file with 5,000+ QSOs
2. Or use browser console to inject test data

**Test Cases:**

| #   | Test                 | Expected Result                     |
| --- | -------------------- | ----------------------------------- |
| 1   | Page load time       | < 3 seconds to interactive          |
| 2   | QSO table rendering  | Smooth scrolling, no lag            |
| 3   | Entry responsiveness | < 100ms response to keystrokes      |
| 4   | Dupe check speed     | Instant (<50ms) for typed callsigns |
| 5   | Score recalculation  | < 500ms after QSO logged            |
| 6   | Undo performance     | < 200ms for undo operation          |
| 7   | Export generation    | < 5 seconds for Cabrillo            |
| 8   | Memory usage         | < 200MB browser memory              |

**Performance Test Script (Browser Console):**

```javascript
// Generate 5000 test QSOs
const store = window.__ZUSTAND_DEVTOOLS__?.get("propulse-contest");
if (!store) {
  console.log("Contest store not found - ensure you have an active session");
} else {
  console.time("Generate 5000 QSOs");
  for (let i = 0; i < 5000; i++) {
    const call = `W${Math.floor(Math.random() * 10)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
    // Log via normal interface for realistic test
  }
  console.timeEnd("Generate 5000 QSOs");
}
```

---

## Accessibility Tests

| #   | Test                 | Expected Result                                 |
| --- | -------------------- | ----------------------------------------------- |
| 1   | Screen reader labels | All inputs have aria-labels                     |
| 2   | Focus indicators     | Visible focus rings on all interactive elements |
| 3   | Color contrast       | Text meets WCAG AA (4.5:1 ratio)                |
| 4   | Keyboard navigation  | All functions accessible via keyboard           |
| 5   | Error announcements  | Validation errors announced to screen readers   |
| 6   | Modal focus trap     | Focus trapped within open modals                |
| 7   | Escape closes modals | Escape key closes all modal dialogs             |

---

## Browser Compatibility

Test on each browser:

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

Per browser, verify:

- [ ] Page loads without errors
- [ ] LocalStorage persistence works
- [ ] Keyboard shortcuts function
- [ ] Clipboard operations work
- [ ] File download works
- [ ] File upload works

---

## Test Data Templates

### CQWW Test QSOs

```
W1AW 599 05
K3LR 599 05
VE3EJ 599 04
JA1AAA 599 25
DL1ABC 599 14
ZL1AAA 599 32
VK2ABC 599 30
PY1ABC 599 11
```

### Sweepstakes Test QSOs

```
W1AW 1 A 56 CT
K3LR 23 B 72 WPA
N1MM 45 M 85 ENY
W0AIH 89 S 63 MN
K5ZD 102 U 78 STX
```

### Field Day Test QSOs

```
W1AW 2A CT
K3LR 1D WPA
W6YX 5A SCV
VE3EJ 3B ONE
N1MM 2A ENY
```

---

## Sign-Off Checklist

Before release, confirm all tests pass:

- [ ] All contest type scenarios pass
- [ ] All feature test cases pass
- [ ] Regression tests complete
- [ ] Performance acceptable
- [ ] Accessibility verified
- [ ] Browser compatibility confirmed
- [ ] No console errors or warnings
- [ ] Documentation updated

**QA Engineer:** ********\_******** **Date:** ********\_********

**Notes:**
