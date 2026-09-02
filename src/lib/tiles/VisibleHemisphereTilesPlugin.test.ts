import { describe, expect, it } from "vitest";
import { Matrix4, Sphere, Vector3 } from "three";
import {
  VisibleHemisphereTilesPlugin,
  isTileSphereAboveHorizon,
} from "./VisibleHemisphereTilesPlugin";

describe("isTileSphereAboveHorizon", () => {
  const radius = 100;
  const camera = new Vector3(250, 0, 0);

  it("keeps near-side and limb-intersecting tiles", () => {
    expect(
      isTileSphereAboveHorizon(
        camera,
        new Sphere(new Vector3(100, 0, 0), 5),
        radius,
      ),
    ).toBe(true);
    expect(
      isTileSphereAboveHorizon(
        camera,
        new Sphere(new Vector3(39, 90, 0), 2),
        radius,
      ),
    ).toBe(true);
  });

  it("rejects a tile whose complete bound is behind the globe", () => {
    expect(
      isTileSphereAboveHorizon(
        camera,
        new Sphere(new Vector3(-100, 0, 0), 5),
        radius,
      ),
    ).toBe(false);
  });
});

describe("VisibleHemisphereTilesPlugin", () => {
  it("masks an occluded renderer node before it can be queued", () => {
    const plugin = new VisibleHemisphereTilesPlugin();
    let updateBefore: () => void = () => undefined;
    plugin.init({
      ellipsoid: { radius: new Vector3(100, 100, 100) },
      cameras: [
        {
          matrixWorld: new Matrix4().setPosition(250, 0, 0),
          updateMatrixWorld: () => undefined,
        },
      ],
      group: {
        matrixWorld: new Matrix4(),
        updateWorldMatrix: () => undefined,
      },
      addEventListener: (_type, listener) => {
        updateBefore = listener;
      },
      removeEventListener: () => undefined,
    });
    updateBefore();
    const target = { inView: true, error: 10, distance: 20 };

    const handled = plugin.calculateTileViewError(
      {
        engineData: {
          boundingVolume: {
            getSphere: (sphere) =>
              void sphere.set(new Vector3(-100, 0, 0), 5),
          },
        },
      },
      target,
    );

    expect(handled).toBe(true);
    expect(target).toEqual({ inView: false, error: 0, distance: Infinity });
  });

  it("delegates visible nodes without changing renderer error state", () => {
    const plugin = new VisibleHemisphereTilesPlugin();
    let updateBefore: () => void = () => undefined;
    plugin.init({
      ellipsoid: { radius: new Vector3(100, 100, 100) },
      cameras: [
        {
          matrixWorld: new Matrix4().setPosition(250, 0, 0),
          updateMatrixWorld: () => undefined,
        },
      ],
      group: {
        matrixWorld: new Matrix4().makeTranslation(10, 0, 0),
        updateWorldMatrix: () => undefined,
      },
      addEventListener: (_type, listener) => {
        updateBefore = listener;
      },
      removeEventListener: () => undefined,
    });
    updateBefore();
    const target = { inView: true, error: 10, distance: 20 };

    const handled = plugin.calculateTileViewError(
      {
        engineData: {
          boundingVolume: {
            getSphere: (sphere) =>
              void sphere.set(new Vector3(100, 0, 0), 5),
          },
        },
      },
      target,
    );

    expect(handled).toBe(false);
    expect(target).toEqual({ inView: true, error: 10, distance: 20 });
  });
});
