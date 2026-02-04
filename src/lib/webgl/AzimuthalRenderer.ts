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
  uAspect: WebGLUniformLocation | null;
  uMapScale: WebGLUniformLocation | null;
}

export interface AzimuthalRendererOptions {
  /** Use high-resolution textures (default: true) */
  highRes?: boolean;
  /** Enable night texture (default: true) */
  enableNight?: boolean;
  /** Callback when textures are loaded */
  onTextureLoad?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export class AzimuthalRenderer {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private dayTexture: WebGLTexture | null = null;
  private nightTexture: WebGLTexture | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private uniformLocations: UniformLocations | null = null;

  private texturesLoaded = false;
  private dayTextureLoaded = false;
  private nightTextureLoaded = false;
  private nightTextureFailed = false;

  private options: AzimuthalRendererOptions;
  private disposed = false;

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
      uAspect: gl.getUniformLocation(program, "uAspect"),
      uMapScale: gl.getUniformLocation(program, "uMapScale"),
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
    const {gl} = this;
    if (!gl) {
      return;
    }

    const dayUrl = this.options.highRes
      ? DAY_TEXTURE_URL
      : DAY_TEXTURE_URL_SMALL;

    // Create placeholder textures
    this.dayTexture = this.createPlaceholderTexture(gl);
    this.nightTexture = this.createPlaceholderTexture(gl);

    // Load day texture
    const dayImage = new Image();
    dayImage.crossOrigin = "anonymous";

    dayImage.onload = () => {
      if (this.disposed || !this.gl) {
        return;
      }
      this.updateTexture(this.gl, this.dayTexture!, dayImage);
      this.dayTextureLoaded = true;
      this.checkTexturesLoaded();
    };

    dayImage.onerror = () => {
      console.error("Failed to load day texture");
      this.options.onError?.(new Error("Failed to load day texture"));
    };

    dayImage.src = dayUrl;

    // Load night texture if enabled
    if (this.options.enableNight) {
      const nightImage = new Image();
      nightImage.crossOrigin = "anonymous";

      nightImage.onload = () => {
        if (this.disposed || !this.gl) {
          return;
        }
        this.updateTexture(this.gl, this.nightTexture!, nightImage);
        this.nightTextureLoaded = true;
        this.checkTexturesLoaded();
      };

      nightImage.onerror = () => {
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
    image: HTMLImageElement,
  ): void {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    // Use mipmaps for better quality at different zoom levels
    if (this.isPowerOfTwo(image.width) && this.isPowerOfTwo(image.height)) {
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
    if (this.dayTextureLoaded && this.nightTextureLoaded) {
      // If night texture failed, use day texture as fallback
      if (this.nightTextureFailed && this.dayTexture) {
        this.nightTexture = this.dayTexture;
      }
      this.texturesLoaded = true;
      this.options.onTextureLoad?.();
    }
  }

  /**
   * Render the azimuthal projection
   */
  render(config: ShaderConfig): void {
    const {gl} = this;
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

    // Subsolar point for day/night blending
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

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dayTexture);
    gl.uniform1i(u.uDayTexture, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.nightTexture);
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
   * Clean up WebGL resources
   */
  dispose(): void {
    this.disposed = true;

    if (!this.gl) {
      return;
    }

    if (this.dayTexture) {
      this.gl.deleteTexture(this.dayTexture);
    }
    if (this.nightTexture) {
      this.gl.deleteTexture(this.nightTexture);
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
    this.vertexBuffer = null;
    this.uniformLocations = null;
  }
}
