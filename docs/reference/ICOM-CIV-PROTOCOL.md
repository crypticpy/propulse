# ICOM CI-V Protocol Reference

Controlling Icom radios programmatically is primarily done through the **CI-V (Communication Interface-V)** protocol. This protocol is the industry standard for Icom, used for everything from simple frequency changes to high-speed spectrum waterfall data on modern SDR rigs.

## 1. Official Manufacturer Documentation (Icom CI-V)

Icom provides detailed technical reference guides for nearly every model. These are the "source of truth" for the hex commands.

### Protocol Structure

Standard frame format:

```
FE FE [To Address] [From Address] [Command] [Sub-command] [Data] FD
```

- **FE FE**: Preamble (fixed)
- **Addresses**: The controller (your PC) is typically `E0`, while the radio has a hex address (e.g., `94` for IC-7300, `A4` for IC-705)
- **FD**: End of message (fixed)

### Known Radio Addresses

| Model    | Address |
| -------- | ------- |
| IC-7300  | 0x94    |
| IC-705   | 0xA4    |
| IC-9700  | 0xA2    |
| IC-7610  | 0x98    |
| IC-7851  | 0x8E    |
| IC-R8600 | 0x96    |
| IC-7100  | 0x70    |
| IC-7200  | 0x76    |
| IC-746   | 0x5C    |

### Key CI-V Commands

| Command | Sub-command | Description                                              |
| ------- | ----------- | -------------------------------------------------------- |
| 0x03    | —           | Read operating frequency                                 |
| 0x04    | —           | Read operating mode                                      |
| 0x05    | —           | Set operating frequency (BCD encoded)                    |
| 0x06    | —           | Set operating mode                                       |
| 0x07    | 0x00/0x01   | Set VFO A/B                                              |
| 0x0F    | 0x00/0x01   | Split off/on                                             |
| 0x14    | 0x01-0x16   | Set/read levels (AF, RF, SQL, RFPOWER, etc.)             |
| 0x15    | 0x02        | Read S-meter                                             |
| 0x15    | 0x11        | Read RF power meter                                      |
| 0x15    | 0x12        | Read SWR meter                                           |
| 0x15    | 0x13        | Read ALC meter                                           |
| 0x16    | 0x02-0x47   | Set/read functions (PREAMP, AGC, NB, NR, ANF, VOX, etc.) |
| 0x1A    | various     | Extended settings                                        |
| 0x1C    | 0x00        | Read/set PTT                                             |
| 0x21    | 0x01/0x02   | RIT/XIT offset and enable                                |
| 0x25    | various     | Scope control                                            |
| 0x27    | 0x00        | Scope waveform data (waterfall)                          |

### Response Codes

- **0xFB**: OK / Command accepted
- **0xFA**: NG / Command rejected

### Icom RS-BA1 Network Protocol

For network control (Wi-Fi/Ethernet), Icom uses an encapsulated UDP protocol:

- **Port 50001**: Session control (login/logout, keepalive)
- **Port 50002**: CI-V data (commands encapsulated in UDP packets)
- **Port 50003**: Audio stream (LPCM or Opus)

The internal API for the RS-BA1 software itself isn't public, but the underlying CI-V commands are sent inside these UDP packets.

---

## 2. Open Source Communities & Development Tools

### wfview (Modern SDR/Network Focus)

**wfview** is the gold standard for open-source Icom control, especially for rigs like the IC-7300, IC-705, and IC-9700.

- Written in **C++/Qt**
- Implements the complex protocol needed to stream the **Spectrum Waterfall** data over USB or LAN
- Source code on GitLab, MIT licensed
- Documentation explains how they handle the Icom network protocol (UDP 50001-50003)

### Hamlib (The Universal API)

**Hamlib** (Ham Radio Control Library) is the most widely used backend for radio control.

- Provides a consistent C/C++ API (with bindings for Python, Java, and .NET)
- Includes `rigctld`, a daemon for TCP/IP radio control
- Text-based protocol over TCP (default port 4533)

### Kappanhang (For IC-705/Network Users)

- Specifically for interacting with Icom's built-in RS-BA1 network server without proprietary software
- Written in **Go**
- Creates virtual serial ports and audio devices to bridge your radio to Linux/macOS
- GitHub: `nonoo/kappanhang`

---

## 3. Implementation Summary Table

| Tool / Resource           | Best For                                       | Language             |
| ------------------------- | ---------------------------------------------- | -------------------- |
| **Icom Reference Guides** | Learning raw hex commands & addresses          | N/A (Documentation)  |
| **Hamlib**                | Building cross-platform apps with a stable API | C, C++, Python, etc. |
| **wfview**                | High-performance waterfall and remote GUI      | C++ (Qt)             |
| **RadioLib**              | Arduino/ESP32-based hardware controllers       | C++ (Arduino)        |
| **ICOM.py**               | Quick Python scripts for simple automation     | Python               |

---

## 4. BCD Frequency Encoding

ICOM CI-V uses 5-byte little-endian BCD encoding for frequencies:

```
Example: 14.074.000 Hz = 14,074,000
BCD bytes (LE): [00, 40, 07, 14, 00]

Digit pairs from LSB:
  byte[0] = 00 → digits 00 (1s, 10s Hz)
  byte[1] = 40 → digits 40 (100s, 1000s Hz)
  byte[2] = 07 → digits 07 (10KHz, 100KHz)
  byte[3] = 14 → digits 14 (1MHz, 10MHz)
  byte[4] = 00 → digits 00 (100MHz, 1GHz)
```

Each byte contains two BCD digits: `high_nibble * 10 + low_nibble`, read from byte[4] (MSB) down to byte[0] (LSB) to reconstruct the frequency.

## 5. Scope/Waterfall Data (Command 0x27)

Scope waveform data arrives as multi-sequence CI-V frames:

- **Sequence 1** (header): Contains center frequency, span, scope mode, scope index
- **Sequences 2..N** (data): Raw pixel amplitude values (0-200)

Pixel values map linearly to signal strength:

- 0 → -125 dBm (noise floor)
- 200 → -40 dBm (strong signal)

Scope modes:

- 0x00: Center mode
- 0x01: Fixed mode
- 0x02: Scroll center mode
- 0x03: Scroll fixed mode
