# Propulse Competitor & Data Source Analysis

> Comprehensive reference document for ham radio propagation tools, data sources, and logging software.
> Last updated: January 2026

---

## Table of Contents

1. [Solar/Propagation Data Sources](#1-solarpropagation-data-sources)
2. [Spot/Activity Sources](#2-spotactivity-sources)
3. [Logging Software](#3-logging-software)
4. [All-in-One Tools](#4-all-in-one-tools)
5. [Key Takeaways for Propulse](#5-key-takeaways-for-propulse)

---

## 1. Solar/Propagation Data Sources

### 1.1 NOAA Space Weather Prediction Center (SWPC)

| Attribute            | Details                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL**              | https://www.swpc.noaa.gov/                                                                                                                                  |
| **Data Provided**    | Solar X-ray flux, solar wind, geomagnetic indices (Kp, Ap, Dst), solar flare alerts, 27-day forecasts, aurora forecasts, proton events, GOES satellite data |
| **API Availability** | **Yes** - Extensive JSON/text APIs at https://services.swpc.noaa.gov/json/ and https://services.swpc.noaa.gov/text/                                         |
| **Data Formats**     | JSON, plain text, XML                                                                                                                                       |
| **Update Frequency** | Real-time to 3-hour intervals depending on product                                                                                                          |
| **Cost**             | Free (US Government)                                                                                                                                        |

**Key Endpoints:**

- `/json/solar-cycle/observed-solar-cycle-indices.json` - Historical solar cycle data
- `/json/planetary_k_index_1m.json` - Real-time Kp index
- `/json/goes/primary/xrays-6-hour.json` - X-ray flux
- `/text/daily-solar-indices.txt` - Comprehensive daily indices

**Strengths:**

- Authoritative source (official US government data)
- Comprehensive coverage of all space weather parameters
- Well-documented API with consistent formats
- High reliability and uptime
- Historical data archives

**Weaknesses:**

- Can be overwhelming for casual users
- Some data has 1-3 hour latency
- No ham-radio-specific interpretations

**What Propulse Should Learn:**

- Use SWPC as primary authoritative data source
- Layer ham-radio-specific interpretations on top of raw data
- Implement proper caching to reduce API load

---

### 1.2 HamQSL.com / N0NBH Solar Data

| Attribute            | Details                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL**              | https://www.hamqsl.com/solar.html                                                                                                                              |
| **Data Provided**    | Solar flux index (SFI), A-index, K-index, sunspot number, X-ray conditions, geomagnetic field status, band condition indicators (80m-10m), signal noise levels |
| **API Availability** | **Yes** - XML feed at https://www.hamqsl.com/solarxml.php                                                                                                      |
| **Data Formats**     | XML, embeddable widget images                                                                                                                                  |
| **Update Frequency** | ~15 minutes                                                                                                                                                    |
| **Cost**             | Free                                                                                                                                                           |

**Key Features:**

- Famous "solar-terrestrial data" widget used on thousands of ham sites
- Simple band condition ratings (Good/Fair/Poor)
- Pre-calculated ham band condition assessments
- Lightweight and fast

**Strengths:**

- Ham-radio focused interpretation of solar data
- Simple, digestible format
- Easy-to-embed widgets
- Long-standing community trust (since ~2003)
- Aggregates multiple data sources

**Weaknesses:**

- Single point of failure (one person's project)
- Band condition algorithm is opaque/proprietary
- Limited historical data
- No granular API (all-or-nothing XML)

**What Propulse Should Learn:**

- Simplify complex data into actionable band ratings
- Provide embeddable widgets for user blogs/sites
- Show "at a glance" summaries prominently

---

### 1.3 SolarHam

| Attribute            | Details                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL**              | https://www.solarham.net/                                                                                                                    |
| **Data Provided**    | Real-time solar imagery (SDO, SOHO, STEREO), sunspot analysis, solar flare tracking, coronal hole monitoring, CME tracking, aurora forecasts |
| **API Availability** | **No** - Website only, scraping discouraged                                                                                                  |
| **Data Formats**     | HTML, embedded images/videos                                                                                                                 |
| **Update Frequency** | Near real-time with manual analysis                                                                                                          |
| **Cost**             | Free (ad-supported)                                                                                                                          |

**Key Features:**

- Expert human analysis of solar conditions
- Excellent solar imagery aggregation
- CME arrival time predictions
- Aurora probability forecasts
- Active region numbering and tracking

**Strengths:**

- Human expert interpretation adds value
- Aggregates imagery from multiple spacecraft
- Good at predicting geomagnetic storms
- Active community following

**Weaknesses:**

- No API - not machine-readable
- Dependent on single maintainer
- Mobile experience is poor
- No band-specific predictions

**What Propulse Should Learn:**

- Aggregate solar imagery from multiple sources
- Add human-readable interpretive text
- Track active regions with ham-relevant commentary

---

### 1.4 NASA OMNI Database

| Attribute            | Details                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL**              | https://omniweb.gsfc.nasa.gov/                                                                                                               |
| **Data Provided**    | Interplanetary magnetic field (IMF), solar wind plasma data, geomagnetic indices, spacecraft position data, merged multi-spacecraft datasets |
| **API Availability** | **Yes** - COHOWeb and OMNIWeb data services                                                                                                  |
| **Data Formats**     | ASCII, CDF, HDF                                                                                                                              |
| **Update Frequency** | Hourly to daily (research-grade, not real-time)                                                                                              |
| **Cost**             | Free (NASA)                                                                                                                                  |

**Key Features:**

- Definitive research-quality datasets
- 50+ years of historical data
- Cross-calibrated multi-spacecraft data
- Detailed solar wind parameters

**Strengths:**

- Highest quality scientific data
- Extensive historical archive
- Well-documented data provenance
- Peer-reviewed methodology

**Weaknesses:**

- Not real-time (research focus)
- Complex data formats
- Overkill for operational ham use
- Steep learning curve

**What Propulse Should Learn:**

- Use for historical trend analysis
- Reference for validating other data sources
- Long-term solar cycle visualizations

---

### 1.5 DRAO Solar Flux (Penticton)

| Attribute            | Details                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| **URL**              | https://www.spaceweather.gc.ca/forecast-prevision/solar-solaire/solarflux/sx-5-en.php           |
| **Data Provided**    | 10.7 cm (2800 MHz) solar radio flux - the definitive SFI measurement                            |
| **API Availability** | **Yes** - Text files at ftp://ftp.seismo.nrcan.gc.ca/spaceweather/solar_flux/daily_flux_values/ |
| **Data Formats**     | Fixed-width text, CSV                                                                           |
| **Update Frequency** | 3x daily measurements (local noon + adjusted)                                                   |
| **Cost**             | Free (Canadian Government)                                                                      |

**Key Features:**

- THE authoritative source for Solar Flux Index
- Continuous measurements since 1947
- Adjusted and observed values
- Used by NOAA and worldwide

**Strengths:**

- Gold standard for SFI data
- Longest continuous solar radio observation
- Scientific reference standard
- Very reliable

**Weaknesses:**

- Only one metric (10.7cm flux)
- FTP access can be unreliable
- No ham-specific interpretation
- Basic text format only

**What Propulse Should Learn:**

- Use DRAO as authoritative SFI source
- Display both observed and adjusted values
- Show SFI trend over solar cycle

---

### 1.6 Australian Space Weather Services (SWS)

| Attribute            | Details                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **URL**              | https://www.sws.bom.gov.au/                                                                                      |
| **Data Provided**    | Real-time ionospheric data, foF2 measurements, T-index, Australian region HF predictions, ionosonde network data |
| **API Availability** | **Limited** - Some JSON feeds, mostly web-based                                                                  |
| **Data Formats**     | JSON, images, PDF reports                                                                                        |
| **Update Frequency** | Real-time ionosonde data                                                                                         |
| **Cost**             | Free                                                                                                             |

**Key Features:**

- Excellent Southern Hemisphere coverage
- Real-time ionosonde network
- HF propagation predictions for Australia
- T-index (Australian geomagnetic activity)

**Strengths:**

- Best source for Southern Hemisphere
- Real ionospheric measurements (not modeled)
- Operational HF prediction service
- Good mobile site

**Weaknesses:**

- Australia-centric
- Limited API documentation
- Some tools are dated
- Less comprehensive than SWPC

**What Propulse Should Learn:**

- Integrate Southern Hemisphere data sources
- Show real ionosonde measurements where available
- Regional propagation predictions matter

---

### 1.7 DXLook

| Attribute            | Details                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| **URL**              | https://dxlook.com/                                                                                 |
| **Data Provided**    | Aggregated propagation predictions, band conditions, grayline visualization, DX cluster integration |
| **API Availability** | **No**                                                                                              |
| **Data Formats**     | Web only                                                                                            |
| **Update Frequency** | Varies                                                                                              |
| **Cost**             | Free                                                                                                |

**Key Features:**

- Combines multiple data sources
- Quick band condition overview
- Grayline map
- DX cluster feed integration

**Strengths:**

- Simple, clean interface
- Good mobile experience
- Combines propagation with DX spots

**Weaknesses:**

- No API
- Limited customization
- Unclear data sources
- Basic feature set

**What Propulse Should Learn:**

- Clean, simple UI for quick checks
- Combine propagation data with real-time spots
- Mobile-first design matters

---

### 1.8 VOACAP Online

| Attribute            | Details                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **URL**              | https://www.voacap.com/                                                                                                   |
| **Data Provided**    | Point-to-point HF propagation predictions, coverage area maps, antenna pattern analysis, circuit reliability calculations |
| **API Availability** | **Yes** - VOACAP prediction engine API (paid tiers available)                                                             |
| **Data Formats**     | JSON, PNG maps, ITU-R text format                                                                                         |
| **Update Frequency** | On-demand calculations                                                                                                    |
| **Cost**             | Free tier + paid premium options                                                                                          |

**Key Features:**

- Industry-standard VOACAP/ICEPAC engine
- Detailed point-to-point predictions
- Antenna pattern integration
- Time-of-day propagation charts
- Coverage area mapping

**Strengths:**

- Scientific propagation modeling
- Highly customizable
- Professional-grade predictions
- Well-documented methodology

**Weaknesses:**

- Complex for beginners
- Requires understanding of propagation theory
- Predictions vs reality can vary
- Some features are paywalled

**What Propulse Should Learn:**

- Integrate VOACAP for detailed predictions
- Simplify the interface for casual users
- Show confidence intervals, not just predictions
- Offer both simple and advanced modes

---

### 1.9 prop.kc2g.com (Real-time MUF Maps)

| Attribute            | Details                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **URL**              | https://prop.kc2g.com/                                                                                                    |
| **Data Provided**    | Real-time Maximum Usable Frequency (MUF) maps derived from ionosonde data, foF2 contours, actual vs predicted comparisons |
| **API Availability** | **Limited** - Image tiles, some JSON data                                                                                 |
| **Data Formats**     | PNG map tiles, GeoJSON                                                                                                    |
| **Update Frequency** | 15-minute updates                                                                                                         |
| **Cost**             | Free                                                                                                                      |

**Key Features:**

- Real-time global MUF visualization
- Based on actual ionosonde measurements
- Shows propagation "right now"
- Animated time-lapse option
- Grayline overlay

**Strengths:**

- Real measured data, not just predictions
- Beautiful map visualization
- Quick to understand
- Shows actual conditions
- Active development

**Weaknesses:**

- Limited to MUF (no other parameters)
- Ionosonde network has gaps
- No point-to-point predictions
- Limited historical data access

**What Propulse Should Learn:**

- Real-time visualization is compelling
- Use actual measurements over predictions when possible
- Map-based interfaces are intuitive
- Animate temporal data

---

### 1.10 DXMaps (Sporadic E and VHF/UHF)

| Attribute            | Details                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| **URL**              | https://www.dxmaps.com/                                                                              |
| **Data Provided**    | Real-time sporadic E (Es) detection, VHF/UHF propagation maps, Es MUF estimation, propagation alerts |
| **API Availability** | **No**                                                                                               |
| **Data Formats**     | Web-based maps                                                                                       |
| **Update Frequency** | Real-time (spot-based)                                                                               |
| **Cost**             | Free                                                                                                 |

**Key Features:**

- Sporadic E cloud detection and tracking
- VHF/UHF propagation monitoring
- Based on real DX spots
- Es MUF estimation
- Alert system for openings

**Strengths:**

- Best source for Es monitoring
- VHF/UHF focus (underserved niche)
- Real-time spot-based detection
- Visual cloud tracking

**Weaknesses:**

- Dependent on spot submissions
- No API access
- Euro-centric coverage
- Dated interface

**What Propulse Should Learn:**

- Sporadic E monitoring is valuable
- VHF/UHF propagation is underserved
- Crowdsourced spot data can detect openings
- Alert systems for band openings

---

## 2. Spot/Activity Sources

### 2.1 PSKReporter

| Attribute            | Details                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **URL**              | https://pskreporter.info/                                                                                                              |
| **Data Provided**    | Real-time digital mode reception reports (FT8, FT4, JS8, PSK31, WSPR, etc.), transmitter locations, receiver locations, signal reports |
| **API Availability** | **Yes** - Comprehensive API at https://pskreporter.info/cgi-bin/pskquery5.pl                                                           |
| **Data Formats**     | XML, JSON, CSV                                                                                                                         |
| **Update Frequency** | Real-time (continuous)                                                                                                                 |
| **Cost**             | Free                                                                                                                                   |

**Key API Parameters:**

- `flowStartSeconds` - Time window
- `rronly` - Specific reporter only
- `senderCallsign` - Filter by sender
- `mode` - Filter by mode (FT8, WSPR, etc.)
- `frange` - Frequency range

**Strengths:**

- Massive dataset (millions of spots daily)
- True real-time propagation data
- Automatic uploads from WSJT-X, etc.
- Global coverage
- Flexible API

**Weaknesses:**

- Digital modes only (no CW/SSB)
- Dependent on reporter density
- Can be slow during peak times
- Complex query syntax

**What Propulse Should Learn:**

- PSKReporter is essential for real-time propagation
- Use spots to validate predictions
- Show "who's hearing whom" maps
- Aggregate by band/mode for condition assessment

---

### 2.2 Reverse Beacon Network (RBN)

| Attribute            | Details                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| **URL**              | https://www.reversebeacon.net/                                                                  |
| **Data Provided**    | Real-time CW and RTTY spots from automated skimmer receivers, signal strength, frequency, speed |
| **API Availability** | **Yes** - Telnet feed (port 7000) and web API                                                   |
| **Data Formats**     | Telnet stream, JSON                                                                             |
| **Update Frequency** | Real-time (sub-second)                                                                          |
| **Cost**             | Free                                                                                            |

**Access Methods:**

- Telnet: `telnet.reversebeacon.net:7000`
- Web: `https://www.reversebeacon.net/main.php?rows=...`
- Aggregator: DX Spider nodes

**Strengths:**

- CW coverage (PSKReporter gap)
- Very low latency
- Automated (no human delay)
- SNR data for propagation assessment
- Global skimmer network

**Weaknesses:**

- CW/RTTY only (no SSB)
- Skimmer density varies by region
- Requires active CQing to generate spots
- Can miss weak signals

**What Propulse Should Learn:**

- Combine RBN + PSKReporter for comprehensive coverage
- Real-time telnet feeds enable instant alerts
- SNR trends indicate band conditions
- Skimmer network = free propagation beacons

---

### 2.3 DX Clusters (DXSummit, DXWatch, DX Spider)

| Attribute            | Details                                                             |
| -------------------- | ------------------------------------------------------------------- |
| **URL**              | https://dxsummit.fi/, https://dxwatch.com/, various telnet nodes    |
| **Data Provided**    | Human-submitted DX spots, rare station alerts, propagation comments |
| **API Availability** | **Yes** - Telnet protocol, web feeds                                |
| **Data Formats**     | Telnet stream, HTML, XML                                            |
| **Update Frequency** | Real-time                                                           |
| **Cost**             | Free                                                                |

**Major Cluster Networks:**

- **DX Spider** - Most common node software
- **AR-Cluster** - Windows-based nodes
- **DXSummit** - Web aggregator (OH8X)
- **DXWatch** - Clean web interface

**Telnet Access:**

- `dxc.nc7j.com:7373`
- `dxc.w3lpl.net:7373`
- Many regional nodes

**Strengths:**

- Human-curated spots (SSB included)
- Real operator intelligence
- Rare DX alerts
- Contest activity tracking
- Long history (decades of data)

**Weaknesses:**

- Human latency (slower than automated)
- Busted spots and errors
- Requires connected users to submit
- Declining usage with automated alternatives

**What Propulse Should Learn:**

- Human spots still valuable for SSB/rare DX
- Combine automated + human sources
- Filter/deduplicate across networks
- Track spot velocity for band opening detection

---

### 2.4 WSPRnet

| Attribute            | Details                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| **URL**              | https://wsprnet.org/                                                             |
| **Data Provided**    | WSPR beacon reception reports, SNR, frequency drift, transmitter power, distance |
| **API Availability** | **Yes** - Database query interface                                               |
| **Data Formats**     | HTML tables, CSV export                                                          |
| **Update Frequency** | 2-minute WSPR windows                                                            |
| **Cost**             | Free                                                                             |

**Query Parameters:**

- Band selection
- Time range
- Callsign filter
- Distance filter
- Grid square filter

**Strengths:**

- True propagation beacons (not QSOs)
- Very low power = remarkable sensitivity
- Long-term historical database
- Good for path analysis

**Weaknesses:**

- 2-minute cycle = slower updates
- Beacon-only (not regular QSOs)
- Lower user base than FT8
- Database can be slow

**What Propulse Should Learn:**

- WSPR data excellent for propagation trends
- Compare WSPR with predicted conditions
- Historical analysis of band openings
- Low-power paths indicate good conditions

---

## 3. Logging Software

### 3.1 N1MM Logger+

| Attribute       | Details                     |
| --------------- | --------------------------- |
| **Platform**    | Windows only                |
| **Cost**        | Free (donationware)         |
| **URL**         | https://n1mmwp.hamdocs.com/ |
| **Primary Use** | Contest logging             |

**Key Features:**

- Industry-standard contest logger
- Supports virtually all contests
- Networked multi-operator
- CW/voice keying
- Band map integration
- Real-time scoring
- Cabrillo export

**Strengths:**

- De facto contest standard
- Massive contest database
- Excellent documentation
- Active development
- Free

**Weaknesses:**

- Windows only
- Contest-focused (less suited for casual logging)
- Steep learning curve
- Complex configuration
- Dated UI

**Data Formats:**

- ADIF import/export
- Cabrillo contest format
- Native .mdb database

**What Propulse Should Learn:**

- Band map visualization is essential
- Real-time dupe checking matters
- Keyboard-driven operation for speed
- Network sync for multi-op

---

### 3.2 Ham Radio Deluxe (HRD Logbook)

| Attribute       | Details                         |
| --------------- | ------------------------------- |
| **Platform**    | Windows                         |
| **Cost**        | $99.95 USD (perpetual)          |
| **URL**         | https://www.hamradiodeluxe.com/ |
| **Primary Use** | General logging + rig control   |

**Key Features:**

- Integrated logging + rig control
- DX cluster integration
- Award tracking (DXCC, WAS, etc.)
- QSL management
- eQSL/LoTW integration
- Satellite tracking
- Digital mode interface

**Strengths:**

- All-in-one solution
- Good rig control
- Award tracking
- Active development

**Weaknesses:**

- Paid software
- Windows only
- Can be bloated
- Mixed community reception
- License management issues

**Data Formats:**

- ADIF
- LoTW integration
- eQSL integration

**What Propulse Should Learn:**

- Integrated solutions are valuable
- Award tracking motivates users
- LoTW/eQSL integration is expected
- Rig control ties logging to operating

---

### 3.3 Log4OM

| Attribute       | Details                        |
| --------------- | ------------------------------ |
| **Platform**    | Windows                        |
| **Cost**        | Free (V1) / Paid (V2 - 40 EUR) |
| **URL**         | https://www.log4om.com/        |
| **Primary Use** | General logging                |

**Key Features:**

- Modern UI
- Award tracking
- Cluster integration
- QSL management
- Statistics and reports
- OQRS support
- Club Log integration

**Strengths:**

- Modern interface
- Good award tracking
- Active European community
- Reasonable price
- Feature-rich

**Weaknesses:**

- Windows only
- Some features V2-only
- Less contest support than N1MM

**Data Formats:**

- ADIF
- Club Log
- LoTW
- eQSL

**What Propulse Should Learn:**

- Modern UI matters
- Statistics engage users
- Club Log integration is valuable
- OQRS workflow support

---

### 3.4 QRZ Logbook

| Attribute       | Details                                                  |
| --------------- | -------------------------------------------------------- |
| **Platform**    | Web-based (any platform)                                 |
| **Cost**        | Free basic / $35/year XML subscription for full features |
| **URL**         | https://logbook.qrz.com/                                 |
| **Primary Use** | Online logging, callsign lookup                          |

**Key Features:**

- Cloud-based logging
- QRZ.com integration
- Callsign lookups
- eQSL integration
- Mobile friendly
- ADIF import/export
- Basic award tracking

**API Availability:**

- **Yes** - QRZ XML API (paid subscription)
- Callsign lookups
- Logbook read/write

**Strengths:**

- Works anywhere (web-based)
- Huge user base (QRZ.com)
- Callsign database integration
- No installation needed
- Mobile access

**Weaknesses:**

- Requires subscription for full features
- Limited offline capability
- Less feature-rich than desktop apps
- Dependent on internet

**What Propulse Should Learn:**

- Web-based = universal access
- Callsign integration is key
- Cloud sync enables multi-device
- QRZ's user base is massive

---

### 3.5 CloudLog

| Attribute       | Details                              |
| --------------- | ------------------------------------ |
| **Platform**    | Web-based (self-hosted)              |
| **Cost**        | Free (open source)                   |
| **URL**         | https://github.com/magicbug/Cloudlog |
| **Primary Use** | Self-hosted online logging           |

**Key Features:**

- Self-hosted web application
- PHP/MySQL based
- Award tracking
- QSL management
- CAT control integration
- Multi-user support
- API for integrations

**API Availability:**

- **Yes** - REST API for logging
- Used by integrations (WSJT-X, etc.)

**Strengths:**

- Open source
- Self-hosted (data ownership)
- Active development
- Good API
- Multi-user capable

**Weaknesses:**

- Requires server setup
- PHP/MySQL knowledge helpful
- Self-maintenance burden
- No official mobile app

**Data Formats:**

- ADIF
- LoTW
- eQSL
- Club Log
- QRZ

**What Propulse Should Learn:**

- Open source builds community
- API enables ecosystem
- Self-hosting appeals to privacy-conscious
- Multi-user for clubs/contests

---

### 3.6 DXKeeper (DXLab Suite)

| Attribute       | Details                     |
| --------------- | --------------------------- |
| **Platform**    | Windows                     |
| **Cost**        | Free                        |
| **URL**         | https://www.dxlabsuite.com/ |
| **Primary Use** | General logging, DX chasing |

**Key Features:**

- Part of DXLab Suite (7 integrated apps)
- Excellent award tracking
- LoTW integration
- QSL route management
- Propagation integration
- Comprehensive DXCC tracking

**Strengths:**

- Free and feature-rich
- Best DXCC tracking
- Integrated suite approach
- Active developer
- Mature software

**Weaknesses:**

- Windows only
- Dated UI
- Steep learning curve
- Suite complexity

**Data Formats:**

- ADIF
- LoTW
- eQSL
- Club Log

**What Propulse Should Learn:**

- DXCC tracking is a core feature
- Suite integration adds value
- QSL route/manager info saves time
- Free can be feature-rich

---

### 3.7 MacLoggerDX

| Attribute       | Details                                          |
| --------------- | ------------------------------------------------ |
| **Platform**    | macOS only                                       |
| **Cost**        | $95 USD                                          |
| **URL**         | https://www.dogparksoftware.com/MacLoggerDX.html |
| **Primary Use** | Mac-native logging                               |

**Key Features:**

- Native macOS application
- Rig control
- DX cluster integration
- Award tracking
- Propagation tools
- Contest mode
- LoTW/eQSL integration

**Strengths:**

- Only serious Mac option
- Native macOS UI
- All-in-one for Mac
- Active development
- Good support

**Weaknesses:**

- Mac only
- Paid software
- Smaller user community
- Less contest support than N1MM

**Data Formats:**

- ADIF
- LoTW
- eQSL
- Cabrillo

**What Propulse Should Learn:**

- Mac users are underserved
- Native platform UI matters
- Mac users will pay for quality
- Cross-platform gap is real

---

## 4. All-in-One Tools

### 4.1 HamClock

| Attribute    | Details                                         |
| ------------ | ----------------------------------------------- |
| **URL**      | https://www.clearskyinstitute.com/ham/HamClock/ |
| **Platform** | Raspberry Pi, Linux, macOS, Windows, ESP8266    |
| **Cost**     | Free                                            |
| **Status**   | **END OF LIFE: June 2026**                      |

**Key Features:**

- World map with grayline
- Propagation predictions (VOACAP)
- Solar conditions display
- DX cluster feed
- Satellite tracking
- POTA/SOTA spots
- Space weather alerts
- Band condition indicators
- DE/DX location display

**Strengths:**

- Comprehensive "shack clock"
- Runs on Raspberry Pi
- Beautiful visualization
- All-in-one display
- Active development (until EOL)
- ESP8266 version for dedicated display

**Weaknesses:**

- **End of life June 2026**
- Single developer project
- Limited customization
- No logging integration
- Display-only (no TX/control)

**Data Sources Used:**

- SWPC (solar data)
- VOACAP (propagation)
- DX clusters
- N2YO (satellites)
- POTA/SOTA APIs

**What Propulse Should Learn:**

- **Critical opportunity**: HamClock EOL creates market gap
- Shack display concept is valuable
- Combine multiple data sources elegantly
- Map-centric interface works
- Raspberry Pi deployment is popular
- Single-purpose "always on" displays

---

### 4.2 Ham Radio Deluxe Suite

| Attribute    | Details                         |
| ------------ | ------------------------------- |
| **URL**      | https://www.hamradiodeluxe.com/ |
| **Platform** | Windows                         |
| **Cost**     | $99.95 USD                      |

**Suite Components:**

- **Rig Control** - CAT control for radios
- **Logbook** - Full-featured logging
- **DM780** - Digital modes
- **Rotator** - Antenna rotator control
- **Satellite Tracking** - Satellite passes

**Strengths:**

- Truly integrated suite
- One purchase, multiple tools
- Good rig support
- Established product

**Weaknesses:**

- Windows only
- Paid software
- Can be resource-heavy
- Mixed reviews on support

**What Propulse Should Learn:**

- Suite integration is valuable
- Rig control ties everything together
- Digital mode integration is expected
- Bundling creates value

---

### 4.3 Logger32

| Attribute    | Details                   |
| ------------ | ------------------------- |
| **URL**      | https://www.logger32.net/ |
| **Platform** | Windows                   |
| **Cost**     | Free                      |

**Key Features:**

- General-purpose logging
- DX cluster integration
- Band map
- Rig control
- Award tracking
- Propagation display
- QSL management

**Strengths:**

- Free and capable
- Long history
- Active community
- Good documentation

**Weaknesses:**

- Windows only
- Dated interface
- Complex configuration
- Development pace slow

**What Propulse Should Learn:**

- Free tools build user base
- Band map is essential feature
- Cluster integration expected
- Long-term commitment matters

---

## 5. Key Takeaways for Propulse

### 5.1 Market Opportunities

1. **HamClock Replacement (Critical)**
   - HamClock EOL in June 2026 creates immediate opportunity
   - Target Raspberry Pi users with similar functionality
   - Improve on HamClock with better customization and modern UI

2. **Cross-Platform Gap**
   - Most tools are Windows-only
   - Mac and Linux users underserved
   - Web-based approach can address all platforms

3. **Mobile Gap**
   - Few native mobile apps
   - Responsive web app could fill gap
   - PWA approach for offline capability

4. **Modern UI**
   - Many tools have dated interfaces
   - Modern, responsive design differentiates
   - Dark mode is expected

### 5.2 Essential Integrations

**Data Sources (Priority Order):**

1. SWPC - Primary authoritative solar data
2. PSKReporter - Real-time propagation (essential)
3. RBN - CW spot coverage
4. N0NBH/HamQSL - Simple band conditions
5. prop.kc2g.com - Real-time MUF maps
6. DX Clusters - Human-submitted spots
7. VOACAP - Detailed predictions

**Logging Integrations:**

1. ADIF import/export (universal)
2. LoTW upload
3. QRZ.com API
4. Club Log
5. eQSL

### 5.3 Feature Priorities

**Must Have:**

- Real-time band conditions (simple ratings)
- Solar indices display (SFI, K, A)
- PSKReporter/RBN spot integration
- World map with grayline
- Mobile-responsive design
- ADIF import/export

**Should Have:**

- Point-to-point predictions (VOACAP)
- Band opening alerts
- Sporadic E monitoring
- Historical propagation data
- Award tracking (DXCC)

**Nice to Have:**

- Satellite tracking
- POTA/SOTA integration
- Contest calendar
- Antenna modeling
- Rig control integration

### 5.4 Technical Recommendations

**API Usage:**

```
Primary: SWPC JSON APIs (free, reliable, comprehensive)
Secondary: PSKReporter (flexible API)
Fallback: N0NBH XML (simple, ham-focused)
```

**Caching Strategy:**

- Solar indices: 15-minute cache
- Spot data: Real-time (WebSocket if possible)
- Predictions: 1-hour cache
- Historical: 24-hour cache

**Data Formats:**

- Support ADIF for all logging operations
- Use GeoJSON for map data
- JSON for internal APIs
- Consider Cabrillo for contest export

### 5.5 Differentiation Opportunities

1. **Real-time over predictions** - Show actual conditions using PSKReporter/RBN data, not just models

2. **Unified interface** - Combine propagation, spots, logging in one view

3. **Intelligent alerts** - Notify when YOUR target paths are open (personalized)

4. **Historical learning** - Track predictions vs. reality, improve over time

5. **Community features** - Share propagation reports, expedition alerts

6. **Modern architecture** - Web-first, API-driven, works everywhere

---

## Appendix: Quick Reference URLs

### Data Source APIs

| Source        | API Endpoint                                  |
| ------------- | --------------------------------------------- |
| SWPC JSON     | https://services.swpc.noaa.gov/json/          |
| SWPC Text     | https://services.swpc.noaa.gov/text/          |
| N0NBH XML     | https://www.hamqsl.com/solarxml.php           |
| PSKReporter   | https://pskreporter.info/cgi-bin/pskquery5.pl |
| RBN Telnet    | telnet.reversebeacon.net:7000                 |
| VOACAP        | https://www.voacap.com/prediction.html        |
| prop.kc2g.com | https://prop.kc2g.com/                        |
| WSPRnet       | https://wsprnet.org/drupal/wsprnet/spotquery  |

### Logging Software Downloads

| Software         | URL                                              |
| ---------------- | ------------------------------------------------ |
| N1MM Logger+     | https://n1mmwp.hamdocs.com/                      |
| Ham Radio Deluxe | https://www.hamradiodeluxe.com/                  |
| Log4OM           | https://www.log4om.com/                          |
| CloudLog         | https://github.com/magicbug/Cloudlog             |
| DXKeeper         | https://www.dxlabsuite.com/                      |
| MacLoggerDX      | https://www.dogparksoftware.com/MacLoggerDX.html |
| Logger32         | https://www.logger32.net/                        |

---

_Document generated for Propulse development team. Information current as of January 2026._
