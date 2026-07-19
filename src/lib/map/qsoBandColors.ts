/**
 * Band-to-color mapping for QSO overlays, shared by the 2D flat map
 * (FlatMapView) and the 3D globe (QsoLocationsOverlay3D) so both views
 * render QSOs with identical colors.
 */
export function getQsoBandColor(band: string): string {
  const b = band.toLowerCase().replace(/[^0-9.]/g, "");
  switch (b) {
    case "160":
      return "#ff6688";
    case "80":
      return "#ff8844";
    case "60":
      return "#ff9933";
    case "40":
      return "#ffaa22";
    case "30":
      return "#ffcc00";
    case "20":
      return "#ffdd00";
    case "17":
      return "#ccee22";
    case "15":
      return "#88ee44";
    case "12":
      return "#44dd88";
    case "10":
      return "#44ccff";
    case "6":
      return "#6688ff";
    case "2":
      return "#aa66ff";
    default:
      return "#aa88ff"; // VHF/UHF+
  }
}
