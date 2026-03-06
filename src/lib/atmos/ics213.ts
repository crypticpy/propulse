/**
 * ICS-213 General Message generator
 * Follows FEMA ICS-213 format for plain text and HTML export
 */
import type { ICS213Message } from "@/types/emcomm";

/** Format an ISO-8601 string for display (date + time) */
function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/** Format ISO-8601 to date only */
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Format ISO-8601 to time only */
function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/**
 * Generate ICS-213 as plain text (for radio transmission or text export)
 */
export function generateICS213Text(msg: ICS213Message): string {
  const lines: string[] = [
    "=".repeat(60),
    "ICS-213  GENERAL MESSAGE",
    "=".repeat(60),
    "",
    `1. Incident Name:   ${msg.incidentName}`,
    `2. To:              ${msg.to}`,
    `3. To Position:     ${msg.toPosition}`,
    `4. From:            ${msg.from}`,
    `5. From Position:   ${msg.fromPosition}`,
    `6. Subject:         ${msg.subject}`,
    `7. Date:            ${fmtDate(msg.dateTime)}`,
    `8. Time:            ${fmtTime(msg.dateTime)}`,
    `9. Priority:        ${msg.priority}`,
    "",
    "-".repeat(60),
    "10. MESSAGE:",
    "-".repeat(60),
    "",
    msg.message,
    "",
    "-".repeat(60),
    "",
    `11. Approved By:     ${msg.approved}`,
    `12. Position:        ${msg.approvedPosition}`,
    "",
  ];

  if (msg.replyMessage) {
    lines.push(
      "-".repeat(60),
      "REPLY:",
      "-".repeat(60),
      "",
      msg.replyMessage,
      "",
    );
    if (msg.replyDateTime) {
      lines.push(`Reply Date/Time:  ${fmtDateTime(msg.replyDateTime)}`);
    }
    lines.push("");
  }

  lines.push("=".repeat(60));
  lines.push("END ICS-213");
  lines.push("=".repeat(60));

  return lines.join("\n");
}

/**
 * Generate ICS-213 as printable HTML
 */
export function generateICS213Html(msg: ICS213Message): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const messageHtml = esc(msg.message).replace(/\n/g, "<br/>");
  const replyHtml = msg.replyMessage
    ? esc(msg.replyMessage).replace(/\n/g, "<br/>")
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>ICS-213 General Message</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; margin: 1in; color: #000; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: #e8e8e8; font-weight: bold; width: 25%; }
  h1 { text-align: center; font-size: 14pt; margin-bottom: 2px; }
  h2 { text-align: center; font-size: 11pt; font-weight: normal; margin-top: 0; margin-bottom: 12px; }
  .priority { font-weight: bold; text-transform: uppercase; }
  .msg-body { min-height: 120px; white-space: pre-wrap; }
  .reply-body { min-height: 80px; white-space: pre-wrap; }
  @media print { body { margin: 0.5in; } }
</style>
</head>
<body>
<h1>GENERAL MESSAGE (ICS 213)</h1>
<h2>${esc(msg.incidentName)}</h2>

<table>
  <tr>
    <th>1. Incident Name</th>
    <td colspan="3">${esc(msg.incidentName)}</td>
  </tr>
  <tr>
    <th>2. To</th>
    <td>${esc(msg.to)}</td>
    <th>3. Position</th>
    <td>${esc(msg.toPosition)}</td>
  </tr>
  <tr>
    <th>4. From</th>
    <td>${esc(msg.from)}</td>
    <th>5. Position</th>
    <td>${esc(msg.fromPosition)}</td>
  </tr>
  <tr>
    <th>6. Subject</th>
    <td colspan="3">${esc(msg.subject)}</td>
  </tr>
  <tr>
    <th>7. Date/Time</th>
    <td>${esc(fmtDateTime(msg.dateTime))}</td>
    <th>8. Priority</th>
    <td class="priority">${esc(msg.priority)}</td>
  </tr>
</table>

<table style="margin-top: 8px;">
  <tr>
    <th colspan="4">9. Message</th>
  </tr>
  <tr>
    <td colspan="4" class="msg-body">${messageHtml}</td>
  </tr>
  <tr>
    <th>10. Approved By</th>
    <td>${esc(msg.approved)}</td>
    <th>Position</th>
    <td>${esc(msg.approvedPosition)}</td>
  </tr>
</table>

<table style="margin-top: 8px;">
  <tr>
    <th colspan="4">11. Reply</th>
  </tr>
  <tr>
    <td colspan="4" class="reply-body">${replyHtml || "&nbsp;"}</td>
  </tr>
  ${
    msg.replyDateTime
      ? `<tr><th>Reply Date/Time</th><td colspan="3">${esc(fmtDateTime(msg.replyDateTime))}</td></tr>`
      : ""
  }
</table>

</body>
</html>`;
}
