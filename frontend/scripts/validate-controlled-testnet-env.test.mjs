import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkControlledTestnetEnvironment, validateControlledTestnetEnvironment } from "./validate-controlled-testnet-env.mjs";

const script = fileURLToPath(new URL("./validate-controlled-testnet-env.mjs", import.meta.url));
const deployment = JSON.parse(readFileSync(new URL("../public/deployments/84532.json", import.meta.url), "utf8"));
const profile = {
  NEXT_PUBLIC_CHAIN_ID: "84532",
  BIDBACK_CHAIN_ID: "84532",
  ENABLE_LOCAL_DEV_ACTIONS: "false",
  NEXT_PUBLIC_WALLET_RPC_URL: "https://wallet-rpc.example.invalid",
  BIDBACK_RPC_URL: "https://server-rpc.example.invalid"
};

function errors(overrides = {}, manifest = deployment) {
  return validateControlledTestnetEnvironment({ ...profile, ...overrides }, manifest);
}

function cli(overrides = {}) {
  return spawnSync(process.execPath, [script], { env: { ...profile, ...overrides }, encoding: "utf8" });
}

test("accepts an explicit Base Sepolia configuration without contacting either synthetic RPC", () => {
  assert.deepEqual(errors(), []);
  assert.deepEqual(errors({ ENABLE_LOCAL_DEV_ACTIONS: undefined }), []);
  assert.deepEqual(checkControlledTestnetEnvironment(profile), []);
  const result = cli();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Offline configuration check only/);
});

for (const key of ["NEXT_PUBLIC_CHAIN_ID", "BIDBACK_CHAIN_ID"]) {
  test(`rejects missing, local, mismatched and malformed ${key}`, () => {
    for (const value of [undefined, "", "31337", "1", "84532junk", "0x14a34", " 84532 "]) {
      assert.ok(errors({ [key]: value }).length > 0);
    }
  });
}

test("rejects a wholly local configuration", () => {
  assert.ok(errors({ NEXT_PUBLIC_CHAIN_ID: "31337", BIDBACK_CHAIN_ID: "31337" }).length > 0);
});

test("rejects local dev opt-in and noncanonical flags", () => {
  for (const value of ["true", "TRUE", "1", "false "]) {
    assert.ok(errors({ ENABLE_LOCAL_DEV_ACTIONS: value }).length > 0);
  }
});

for (const key of [
  "ANVIL_DEV_SELLER_PRIVATE_KEY", "ANVIL_DEV_BIDDER_PRIVATE_KEY",
  "ANVIL_DEV_SECOND_BIDDER_PRIVATE_KEY", "ANVIL_DEV_FEE_RECIPIENT_PRIVATE_KEY"
]) {
  test(`rejects populated ${key} without returning its value`, () => {
    const result = errors({ [key]: "synthetic-not-a-private-key" });
    assert.ok(result.length > 0);
    assert.doesNotMatch(result.join("\n"), /synthetic-not-a-private-key/);
    assert.deepEqual(errors({ [key]: "" }), []);
  });
}

for (const key of ["NEXT_PUBLIC_WALLET_RPC_URL", "BIDBACK_RPC_URL"]) {
  test(`requires explicit HTTP(S) ${key}`, () => {
    for (const value of [undefined, "", " ", "not-a-url", "file:///tmp/rpc", "ws://rpc.example.invalid", "https://rpc.example.invalid/#fragment"]) {
      assert.ok(errors({ [key]: value }).length > 0);
    }
  });
}

test("refuses local browser RPCs including alternate loopback spellings", () => {
  for (const host of [
    "localhost", "LOCALHOST.", "rpc.localhost", "rpc.local", "host.docker.internal",
    "127.0.0.1", "127.8.9.10", "127.1", "2130706433", "0x7f000001", "0177.0.0.1",
    "0.0.0.0", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.1.1",
    "[::]", "[::1]", "[0:0:0:0:0:0:0:1]", "[::ffff:127.0.0.1]", "[fd00::1]", "[fe80::1]"
  ]) {
    assert.ok(errors({ NEXT_PUBLIC_WALLET_RPC_URL: `http://${host}:8545` }).length > 0, host);
  }
});

test("does not expose embedded browser RPC credentials", () => {
  const result = errors({ NEXT_PUBLIC_WALLET_RPC_URL: "https://user:synthetic-secret@rpc.example.invalid" });
  assert.ok(result.length > 0);
  assert.doesNotMatch(result.join("\n"), /synthetic-secret|user:|rpc\.example/);
});

test("requires the reference deployment chain and all core addresses", () => {
  for (const manifest of [null, {}, { ...deployment, chainId: 31337 }, { ...deployment, contracts: {} }]) {
    assert.ok(errors({}, manifest).length > 0);
  }
});

test("fails closed for absent or malformed manifest files", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "bidback-controlled-env-"));
  try {
    const manifestPath = path.join(directory, "84532.json");
    assert.ok(checkControlledTestnetEnvironment(profile, manifestPath).length > 0);
    writeFileSync(manifestPath, "synthetic-invalid-json");
    const result = checkControlledTestnetEnvironment(profile, manifestPath);
    assert.ok(result.length > 0);
    assert.doesNotMatch(result.join("\n"), /synthetic-invalid-json|bidback-controlled-env-/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const overrides of [
  { ENABLE_LOCAL_DEV_ACTIONS: "true" },
  { BIDBACK_CHAIN_ID: "31337" },
  { ANVIL_DEV_SELLER_PRIVATE_KEY: "synthetic-not-a-private-key" },
  { NEXT_PUBLIC_WALLET_RPC_URL: "http://127.0.0.1:8545" }
]) {
  test(`CLI returns nonzero for ${Object.keys(overrides)[0]} without leaking values`, () => {
    const result = cli(overrides);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /validation failed/);
    assert.doesNotMatch(result.stderr + result.stdout, /synthetic-not-a-private-key|127\.0\.0\.1/);
  });
}
