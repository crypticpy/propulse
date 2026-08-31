/**
 * GLSL Shaders for Azimuthal Equidistant Projection
 *
 * Projects a NASA Blue Marble equirectangular texture onto an azimuthal
 * equidistant projection centered on any location. Uses GPU acceleration
 * for real-time rendering.
 */

/**
 * Vertex shader - simple passthrough for a fullscreen quad
 */
export const VERTEX_SHADER = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    // Convert position to UV coordinates (0 to 1)
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

/**
 * Fragment shader - implements inverse azimuthal equidistant projection
 *
 * For each pixel:
 * 1. Calculate distance from center (rho)
 * 2. Calculate angular distance (c = rho * PI for full hemisphere)
 * 3. Apply inverse projection formulas to get lat/lon
 * 4. Sample texture at those coordinates
 */
export const FRAGMENT_SHADER = `
  precision highp float;

  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform vec2 uCenter;         // centerLat, centerLon in radians
  uniform float uZoom;          // Zoom factor (1.0 = normal)
  uniform vec2 uSubsolar;       // Subsolar point lat, lon in radians (for day/night)
  uniform bool uShowNight;      // Whether to blend night texture
  uniform float uNightOpacity;  // Operator-selected relative darkness (0..1)
  uniform bool uGrayscale;      // Whether to apply grayscale conversion
  uniform float uAspect;        // Aspect ratio for non-square canvases
  uniform float uMapScale;      // Map scale factor (RADIUS/CENTER) to match 2D overlay

  varying vec2 vUv;

  const float PI = 3.14159265359;
  const float HALF_PI = 1.5707963268;

  void main() {
    // Convert UV to centered coordinates
    // Scale by uMapScale to match 2D overlay (which has margin for labels)
    // uMapScale = RADIUS/CENTER = 260/300 ≈ 0.867
    vec2 pos = (vUv - 0.5) * 2.0 / uMapScale;

    // Apply zoom (centered at origin, matching 2D canvas transform)
    pos = pos / uZoom;

    float rho = length(pos);

    // Outside the map circle - draw dark background
    if (rho > 1.0) {
      gl_FragColor = vec4(0.039, 0.039, 0.102, 1.0); // #0a0a1a
      return;
    }

    // Handle center point specially to avoid division by zero
    if (rho < 0.0001) {
      // At center, we're at the center lat/lon
      vec2 texCoord;
      texCoord.x = (uCenter.y / PI + 1.0) * 0.5;
      texCoord.y = 0.5 - uCenter.x / PI;
      texCoord.x = fract(texCoord.x);

      vec4 dayColor = texture2D(uDayTexture, texCoord);
      if (uGrayscale) {
        float lum = dot(dayColor.rgb, vec3(0.299, 0.587, 0.114));
        dayColor.rgb = vec3(lum) * 1.1;
      }
      gl_FragColor = dayColor;
      return;
    }

    // Inverse azimuthal equidistant projection
    // c is the angular distance from the center point
    float c = rho * PI; // rho=1 means PI radians (half Earth, 20,015 km)
    float sinC = sin(c);
    float cosC = cos(c);

    float centerLat = uCenter.x;
    float centerLon = uCenter.y;
    float sinCenterLat = sin(centerLat);
    float cosCenterLat = cos(centerLat);

    // Calculate latitude using inverse formula
    // lat = asin(cos(c) * sin(lat0) + y * sin(c) * cos(lat0) / rho)
    float lat = asin(
      cosC * sinCenterLat +
      pos.y * sinC * cosCenterLat / rho
    );

    // Calculate longitude using inverse formula
    // lon = lon0 + atan2(x * sin(c), rho * cos(lat0) * cos(c) - y * sin(lat0) * sin(c))
    float lon = centerLon + atan(
      pos.x * sinC,
      rho * cosCenterLat * cosC - pos.y * sinCenterLat * sinC
    );

    // Normalize to texture coordinates
    // Equirectangular: lon -PI..PI -> u 0..1, lat -PI/2..PI/2 -> v 1..0
    vec2 texCoord;
    texCoord.x = (lon / PI + 1.0) * 0.5; // -PI..PI -> 0..1
    texCoord.y = 0.5 - lat / PI;          // -PI/2..PI/2 -> 1..0

    // Wrap longitude (handles crossing antimeridian)
    texCoord.x = fract(texCoord.x);

    // Clamp latitude to valid range
    texCoord.y = clamp(texCoord.y, 0.0, 1.0);

    // Sample day texture
    vec4 dayColor = texture2D(uDayTexture, texCoord);
    if (uGrayscale) {
      float lum = dot(dayColor.rgb, vec3(0.299, 0.587, 0.114));
      dayColor.rgb = vec3(lum) * 1.1;
    }

    // If night blending is enabled, calculate day/night mix
    if (uShowNight) {
      // Calculate angular distance from subsolar point
      float subsolarLat = uSubsolar.x;
      float subsolarLon = uSubsolar.y;

      float cosAngle = sin(subsolarLat) * sin(lat) +
                       cos(subsolarLat) * cos(lat) * cos(lon - subsolarLon);
      cosAngle = clamp(cosAngle, -1.0, 1.0);

      // cosAngle > 0 = day side, cosAngle < 0 = night side
      // Smooth transition in twilight zone (-0.1 to 0.1)
      float nightMix = smoothstep(0.1, -0.1, cosAngle);

      vec4 nightColor = texture2D(uNightTexture, texCoord);
      if (uGrayscale) {
        float lum = dot(nightColor.rgb, vec3(0.299, 0.587, 0.114));
        nightColor.rgb = vec3(lum) * 1.1;
      }

      // Blend day and night
      gl_FragColor = mix(dayColor, nightColor, nightMix * uNightOpacity);
    } else {
      gl_FragColor = dayColor;
    }
  }
`;

/**
 * Shader program configuration
 */
export interface ShaderConfig {
  centerLat: number; // Degrees
  centerLon: number; // Degrees
  zoom: number;
  subsolarLat?: number; // Degrees
  subsolarLon?: number; // Degrees
  showNight: boolean;
  nightOpacity?: number;
  mapScale?: number; // RADIUS/CENTER ratio to match 2D overlay (default: 260/300)
}

/**
 * Convert degrees to radians
 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Convert radians to degrees
 */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
