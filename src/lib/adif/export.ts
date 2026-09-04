/**
 * ADIF 3.1.4 Export
 *
 * Generates standards-compliant ADIF output from LogEntry arrays.
 * Reference: https://adif.org/314/ADIF_314.htm
 */

import type { LogEntry } from "@/lib/db/types";
import type { ADIFExportOptions } from "./types";
import type { QSOFilters } from "@/types/qso";

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
    if (entry.chainId) {
      fields.push(field("APP_PROPULSE_CHAIN_ID", entry.chainId));
    }
    if (entry.radioId) {
      fields.push(field("APP_PROPULSE_RADIO_ID", entry.radioId));
    }
    if (entry.antennaId) {
      fields.push(field("APP_PROPULSE_ANTENNA_ID", entry.antennaId));
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

// ── Activation Export ──────────────────────────────────────────────────────

/**
 * Generate a filtered ADIF export for a POTA or SOTA activation.
 *
 * Filters entries to only those matching the activation (mySig + mySigInfo),
 * then adds the appropriate activation-specific ADIF fields:
 * - POTA: MY_POTA_REF, MY_SIG="POTA", MY_SIG_INFO=ref
 * - SOTA: MY_SOTA_REF, MY_SIG="SOTA", MY_SIG_INFO=ref
 *
 * Also adds SIG/SIG_INFO if the contacted station has a park/summit ref.
 *
 * @param entries - Array of all LogEntry objects (will be filtered)
 * @param activationType - "pota" or "sota"
 * @param ref - The activation reference (e.g., "K-1234" or "W4C/CM-001")
 * @returns Complete ADIF file content as a string
 */
export function exportActivationADIF(
  entries: LogEntry[],
  activationType: "pota" | "sota",
  ref: string,
): string {
  const sigKey = activationType === "pota" ? "POTA" : "SOTA";

  // Filter to only entries matching this activation
  const activationEntries = entries.filter(
    (e) => e.mySig === sigKey && e.mySigInfo === ref,
  );

  const lines: string[] = [];

  // ── Header ──
  lines.push(`${sigKey} Activation Export from Propulse — ${ref}`);
  lines.push(field("ADIF_VER", "3.1.4"));
  lines.push(field("CREATED_TIMESTAMP", adifTimestamp(new Date())));
  lines.push(field("PROGRAMID", "Propulse"));
  lines.push(field("PROGRAMVERSION", "0.14.0"));
  lines.push("<EOH>");
  lines.push("");

  // ── Records ──
  for (const entry of activationEntries) {
    const fields: string[] = [];

    // Required fields
    fields.push(field("CALL", entry.callsign));
    fields.push(field("QSO_DATE", isoToAdifDate(entry.date)));
    fields.push(field("TIME_ON", timeToAdif(entry.timeOn)));

    if (entry.timeOff) {
      fields.push(field("TIME_OFF", timeToAdif(entry.timeOff)));
    }

    if (entry.band) {
      fields.push(field("BAND", entry.band));
    }
    if (entry.mode) {
      fields.push(field("MODE", entry.mode.toUpperCase()));
    }

    if (entry.frequency > 0) {
      fields.push(field("FREQ", kHzToMHz(entry.frequency)));
    }

    if (entry.rstSent) {
      fields.push(field("RST_SENT", entry.rstSent));
    }
    if (entry.rstRcvd) {
      fields.push(field("RST_RCVD", entry.rstRcvd));
    }

    if (entry.grid) {
      fields.push(field("GRIDSQUARE", entry.grid.toUpperCase()));
    }
    if (entry.name) {
      fields.push(field("NAME", entry.name));
    }
    if (entry.qth) {
      fields.push(field("QTH", entry.qth));
    }

    if (entry.notes) {
      fields.push(field("COMMENT", entry.notes));
    }

    if (entry.txPower != null) {
      fields.push(field("TX_PWR", String(entry.txPower)));
    }

    // Station info
    if (entry.myGrid) {
      fields.push(field("MY_GRIDSQUARE", entry.myGrid.toUpperCase()));
    }
    if (entry.stationCallsign) {
      fields.push(
        field("STATION_CALLSIGN", entry.stationCallsign.toUpperCase()),
      );
    }
    if (entry.operatorCallsign) {
      fields.push(field("OPERATOR", entry.operatorCallsign.toUpperCase()));
    }

    // Extended fields
    if (entry.dxcc) {
      fields.push(field("DXCC", String(entry.dxcc)));
    }
    if (entry.country) {
      fields.push(field("COUNTRY", entry.country));
    }

    // ── Activation-specific fields ──

    // My activation reference
    fields.push(field("MY_SIG", sigKey));
    fields.push(field("MY_SIG_INFO", ref));

    // Program-specific reference field
    if (activationType === "pota") {
      fields.push(field("MY_POTA_REF", ref));
    } else {
      fields.push(field("MY_SOTA_REF", ref));
    }

    // Their activation reference (if the contacted station also has one)
    if (entry.sig) {
      fields.push(field("SIG", entry.sig));
    }
    if (entry.sigInfo) {
      fields.push(field("SIG_INFO", entry.sigInfo));
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

// ── Filtered Export ────────────────────────────────────────────────────────

/**
 * Apply QSO filters to an array of log entries.
 * Mirrors the filter logic in qsoStore.
 */
function applyFilters(entries: LogEntry[], filters: QSOFilters): LogEntry[] {
  let result = entries;

  if (filters.search) {
    const term = filters.search.toUpperCase().trim();
    result = result.filter(
      (e) =>
        e.callsign.toUpperCase().includes(term) ||
        e.name?.toUpperCase().includes(term) ||
        e.qth?.toUpperCase().includes(term) ||
        e.notes?.toUpperCase().includes(term) ||
        e.grid?.toUpperCase().includes(term),
    );
  }

  if (filters.band) {
    result = result.filter((e) => e.band === filters.band);
  }

  if (filters.mode) {
    result = result.filter((e) => e.mode === filters.mode);
  }

  if (filters.dateFrom) {
    const from = filters.dateFrom;
    result = result.filter((e) => e.date >= from);
  }

  if (filters.dateTo) {
    const to = filters.dateTo;
    result = result.filter((e) => e.date <= to);
  }

  if (filters.mySig) {
    result = result.filter((e) => e.mySig === filters.mySig);
  }

  if (filters.contestId) {
    result = result.filter((e) => e.contestId === filters.contestId);
  }

  if (filters.confirmed === true) {
    result = result.filter(
      (e) => e.lotw === true || e.eqsl === true || e.qslRcvd === "Y",
    );
  } else if (filters.confirmed === false) {
    result = result.filter((e) => !e.lotw && !e.eqsl && e.qslRcvd !== "Y");
  }

  if (filters.dupe === true) {
    const seen = new Map<string, boolean>();
    const dupeKeys = new Set<string>();
    for (const e of result) {
      const key = `${e.callsign}|${e.band}|${e.mode}|${e.date}`;
      if (seen.has(key)) dupeKeys.add(key);
      seen.set(key, true);
    }
    result = result.filter((e) =>
      dupeKeys.has(`${e.callsign}|${e.band}|${e.mode}|${e.date}`),
    );
  } else if (filters.dupe === false) {
    const seen = new Set<string>();
    result = result.filter((e) => {
      const key = `${e.callsign}|${e.band}|${e.mode}|${e.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return result;
}

/**
 * Generate an ADIF export from entries, filtered by the provided QSOFilters.
 *
 * Applies the same filter logic as the log viewer, then generates ADIF
 * from the matching entries.
 *
 * @param entries - Full array of LogEntry objects (unfiltered)
 * @param filters - QSOFilters to apply before export
 * @param options - Optional ADIF export configuration
 * @returns Complete ADIF file content as a string
 */
export function exportFilteredADIF(
  entries: LogEntry[],
  filters: QSOFilters,
  options?: ADIFExportOptions,
): string {
  const filtered = applyFilters(entries, filters);
  return exportADIF(filtered, options);
}
