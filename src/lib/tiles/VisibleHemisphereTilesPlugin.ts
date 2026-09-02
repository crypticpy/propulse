import { Matrix4, Sphere, Vector3 } from "three";

interface TileBoundingVolumeLike {
  getSphere: (target: Sphere) => void;
}

interface TileLike {
  engineData?: { boundingVolume?: TileBoundingVolumeLike };
}

interface TileViewErrorTarget {
  inView: boolean;
  error: number;
  distance: number;
}

interface TilesRuntimeLike {
  ellipsoid?: { radius?: Vector3 };
  cameras: Array<{
    matrixWorld: Matrix4;
    updateMatrixWorld: (force?: boolean) => void;
  }>;
  group: {
    matrixWorldInverse: Matrix4;
    updateWorldMatrix: (updateParents: boolean, updateChildren: boolean) => void;
  };
  addEventListener: (type: "update-before", listener: () => void) => void;
  removeEventListener: (type: "update-before", listener: () => void) => void;
}

/**
 * Conservative sphere-against-horizon test. The tangent plane from an
 * external camera satisfies camera dot surfacePoint = radius squared. A tile
 * is safely hidden only when the furthest point of its bounding sphere remains
 * behind that plane, preserving partially visible limb tiles.
 */
export function isTileSphereAboveHorizon(
  cameraPosition: Vector3,
  tileSphere: Sphere,
  planetRadius: number,
): boolean {
  const cameraDistance = cameraPosition.length();
  if (
    !Number.isFinite(cameraDistance) ||
    !Number.isFinite(planetRadius) ||
    cameraDistance <= planetRadius ||
    planetRadius <= 0
  ) {
    return true;
  }

  const furthestCameraDot =
    cameraPosition.dot(tileSphere.center) +
    cameraDistance * Math.max(0, tileSphere.radius);
  const horizonDot = planetRadius * planetRadius;
  // Keep a narrow numerical guard band at the limb. False positives cost a
  // tile request; false negatives would create a visible seam while orbiting.
  return furthestCameraDot >= horizonDot * (1 - 1e-6);
}

/** Mask XYZ nodes fully occluded by the globe before they enter load queues. */
export class VisibleHemisphereTilesPlugin {
  readonly name = "VISIBLE_HEMISPHERE_TILES_PLUGIN";
  private tiles: TilesRuntimeLike | null = null;
  private readonly tileSphere = new Sphere();
  private readonly cameraPositions: Vector3[] = [];
  private readonly updateCameraPositions = () => {
    const tiles = this.tiles;
    if (!tiles) return;
    tiles.group.updateWorldMatrix(true, false);
    this.cameraPositions.length = tiles.cameras.length;
    tiles.cameras.forEach((camera, index) => {
      camera.updateMatrixWorld(true);
      const position = this.cameraPositions[index] ?? new Vector3();
      position
        .setFromMatrixPosition(camera.matrixWorld)
        .applyMatrix4(tiles.group.matrixWorldInverse);
      this.cameraPositions[index] = position;
    });
  };

  init(tiles: TilesRuntimeLike): void {
    this.tiles = tiles;
    tiles.addEventListener("update-before", this.updateCameraPositions);
  }

  calculateTileViewError(
    tile: TileLike,
    target: TileViewErrorTarget,
  ): boolean {
    const boundingVolume = tile.engineData?.boundingVolume;
    const radii = this.tiles?.ellipsoid?.radius;
    if (!boundingVolume || !this.cameraPositions.length || !radii) return false;

    boundingVolume.getSphere(this.tileSphere);
    const planetRadius = Math.min(radii.x, radii.y, radii.z);
    target.inView = this.cameraPositions.some((position) =>
      isTileSphereAboveHorizon(position, this.tileSphere, planetRadius),
    );
    // This plugin masks only. The renderer retains ownership of screen-space
    // error and distance for tiles that survive the horizon test.
    target.error = 0;
    target.distance = Infinity;
    return true;
  }

  dispose(): void {
    this.tiles?.removeEventListener(
      "update-before",
      this.updateCameraPositions,
    );
    this.tiles = null;
    this.cameraPositions.length = 0;
  }
}
