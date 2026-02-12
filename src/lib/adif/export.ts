/**
 * ADIF 3.1.4 Export
 *
 * Generates standards-compliant ADIF output from LogEntry arrays.
 * Reference: https://adif.org/314/ADIF_314.htm
 */

import type { LogEntry } from "@/lib/db/types";
import type { ADIFExportOptions } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Format an ADIF field tag: <NAME:LENGTH>VALUE */
function field(name: string, value: string): string {
  return `<${name}:${value.length}>${value}`;
}

/** Convert ISO date (YYYY-MM-DD) to ADIF date (YYYYMMDD) */
function isoToAdifDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/** Convert HH:MM to ADIF time (HHMM) */
function timeToAdif(time: string): string {
  return time.replace(":", "");
}

/** Convert frequency in kHz to MHz string (6 decimal places) */
function kHzToMHz(kHz: number): string {
  return (kHz / 1000).toFixed(6);
}

/** Format a UTC timestamp as ADIF timestamp (YYYYMMDDHHMMSS) */
function adifTimestamp(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}${s}`;
}

// ── Main Export ─────────────────────────────────────────────────────────────

/**
 * Generate an ADIF 3.1.4 compliant string from log entries.
 *
 * @param entries - Array of LogEntry objects to export
 * @param options - Optional export configuration
 * @returns Complete ADIF file content as a string
 */
export function exportADIF(
  entries: LogEntry[],
  options: ADIFExportOptions = {},
): string {
  const lines: string[] = [];

  // ── Header ──
  lines.push("ADIF Export from Propulse");
  lines.push(field("ADIF_VER", "3.1.4"));
  lines.push(field("CREATED_TIMESTAMP", adifTimestamp(new Date())));
  lines.push(field("PROGRAMID", "Propulse"));
  lines.push(field("PROGRAMVERSION", "0.14.0"));
  lines.push("<EOH>");
  lines.push("");

  // ── Records ──
  for (const entry of entries) {
    const fields: string[] = [];

    // Required fields
    fields.push(field("CALL", entry.callsign));
    fields.push(field("QSO_DATE", isoToAdifDate(entry.date)));
    fields.push(field("TIME_ON", timeToAdif(entry.timeOn)));

    // Time off
    if (entry.timeOff) {
      fields.push(field("TIME_OFF", timeToAdif(entry.timeOff)));
    }

    // Band and mode
    if (entry.band) {
      fields.push(field("BAND", entry.band));
    }
    if (entry.mode) {
      fields.push(field("MODE", entry.mode.toUpperCase()));
    }

    // Frequency in MHz
    if (entry.frequency > 0) {
      fields.push(field("FREQ", kHzToMHz(entry.frequency)));
    }

    // RST reports
    if (entry.rstSent) {
      fields.push(field("RST_SENT", entry.rstSent));
    }
    if (entry.rstRcvd) {
      fields.push(field("RST_RCVD", entry.rstRcvd));
    }

    // Location
    if (entry.grid) {
      fields.push(field("GRIDSQUARE", entry.grid.toUpperCase()));
    }
    if (entry.name) {
      fields.push(field("NAME", entry.name));
    }
    if (entry.qth) {
      fields.push(field("QTH", entry.qth));
    }

    // Notes
    if (entry.notes) {
      fields.push(field("COMMENT", entry.notes));
    }

    // Power
    if (entry.txPower != null) {
      fields.push(field("TX_PWR", String(entry.txPower)));
    }

    // QSL status
    if (entry.qslSent) {
      fields.push(field("QSL_SENT", entry.qslSent));
    }
    if (entry.qslRcvd) {
      fields.push(field("QSL_RCVD", entry.qslRcvd));
    }

    // LoTW — string field takes precedence over boolean
    if (entry.lotwQslSent) {
      fields.push(field("LOTW_QSL_SENT", entry.lotwQslSent));
    } else if (entry.lotw !== undefined) {
      fields.push(field("LOTW_QSL_SENT", entry.lotw ? "Y" : "N"));
    }
    if (entry.lotwQslRcvd) {
      fields.push(field("LOTW_QSL_RCVD", entry.lotwQslRcvd));
    }

    // eQSL — boolean maps to SENT tag
    if (entry.eqsl !== undefined) {
      fields.push(field("EQSL_QSL_SENT", entry.eqsl ? "Y" : "N"));
    }

    // Extended fields
    if (options.includeExtended !== false) {
      if (entry.dxcc) {
        fields.push(field("DXCC", String(entry.dxcc)));
      }
      if (entry.country) {
        fields.push(field("COUNTRY", entry.country));
      }
      if (entry.cqZone) {
        fields.push(field("CQ_ZONE", String(entry.cqZone)));
      }
      if (entry.ituZone) {
        fields.push(field("ITU_ZONE", String(entry.ituZone)));
      }
      if (entry.continent) {
        fields.push(field("CONT", entry.continent));
      }
    }

    // Propagation
    if (entry.propMode) {
      fields.push(field("PROP_MODE", entry.propMode));
    }
    if (entry.satName) {
      fields.push(field("SAT_NAME", entry.satName));
    }
    if (entry.satMode) {
      fields.push(field("SAT_MODE", entry.satMode));
    }

    // Station info
    if (entry.myGrid) {
      fields.push(field("MY_GRIDSQUARE", entry.myGrid.toUpperCase()));
    }
    if (entry.myRig) {
      fields.push(field("MY_RIG", entry.myRig));
    }
    if (entry.myAntenna) {
      fields.push(field("MY_ANTENNA", entry.myAntenna));
    }

    // Station callsign
    if (
      options.includeStationCallsign &&
      (entry.stationCallsign || options.stationCallsign)
    ) {
      fields.push(
        field(
          "STATION_CALLSIGN",
          (
            entry.stationCallsign ||
            options.stationCallsign ||
            ""
          ).toUpperCase(),
        ),
      );
    }
    if (entry.operatorCallsign) {
      fields.push(field("OPERATOR", entry.operatorCallsign.toUpperCase()));
    }

    // Activation fields
    if (options.includeActivation !== false) {
      if (entry.mySig) {
        fields.push(field("MY_SIG", entry.mySig));
      }
      if (entry.mySigInfo) {
        fields.push(field("MY_SIG_INFO", entry.mySigInfo));
      }
      if (entry.sig) {
        fields.push(field("SIG", entry.sig));
      }
      if (entry.sigInfo) {
        fields.push(field("SIG_INFO", entry.sigInfo));
      }
    }

    // Contest fields
    if (options.includeContest !== false) {
      if (entry.contestId) {
        fields.push(field("CONTEST_ID", entry.contestId));
      }
      if (entry.stx) {
        fields.push(field("STX", entry.stx));
      }
      if (entry.srx) {
        fields.push(field("SRX", entry.srx));
      }
      if (entry.stxString) {
        fields.push(field("STX_STRING", entry.stxString));
      }
      if (entry.srxString) {
        fields.push(field("SRX_STRING", entry.srxString));
      }
    }

    // ClubLog / QRZ.com status
    if (entry.clublogStatus) {
      fields.push(field("CLUBLOG_QSO_UPLOAD_STATUS", entry.clublogStatus));
    }
    if (entry.qrzcomStatus) {
      fields.push(field("QRZCOM_QSO_UPLOAD_STATUS", entry.qrzcomStatus));
    }

    // My grid from options (fallback)
    if (!entry.myGrid && options.myGrid) {
      fields.push(field("MY_GRIDSQUARE", options.myGrid.toUpperCase()));
    }

    lines.push(fields.join(" ") + " <EOR>");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * RFC 4180-compliant CSV cell escaping.
 * Wraps in double quotes if the value contains commas, double quotes, or newlines.
 */
function csvEscape(val: string): string {
  if (val.includes('"') || val.includes(",") || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

/**
 * Export entries as a simple CSV string.
 *
 * @param entries - Array of LogEntry objects
 * @returns CSV content string
 */
export function exportCSV(entries: LogEntry[]): string {
  const headers = [
    "Date",
    "Time",
    "Callsign",
    "Band",
    "Mode",
    "Frequency (kHz)",
    "RST Sent",
    "RST Rcvd",
    "Grid",
    "Name",
    "QTH",
    "Country",
    "DXCC",
    "Notes",
    "TX Power",
    "LoTW",
    "eQSL",
  ];

  const rows = entries.map((e) => [
    e.date,
    e.timeOn,
    e.callsign,
    e.band,
    e.mode,
    String(e.frequency),
    e.rstSent ?? "",
    e.rstRcvd ?? "",
    e.grid ?? "",
    e.name ?? "",
    e.qth ?? "",
    e.country ?? "",
    e.dxcc ? String(e.dxcc) : "",
    e.notes ?? "",
    e.txPower != null ? String(e.txPower) : "",
    e.lotw ? "Y" : "N",
    e.eqsl ? "Y" : "N",
  ]);

  const csvLines = [
    headers.join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ];

  return csvLines.join("\n");
}
