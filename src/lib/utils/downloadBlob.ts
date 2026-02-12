/**
 * Trigger a file download in the browser from in-memory content.
 *
 * Creates a temporary object URL, clicks a hidden anchor to initiate the
 * download, and cleans up immediately afterward.
 *
 * @param content  - The string content to download
 * @param filename - Suggested filename for the download
 * @param mimeType - MIME type for the Blob (e.g. "text/plain", "text/csv")
 */
export function downloadBlob(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
