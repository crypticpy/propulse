import { describe, expect, it, vi } from "vitest";
import {
  AzimuthalRenderer,
  fitAzimuthalTextureDimensions,
  resolveAzimuthalDayTextureUrls,
  resolveAzimuthalNightTexture,
} from "./AzimuthalRenderer";

describe("AzimuthalRenderer texture policy", () => {
  it("keeps explicit seasonal candidates in fallback order", () => {
    expect(
      resolveAzimuthalDayTextureUrls({
        highRes: true,
        dayTextureUrls: ["seasonal-4k.jpg", "seasonal-local.jpg", "base.jpg"],
      }),
    ).toEqual(["seasonal-4k.jpg", "seasonal-local.jpg", "base.jpg"]);
  });

  it("clamps oversized imagery to the GPU while preserving aspect ratio", () => {
    expect(fitAzimuthalTextureDimensions(8_192, 4_096, 4_096)).toEqual({
      width: 4_096,
      height: 2_048,
    });
    expect(fitAzimuthalTextureDimensions(2_048, 1_024, 4_096)).toEqual({
      width: 2_048,
      height: 1_024,
    });
  });

  it("keeps texture ownership distinct when night imagery falls back", () => {
    const dayTexture = { id: "day" } as WebGLTexture;
    const nightTexture = { id: "night-placeholder" } as WebGLTexture;
    expect(resolveAzimuthalNightTexture(dayTexture, nightTexture, true)).toBe(
      dayTexture,
    );

    const deleteTexture = vi.fn();
    const renderer = new AzimuthalRenderer();
    Object.assign(renderer, {
      gl: {
        deleteTexture,
        deleteBuffer: vi.fn(),
        deleteProgram: vi.fn(),
        getExtension: vi.fn(() => null),
      } as unknown as WebGLRenderingContext,
      dayTexture,
      nightTexture,
    });
    renderer.dispose();
    expect(deleteTexture).toHaveBeenCalledTimes(2);
    expect(deleteTexture).toHaveBeenCalledWith(dayTexture);
    expect(deleteTexture).toHaveBeenCalledWith(nightTexture);
  });

  it("releases the WebGL context when disposing a live renderer", () => {
    const loseContext = vi.fn();
    const deleteProgram = vi.fn();
    const getExtension = vi.fn((name: string) =>
      name === "WEBGL_lose_context" ? { loseContext } : null,
    );
    const renderer = new AzimuthalRenderer();
    Object.assign(renderer, {
      gl: {
        deleteTexture: vi.fn(),
        deleteBuffer: vi.fn(),
        deleteProgram,
        getExtension,
      } as unknown as WebGLRenderingContext,
      program: {} as WebGLProgram,
    });

    renderer.dispose();

    expect(getExtension).toHaveBeenCalledWith("WEBGL_lose_context");
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(deleteProgram).toHaveBeenCalledTimes(1);
    expect(loseContext.mock.invocationCallOrder[0]).toBeGreaterThan(
      deleteProgram.mock.invocationCallOrder[0],
    );

    renderer.dispose();
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("cancels pending image callbacks before disposing the GL context", () => {
    const renderer = new AzimuthalRenderer();
    const image = {
      onload: vi.fn(),
      onerror: vi.fn(),
      src: "/textures/seasonal-4k.jpg",
    };
    const pendingImages = new Set([image]);
    Object.assign(renderer, { pendingImages });

    renderer.dispose();

    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(image.src).toBe("");
    expect(pendingImages.size).toBe(0);
  });
});

/** Per-canvas WebGL mock: a lost context stays lost on that element. */
function installPerCanvasWebGL() {
  const contexts = new WeakMap<HTMLCanvasElement, WebGLRenderingContext>();
  const lost = new WeakMap<HTMLCanvasElement, boolean>();

  const createFakeGL = (canvas: HTMLCanvasElement): WebGLRenderingContext => {
    const loseContext = vi.fn(() => {
      lost.set(canvas, true);
    });
    const isLost = () => lost.get(canvas) === true;
    return {
      canvas,
      VERTEX_SHADER: 0x8b31,
      FRAGMENT_SHADER: 0x8b30,
      COMPILE_STATUS: 0x8b81,
      LINK_STATUS: 0x8b82,
      ARRAY_BUFFER: 0x8892,
      STATIC_DRAW: 0x88e4,
      FLOAT: 5126,
      TEXTURE_2D: 0x0de1,
      RGBA: 6408,
      UNSIGNED_BYTE: 5121,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      LINEAR_MIPMAP_LINEAR: 0x2703,
      LINEAR: 0x2601,
      CLAMP_TO_EDGE: 0x812f,
      MAX_TEXTURE_SIZE: 0x0d33,
      getParameter: vi.fn(() => 2048),
      isContextLost: isLost,
      createShader: vi.fn(() => (isLost() ? null : {})),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn(() => !isLost()),
      getShaderInfoLog: vi.fn(() => ""),
      deleteShader: vi.fn(),
      createProgram: vi.fn(() => (isLost() ? null : {})),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: vi.fn(() => !isLost()),
      getProgramInfoLog: vi.fn(() => ""),
      deleteProgram: vi.fn(),
      getUniformLocation: vi.fn(() => ({})),
      createBuffer: vi.fn(() => ({})),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      getAttribLocation: vi.fn(() => 0),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      createTexture: vi.fn(() => ({})),
      bindTexture: vi.fn(),
      texImage2D: vi.fn(),
      generateMipmap: vi.fn(),
      texParameteri: vi.fn(),
      deleteTexture: vi.fn(),
      deleteBuffer: vi.fn(),
      getExtension: vi.fn((name: string) =>
        name === "WEBGL_lose_context" ? { loseContext } : null,
      ),
    } as unknown as WebGLRenderingContext;
  };

  return vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(function (
      this: HTMLCanvasElement,
      type?: string,
    ): RenderingContext | null {
      if (type !== "webgl") {
        return null;
      }
      const existing = contexts.get(this);
      if (existing) {
        return existing;
      }
      const gl = createFakeGL(this);
      contexts.set(this, gl);
      return gl;
    } as never);
}

describe("AzimuthalRenderer context ownership", () => {
  it("reinitializes on the same host after dispose with a virgin canvas", async () => {
    installPerCanvasWebGL();
    const host = document.createElement("div");
    document.body.appendChild(host);

    const first = new AzimuthalRenderer({ enableNight: false });
    await expect(first.initialize(host)).resolves.toBe(true);
    expect(host.querySelectorAll("canvas")).toHaveLength(1);
    const firstCanvas = host.querySelector("canvas");

    first.dispose();
    expect(host.querySelectorAll("canvas")).toHaveLength(0);

    const second = new AzimuthalRenderer({ enableNight: false });
    await expect(second.initialize(host)).resolves.toBe(true);
    expect(host.querySelectorAll("canvas")).toHaveLength(1);
    expect(host.querySelector("canvas")).not.toBe(firstCanvas);

    second.dispose();
    host.remove();
  });

  it("does not acquire a context after dispose", async () => {
    installPerCanvasWebGL();
    const host = document.createElement("div");
    const renderer = new AzimuthalRenderer();
    renderer.dispose();
    await expect(renderer.initialize(host)).resolves.toBe(false);
    expect(host.querySelectorAll("canvas")).toHaveLength(0);
  });

  it("reports a lost context instead of a shader-compile failure", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement, type?: string): RenderingContext | null {
        if (type !== "webgl") {
          return null;
        }
        return {
          canvas: this,
          isContextLost: () => true,
          createShader: vi.fn(() => null),
        } as unknown as WebGLRenderingContext;
      } as never,
    );
    const onError = vi.fn();
    const host = document.createElement("div");
    const renderer = new AzimuthalRenderer({ onError });
    await expect(renderer.initialize(host)).resolves.toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("WebGL context lost");
    expect(host.querySelectorAll("canvas")).toHaveLength(0);
  });

  it("releases the canvas and context slot when the shader program fails to link", async () => {
    const loseContext = vi.fn();
    const getExtension = vi.fn((name: string) =>
      name === "WEBGL_lose_context" ? { loseContext } : null,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement, type?: string): RenderingContext | null {
        if (type !== "webgl") {
          return null;
        }
        // Shader stages compile fine; only program linking fails, so this
        // exercises the `createShaderProgram` -> null path distinct from the
        // "no context"/"context lost" exits above it.
        return {
          canvas: this,
          isContextLost: () => false,
          createShader: vi.fn(() => ({})),
          shaderSource: vi.fn(),
          compileShader: vi.fn(),
          getShaderParameter: vi.fn(() => true),
          getShaderInfoLog: vi.fn(() => ""),
          deleteShader: vi.fn(),
          createProgram: vi.fn(() => ({})),
          attachShader: vi.fn(),
          linkProgram: vi.fn(),
          getProgramParameter: vi.fn(() => false),
          getProgramInfoLog: vi.fn(() => "mock link failure"),
          deleteProgram: vi.fn(),
          getExtension,
        } as unknown as WebGLRenderingContext;
      } as never,
    );

    const onError = vi.fn();
    const host = document.createElement("div");
    const renderer = new AzimuthalRenderer({ onError });

    await expect(renderer.initialize(host)).resolves.toBe(false);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe(
      "Failed to create shader program",
    );
    // The canvas must not be left orphaned in the DOM...
    expect(host.querySelectorAll("canvas")).toHaveLength(0);
    // ...and the context slot must be released, same as the three
    // neighbouring failure exits (no-context / context-lost / disposed).
    expect(getExtension).toHaveBeenCalledWith("WEBGL_lose_context");
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("rejects a second initialize() call on an already-initialized instance", async () => {
    installPerCanvasWebGL();
    const host = document.createElement("div");
    document.body.appendChild(host);

    const renderer = new AzimuthalRenderer({ enableNight: false });
    await expect(renderer.initialize(host)).resolves.toBe(true);
    expect(host.querySelectorAll("canvas")).toHaveLength(1);
    const firstCanvas = host.querySelector("canvas");

    await expect(renderer.initialize(host)).resolves.toBe(false);
    // No second canvas was created, and the first is still owned/attached.
    expect(host.querySelectorAll("canvas")).toHaveLength(1);
    expect(host.querySelector("canvas")).toBe(firstCanvas);

    renderer.dispose();
    host.remove();
  });

  it("resolves false when dispose() lands during the loadTextures() await", async () => {
    installPerCanvasWebGL();
    const host = document.createElement("div");
    document.body.appendChild(host);

    const renderer = new AzimuthalRenderer({ enableNight: false });
    // initialize() runs synchronously up to `await this.loadTextures()`
    // before returning this pending promise; dispose() below therefore runs
    // before that await's continuation gets a turn on the microtask queue.
    const initPromise = renderer.initialize(host);
    renderer.dispose();

    await expect(initPromise).resolves.toBe(false);
    expect(host.querySelectorAll("canvas")).toHaveLength(0);

    host.remove();
  });
});
