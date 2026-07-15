import assert from "node:assert/strict";
import test from "node:test";
import { PttSafetyController } from "./pttSafety.js";

test("PTT lockout rejects key-down and releases an existing owner", async () => {
  const states: boolean[] = [];
  const safety = new PttSafetyController(
    async (enabled) => {
      states.push(enabled);
    },
    1_000,
    () => {},
  );

  await safety.setManualPtt("client-a", true);
  assert.equal(safety.owner, "client-a");
  await safety.configure(true);
  assert.equal(safety.owner, null);
  assert.deepEqual(states, [true, false]);
  await assert.rejects(
    safety.setManualPtt("client-a", true),
    /lockout/i,
  );
});

test("only the owning client disconnect releases manual PTT", async () => {
  const states: boolean[] = [];
  const safety = new PttSafetyController(
    async (enabled) => {
      states.push(enabled);
    },
    1_000,
    () => {},
  );

  await safety.setManualPtt("client-a", true);
  assert.equal(
    await safety.releaseIfOwnedBy("client-b", "other client disconnected"),
    false,
  );
  assert.equal(safety.owner, "client-a");
  assert.equal(
    await safety.releaseIfOwnedBy("client-a", "owner disconnected"),
    true,
  );
  assert.deepEqual(states, [true, false]);
});

test("maximum key-down timer releases PTT", async () => {
  const states: boolean[] = [];
  const safety = new PttSafetyController(
    async (enabled) => {
      states.push(enabled);
    },
    10,
    (_reason, error) => {
      throw error;
    },
  );

  await safety.setManualPtt("client-a", true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(safety.owner, null);
  assert.deepEqual(states, [true, false]);
});

test("disconnect queued during a slow key-down still releases PTT", async () => {
  const states: boolean[] = [];
  let keyDownStarted = false;
  let finishKeyDown = () => {};
  const safety = new PttSafetyController(
    async (enabled) => {
      states.push(enabled);
      if (enabled) {
        await new Promise<void>((resolve) => {
          keyDownStarted = true;
          finishKeyDown = resolve;
        });
      }
    },
    1_000,
    () => {},
  );

  const keyDown = safety.setManualPtt("client-a", true);
  const disconnectRelease = safety.releaseIfOwnedBy(
    "client-a",
    "owner disconnected",
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(keyDownStarted, true);
  finishKeyDown();

  await keyDown;
  assert.equal(await disconnectRelease, true);
  assert.equal(safety.owner, null);
  assert.deepEqual(states, [true, false]);
});

test("failed release retains ownership and retries until PTT-off succeeds", async () => {
  const states: boolean[] = [];
  let releaseAttempts = 0;
  const safety = new PttSafetyController(
    async (enabled) => {
      states.push(enabled);
      if (!enabled && ++releaseAttempts === 1) {
        throw new Error("transient CAT failure");
      }
    },
    1_000,
    () => {},
    10,
  );

  await safety.setManualPtt("client-a", true);
  await assert.rejects(
    safety.releaseIfOwnedBy("client-a", "owner disconnected"),
    /transient CAT failure/,
  );
  assert.equal(safety.owner, "client-a");
  await assert.rejects(
    safety.setManualPtt("client-a", true),
    /release is pending/i,
  );

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(safety.owner, null);
  assert.deepEqual(states, [true, false, false]);
});
