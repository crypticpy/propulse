import { estimateMUF, getMUFColor } from "@/lib/api/muf";

/** Cache the coarse MUF field for one minute; keep its native 10-degree cells. */
export class FlatMufRaster {
  private canvas: HTMLCanvasElement | null = null;
  private colorsKey = "";
  private rasterKey = "";
  private colors: string[] = [];

  get(sfi: number, date: Date, width: number, height: number) {
    const minute = Math.floor(date.getTime() / 60_000);
    const colorsKey = `${sfi}:${minute}`;
    if (colorsKey !== this.colorsKey) {
      const sampleTime = new Date(minute * 60_000);
      this.colors = [];
      for (let lat = 85; lat > -90; lat -= 10) {
        for (let lon = -175; lon < 180; lon += 10) {
          this.colors.push(
            getMUFColor(estimateMUF(lat, lon, sfi, sampleTime)).color,
          );
        }
      }
      this.colorsKey = colorsKey;
    }
    this.canvas ??= document.createElement("canvas");
    const rasterKey = `${colorsKey}:${width}:${height}`;
    if (rasterKey !== this.rasterKey) {
      this.canvas.width = width;
      this.canvas.height = height;
      const ctx = this.canvas.getContext("2d");
      if (!ctx) return null;
      const cellWidth = width / 36;
      const cellHeight = height / 18;
      this.colors.forEach((color, index) => {
        ctx.fillStyle = color;
        ctx.fillRect(
          (index % 36) * cellWidth,
          Math.floor(index / 36) * cellHeight,
          cellWidth + 1,
          cellHeight + 1,
        );
      });
      this.rasterKey = rasterKey;
    }
    return this.canvas;
  }
}
