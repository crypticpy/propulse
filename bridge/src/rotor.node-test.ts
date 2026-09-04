import assert from "node:assert/strict";
import test from "node:test";
import {
  ROTOR_DEFAULT_HOST,
  ROTOR_DEFAULT_PORT,
  applyKnownElevationFallback,
  formatSetPositionCommand,
  isRotorEnabled,
  parseRotorPosition,
  parseRotorReport,
  resolveRotorConfig,
  shouldBlockRotor,
  validateRotorHeading,
} from "./rotor.js";

test("rotor client is opt-in via BRIDGE_ROTOR=1", () => {
  assert.equal(isRotorEnabled({}), false);
  assert.equal(isRotorEnabled({ ROTCTLD_PORT: "4533" }), false);
  assert.equal(isRotorEnabled({ BRIDGE_ROTOR: "0" }), false);
  assert.equal(isRotorEnabled({ BRIDGE_ROTOR: "1" }), true);
});

test("rotor config falls back to rotctld defaults", () => {
  assert.deepEqual(resolveRotorConfig({}), {
    host: ROTOR_DEFAULT_HOST,
    port: ROTOR_DEFAULT_PORT,
  });
  assert.deepEqual(
    resolveRotorConfig({ ROTCTLD_HOST: " 10.0.0.5 ", ROTCTLD_PORT: "4535" }),
    { host: "10.0.0.5", port: 4535 },
  );
  assert.deepEqual(resolveRotorConfig({ ROTCTLD_PORT: "not-a-port" }), {
    host: ROTOR_DEFAULT_HOST,
    port: ROTOR_DEFAULT_PORT,
  });
  assert.deepEqual(resolveRotorConfig({ ROTCTLD_PORT: "99999" }), {
    host: ROTOR_DEFAULT_HOST,
    port: ROTOR_DEFAULT_PORT,
  });
});

test("parseRotorPosition reads the two-line get_pos response", () => {
  assert.deepEqual(parseRotorPosition("247.0\n0.0\n"), {
    azimuth: 247,
    elevation: 0,
  });
  assert.deepEqual(parseRotorPosition("  12.5 \r\n 33.25 \r\n"), {
    azimuth: 12.5,
    elevation: 33.25,
  });
});

test("parseRotorPosition rejects error and malformed responses", () => {
  assert.throws(() => parseRotorPosition("RPRT -1"), /RPRT -1/);
  assert.throws(() => parseRotorPosition("247.0\n"), /invalid response/);
  assert.throws(() => parseRotorPosition("az\nel\n"), /invalid response/);
});

test("formatSetPositionCommand emits the rotctld P command", () => {
  assert.equal(
    formatSetPositionCommand({ azimuth: 247, elevation: 0 }),
    "P 247.00 0.00",
  );
  assert.equal(
    formatSetPositionCommand({ azimuth: 12.345, elevation: 45.6 }),
    "P 12.35 45.60",
  );
});

test("parseRotorReport accepts RPRT 0 and rejects anything else", () => {
  assert.equal(parseRotorReport("RPRT 0\n", "set_pos"), undefined);
  assert.throws(() => parseRotorReport("RPRT -1", "set_pos"), /RPRT -1/);
  assert.throws(() => parseRotorReport("", "set_pos"), /unexpected response/);
  assert.throws(
    () => parseRotorReport("247.0", "set_pos"),
    /unexpected response/,
  );
});

test("validateRotorHeading accepts in-range headings", () => {
  assert.deepEqual(validateRotorHeading({ azimuth: 0 }), {
    azimuth: 0,
    elevation: 0,
  });
  assert.deepEqual(validateRotorHeading({ azimuth: 360 }), {
    azimuth: 360,
    elevation: 0,
  });
  assert.deepEqual(validateRotorHeading({ azimuth: 247.5, elevation: 30 }), {
    azimuth: 247.5,
    elevation: 30,
  });
  assert.deepEqual(
    validateRotorHeading({ azimuth: 10, elevation: undefined }),
    { azimuth: 10, elevation: 0 },
  );
});

test("validateRotorHeading rejects out-of-range and non-finite input", () => {
  assert.throws(() => validateRotorHeading(null), /object payload/);
  assert.throws(() => validateRotorHeading("247"), /object payload/);
  assert.throws(() => validateRotorHeading({}), /Invalid azimuth/);
  assert.throws(() => validateRotorHeading({ azimuth: -1 }), /Invalid azimuth/);
  assert.throws(() => validateRotorHeading({ azimuth: 361 }), /Invalid azimuth/);
  assert.throws(
    () => validateRotorHeading({ azimuth: Number.NaN }),
    /Invalid azimuth/,
  );
  assert.throws(
    () => validateRotorHeading({ azimuth: Number.POSITIVE_INFINITY }),
    /Invalid azimuth/,
  );
  assert.throws(
    () => validateRotorHeading({ azimuth: "247" }),
    /Invalid azimuth/,
  );
  assert.throws(
    () => validateRotorHeading({ azimuth: 10, elevation: 91 }),
    /Invalid elevation/,
  );
  assert.throws(
    () => validateRotorHeading({ azimuth: 10, elevation: -5 }),
    /Invalid elevation/,
  );
  assert.throws(
    () => validateRotorHeading({ azimuth: 10, elevation: "30" }),
    /Invalid elevation/,
  );
});

test("shouldBlockRotor blocks on manual PTT, active TX, or observed rig PTT", () => {
  assert.equal(
    shouldBlockRotor({ manualPttOwned: false, txActive: false, rigPtt: false }),
    false,
  );
  assert.equal(
    shouldBlockRotor({ manualPttOwned: true, txActive: false, rigPtt: false }),
    true,
  );
  assert.equal(
    shouldBlockRotor({ manualPttOwned: false, txActive: true, rigPtt: false }),
    true,
  );
  assert.equal(
    shouldBlockRotor({ manualPttOwned: false, txActive: false, rigPtt: true }),
    true,
  );
});

test("applyKnownElevationFallback fills in a missing elevation from known state", () => {
  assert.deepEqual(
    applyKnownElevationFallback({ azimuth: 90 }, 30),
    { azimuth: 90, elevation: 30 },
  );
  assert.deepEqual(
    applyKnownElevationFallback({ azimuth: 90, elevation: null }, 30),
    { azimuth: 90, elevation: 30 },
  );
});

test("applyKnownElevationFallback falls back to 0 only when elevation is unknown", () => {
  assert.deepEqual(
    applyKnownElevationFallback({ azimuth: 90 }, null),
    { azimuth: 90 },
  );
});

test("applyKnownElevationFallback leaves an explicit elevation untouched", () => {
  assert.deepEqual(
    applyKnownElevationFallback({ azimuth: 90, elevation: 12 }, 30),
    { azimuth: 90, elevation: 12 },
  );
});

test("applyKnownElevationFallback passes through non-object payloads unchanged", () => {
  assert.equal(applyKnownElevationFallback(null, 30), null);
  assert.equal(applyKnownElevationFallback("bad", 30), "bad");
});
