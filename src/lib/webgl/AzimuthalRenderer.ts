/**
 * AzimuthalRenderer - WebGL renderer for azimuthal equidistant map projection
 *
 * Renders a NASA Blue Marble texture projected onto an azimuthal equidistant
 * projection centered on any location. Supports day/night blending with
 * smooth terminator transition.
 */

import {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
  degToRad,
  type ShaderConfig,
} from "./azimuthalShader";
import { getStandardMapCanvas } from "@/lib/utils/standardMap";
import type { ThemeId } from "@/lib/themes";

// Local texture paths (avoids CORS issues with NASA servers)
const DAY_TEXTURE_URL = "/textures/earth-day.jpg";
const NIGHT_TEXTURE_URL = "/textures/earth-night.jpg";

// Same as high-res since we're using local files
const DAY_TEXTURE_URL_SMALL = "/textures/earth-day.jpg";

interface UniformLocations {
  uDayTexture: WebGLUniformLocation | null;
  uNightTexture: WebGLUniformLocation | null;
  uCenter: WebGLUniformLocation | null;
  uZoom: WebGLUniformLocation | null;
  uSubsolar: WebGLUniformLocation | null;
  uShowNight: WebGLUniformLocation | null;
  uNightOpacity: WebGLUniformLocation | null;
  uAspect: WebGLUniformLocation | null;
  uMapScale: WebGLUniformLocation | null;
  uGrayscale: WebGLUniformLocation | null;
}

export interface AzimuthalRendererOptions {
  /** Use high-resolution textures (default: true) */
  highRes?: boolean;
  /** Ordered day-texture candidates; later entries are fallbacks. */
  dayTextureUrls?: string[];
  /** Resolution used for the generated standard-map texture. */
  standardTextureWidth?: number;
  /** Theme palette used by the generated standard-map texture. */
  themeId?: ThemeId;
  /** Enable night texture (default: true) */
  enableNight?: boolean;
  /** Callback when textures are loaded */
  onTextureLoad?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export function resolveAzimuthalDayTextureUrls(
  options: Pick<AzimuthalRendererOptions, "dayTextureUrls" | "highRes">,
): string[] {
  return options.dayTextureUrls?.length
    ? options.dayTextureUrls
    : [options.highRes ? DAY_TEXTURE_URL : DAY_TEXTURE_URL_SMALL];
}

export function fitAzimuthalTextureDimensions(
  width: number,
  height: number,
  maxTextureSize: number,
): { width: number; height: number } {
  if (
    width <= 0 ||
    height <= 0 ||
    (width <= maxTextureSize && height <= maxTextureSize)
  ) {
    return { width, height };
  }
  const scale = Math.min(maxTextureSize / width, maxTextureSize / height);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function resolveAzimuthalNightTexture<T>(
  dayTexture: T | null,
  nightTexture: T | null,
  nightTextureFailed: boolean,
): T | null {
  return nightTextureFailed ? dayTexture : nightTexture;
}

export class AzimuthalRenderer {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private dayTexture: WebGLTexture | null = null;
  private nightTexture: WebGLTexture | null = null;
  private standardTexture: WebGLTexture | null = null;
  private standardNightTexture: WebGLTexture | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private uniformLocations: UniformLocations | null = null;

  private texturesLoaded = false;
  private dayTextureLoaded = false;
  private nightTextureLoaded = false;
  private nightTextureFailed = false;
  private pendingImages = new Set<HTMLImageElement>();

  private options: AzimuthalRendererOptions;
  private disposed = false;
  private mapStyle: "satellite" | "standard" = "satellite";

  constructor(options: AzimuthalRendererOptions = {}) {
    this.options = {
      highRes: true,
      enableNight: true,
      ...options,
    };
  }

  /**
   * Initialize the renderer with a canvas element
   */
  async initialize(canvas: HTMLCanvasElement): Promise<boolean> {
    // Get WebGL context
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });

    if (!gl) {
      this.options.onError?.(new Error("WebGL not supported"));
      return false;
    }

    this.gl = gl;

    // Create shader program
    const program = this.createShaderProgram(gl);
    if (!program) {
      this.options.onError?.(new Error("Failed to create shader program"));
      return false;
    }
    this.program = program;

    // Get uniform locations
    this.uniformLocations = {
      uDayTexture: gl.getUniformLocation(program, "uDayTexture"),
      uNightTexture: gl.getUniformLocation(program, "uNightTexture"),
      uCenter: gl.getUniformLocation(program, "uCenter"),
      uZoom: gl.getUniformLocation(program, "uZoom"),
      uSubsolar: gl.getUniformLocation(program, "uSubsolar"),
      uShowNight: gl.getUniformLocation(program, "uShowNight"),
      uNightOpacity: gl.getUniformLocation(program, "uNightOpacity"),
      uAspect: gl.getUniformLocation(program, "uAspect"),
      uMapScale: gl.getUniformLocation(program, "uMapScale"),
      uGrayscale: gl.getUniformLocation(program, "uGrayscale"),
    };

    // Create vertex buffer for fullscreen quad
    this.createVertexBuffer(gl, program);

    // Load textures
    await this.loadTextures();

    return true;
  }

  /**
   * Create and compile shader program
   */
  private createShaderProgram(gl: WebGLRenderingContext): WebGLProgram | null {
    // Compile vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) {
      return null;
    }

    gl.shaderSource(vertexShader, VERTEX_SHADER);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error(
        "Vertex shader compilation error:",
        gl.getShaderInfoLog(vertexShader),
      );
      gl.deleteShader(vertexShader);
      return null;
    }

    // Compile fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
      gl.deleteShader(vertexShader);
      return null;
    }

    gl.shaderSource(fragmentShader, FRAGMENT_SHADER);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error(
        "Fragment shader compilation error:",
        gl.getShaderInfoLog(fragmentShader),
      );
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }

    // Create program
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program linking error:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }

    // Shaders are now linked into program, can delete
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
  }

  /**
   * Create vertex buffer for fullscreen quad
   */
  private createVertexBuffer(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
  ): void {
    // Fullscreen quad vertices (two triangles)
    const vertices = new Float32Array([
      -1.0,
      -1.0, // Bottom left
      1.0,
      -1.0, // Bottom right
      -1.0,
      1.0, // Top left
      1.0,
      -1.0, // Bottom right
      1.0,
      1.0, // Top right
      -1.0,
      1.0, // Top left
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    this.vertexBuffer = buffer;
  }

  /**
   * Load day and night textures
   */
  private async loadTextures(): Promise<void> {
    const { gl } = this;
    if (!gl) {
      return;
    }

    const dayUrls = resolveAzimuthalDayTextureUrls(this.options);

    // Create placeholder textures
    this.dayTexture = this.createPlaceholderTexture(gl);
    this.nightTexture = this.createPlaceholderTexture(gl);
    this.standardTexture = this.createPlaceholderTexture(gl);
    this.standardNightTexture = this.createPlaceholderTexture(gl);

    // Build lightweight standard texture immediately (no async network request)
    try {
      const gpuMaxTextureSize =
        (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) || 2048;
      const requestedStandardWidth = this.options.standardTextureWidth ?? 2048;
      const standardTextureWidth = Math.max(
        1,
        Math.min(requestedStandardWidth, gpuMaxTextureSize),
      );
      const standardCanvas = getStandardMapCanvas(
        standardTextureWidth,
        Math.max(1, Math.floor(standardTextureWidth / 2)),
        this.options.themeId ?? "light",
      );
      this.updateTexture(gl, this.standardTexture, standardCanvas);

      const darkCanvas = document.createElement("canvas");
      darkCanvas.width = standardCanvas.width;
      darkCanvas.height = standardCanvas.height;
      const darkCtx = darkCanvas.getContext("2d");
      if (darkCtx) {
        darkCtx.drawImage(standardCanvas, 0, 0);
        // Darken for "night" using multiply so the style stays flat/vector-like.
        darkCtx.globalCompositeOperation = "multiply";
        darkCtx.fillStyle = "rgb(70, 75, 85)";
        darkCtx.fillRect(0, 0, darkCanvas.width, darkCanvas.height);
        this.updateTexture(gl, this.standardNightTexture, darkCanvas);
      }
    } catch (error) {
      console.warn("Failed to build standard map texture:", error);
    }

    // Load day texture
    const dayImage = new Image();
    this.pendingImages.add(dayImage);
    dayImage.crossOrigin = "anonymous";

    dayImage.onload = () => {
      this.pendingImages.delete(dayImage);
      if (this.disposed || !this.gl) {
        return;
      }
      this.updateTexture(this.gl, this.dayTexture!, dayImage);
      this.dayTextureLoaded = true;
      this.checkTexturesLoaded();
    };

    let dayUrlIndex = 0;
    dayImage.onerror = () => {
      if (this.disposed) return;
      dayUrlIndex += 1;
      if (dayUrlIndex < dayUrls.length) {
        dayImage.src = dayUrls[dayUrlIndex];
        return;
      }
      this.pendingImages.delete(dayImage);
      console.error("Failed to load day texture");
      this.dayTextureLoaded = true;
      this.checkTexturesLoaded();
      this.options.onError?.(new Error("Failed to load day texture"));
    };

    dayImage.src = dayUrls[dayUrlIndex];

    // Load night texture if enabled
    if (this.options.enableNight) {
      const nightImage = new Image();
      this.pendingImages.add(nightImage);
      nightImage.crossOrigin = "anonymous";

      nightImage.onload = () => {
        this.pendingImages.delete(nightImage);
        if (this.disposed || !this.gl) {
          return;
        }
        this.updateTexture(this.gl, this.nightTexture!, nightImage);
        this.nightTextureLoaded = true;
        this.checkTexturesLoaded();
      };

      nightImage.onerror = () => {
        this.pendingImages.delete(nightImage);
        if (this.disposed) return;
        console.warn("Failed to load night texture, will use day texture");
        this.nightTextureLoaded = true;
        this.nightTextureFailed = true;
        this.checkTexturesLoaded();
      };

      nightImage.src = NIGHT_TEXTURE_URL;
    } else {
      this.nightTextureLoaded = true;
    }
  }

  /**
   * Create a placeholder texture (1x1 blue pixel)
   */
  private createPlaceholderTexture(gl: WebGLRenderingContext): WebGLTexture {
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // 1x1 dark blue placeholder
    const pixel = new Uint8Array([20, 40, 80, 255]);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel,
    );

    return texture;
  }

  /**
   * Update texture with loaded image
   */
  private updateTexture(
    gl: WebGLRenderingContext,
    texture: WebGLTexture,
    source: TexImageSource,
  ): void {
    const sourceWidth =
      source instanceof HTMLImageElement
        ? source.naturalWidth || source.width
        : "width" in source
          ? (source as { width: number }).width
          : 0;
    const sourceHeight =
      source instanceof HTMLImageElement
        ? source.naturalHeight || source.height
        : "height" in source
          ? (source as { height: number }).height
          : 0;

    const maxTextureSize =
      (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) ||
      Math.max(sourceWidth, sourceHeight, 1);
    let uploadSource = source;
    let uploadWidth = sourceWidth;
    let uploadHeight = sourceHeight;
    let downscaledCanvas: HTMLCanvasElement | null = null;
    if (
      sourceWidth > 0 &&
      sourceHeight > 0 &&
      (sourceWidth > maxTextureSize || sourceHeight > maxTextureSize)
    ) {
      const fitted = fitAzimuthalTextureDimensions(
        sourceWidth,
        sourceHeight,
        maxTextureSize,
      );
      downscaledCanvas = document.createElement("canvas");
      downscaledCanvas.width = fitted.width;
      downscaledCanvas.height = fitted.height;
      const context = downscaledCanvas.getContext("2d");
      if (context) {
        context.drawImage(
          source as CanvasImageSource,
          0,
          0,
          downscaledCanvas.width,
          downscaledCanvas.height,
        );
        uploadSource = downscaledCanvas;
        uploadWidth = downscaledCanvas.width;
        uploadHeight = downscaledCanvas.height;
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      uploadSource,
    );

    // Use mipmaps for better quality at different zoom levels.
    if (
      this.isPowerOfTwo(uploadWidth) &&
      this.isPowerOfTwo(uploadHeight) &&
      uploadWidth > 0 &&
      uploadHeight > 0
    ) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR_MIPMAP_LINEAR,
      );
    } else {
      // For non-power-of-two textures
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (downscaledCanvas) {
      downscaledCanvas.width = 1;
      downscaledCanvas.height = 1;
    }
  }

  /**
   * Check if a value is a power of two
   */
  private isPowerOfTwo(value: number): boolean {
    return (value & (value - 1)) === 0;
  }

  /**
   * Check if all textures are loaded
   */
  private checkTexturesLoaded(): void {
    if (this.disposed) return;
    if (this.dayTextureLoaded && this.nightTextureLoaded) {
      this.texturesLoaded = true;
      this.options.onTextureLoad?.();
    }
  }

  /**
   * Render the azimuthal projection
   */
  render(config: ShaderConfig): void {
    const { gl } = this;
    if (!gl || !this.program || !this.uniformLocations) {
      return;
    }

    // Clear and set viewport
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.039, 0.039, 0.102, 1.0); // #0a0a1a
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Use our shader program
    gl.useProgram(this.program);

    // Set uniforms
    const u = this.uniformLocations;

    // Center point in radians
    gl.uniform2f(
      u.uCenter,
      degToRad(config.centerLat),
      degToRad(config.centerLon),
    );

    // Zoom
    gl.uniform1f(u.uZoom, config.zoom);
    gl.uniform1f(
      u.uNightOpacity,
      Math.max(0, Math.min(1, config.nightOpacity ?? 1)),
    );

    // Subsolar point for day/night blending
    const useStandard =
      this.mapStyle === "standard" && this.standardTexture !== null;
    if (
      config.showNight &&
      config.subsolarLat !== undefined &&
      config.subsolarLon !== undefined
    ) {
      gl.uniform2f(
        u.uSubsolar,
        degToRad(config.subsolarLat),
        degToRad(config.subsolarLon),
      );
      gl.uniform1i(u.uShowNight, 1);
    } else {
      gl.uniform1i(u.uShowNight, 0);
    }

    // Aspect ratio
    gl.uniform1f(u.uAspect, gl.canvas.width / gl.canvas.height);

    // Map scale (RADIUS/CENTER ratio to match 2D overlay)
    // Default: 260/300 ≈ 0.8667 for 40px margin on 600px canvas
    gl.uniform1f(u.uMapScale, config.mapScale ?? 260 / 300);

    // Grayscale mode for standard map style
    gl.uniform1i(u.uGrayscale, 0);

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(
      gl.TEXTURE_2D,
      useStandard ? this.standardTexture : this.dayTexture,
    );
    gl.uniform1i(u.uDayTexture, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(
      gl.TEXTURE_2D,
      useStandard
        ? this.standardNightTexture ?? this.standardTexture
        : resolveAzimuthalNightTexture(
            this.dayTexture,
            this.nightTexture,
            this.nightTextureFailed,
          ),
    );
    gl.uniform1i(u.uNightTexture, 1);

    // Draw fullscreen quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * Resize the canvas
   */
  resize(width: number, height: number): void {
    if (!this.gl) {
      return;
    }

    const canvas = this.gl.canvas as HTMLCanvasElement;
    canvas.width = width;
    canvas.height = height;
  }

  /**
   * Check if textures are loaded
   */
  isReady(): boolean {
    return this.texturesLoaded;
  }

  /**
   * Set map style (satellite vs standard)
   */
  setMapStyle(value: "satellite" | "standard"): void {
    this.mapStyle = value;
  }

  /**
   * Back-compat: historically used to toggle standard map style.
   */
  setGrayscale(value: boolean): void {
    this.mapStyle = value ? "standard" : "satellite";
  }

  /**
   * Clean up WebGL resources
   */
  dispose(): void {
    this.disposed = true;

    for (const image of this.pendingImages) {
      image.onload = null;
      image.onerror = null;
      image.src = "";
    }
    this.pendingImages.clear();

    if (!this.gl) {
      return;
    }

    const textures = new Set(
      [
        this.dayTexture,
        this.nightTexture,
        this.standardTexture,
        this.standardNightTexture,
      ].filter((texture): texture is WebGLTexture => texture !== null),
    );
    for (const texture of textures) {
      this.gl.deleteTexture(texture);
    }
    if (this.vertexBuffer) {
      this.gl.deleteBuffer(this.vertexBuffer);
    }
    if (this.program) {
      this.gl.deleteProgram(this.program);
    }

    this.gl = null;
    this.program = null;
    this.dayTexture = null;
    this.nightTexture = null;
    this.standardTexture = null;
    this.standardNightTexture = null;
    this.vertexBuffer = null;
    this.uniformLocations = null;
  }
}
