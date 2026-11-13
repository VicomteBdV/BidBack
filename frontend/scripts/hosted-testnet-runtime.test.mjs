import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  checkHostedTestnetRuntime,
  createHostedTestnetBuildStamp,
  publicEnvironmentKeys,
  runHostedTestnetCommand,
  validateHostedTestnetRuntime
} from "./hosted-testnet-runtime.mjs";

const profile = Object.freeze({
  NEXT_PUBLIC_CHAIN_ID: "84532",
  NEXT_PUBLIC_CHAIN_NAME: "Synthetic Base Sepolia",
  NEXT_PUBLIC_WALLET_RPC_URL: "https://wallet-rpc.example.invalid",
  NEXT_PUBLIC_BLOCK_EXPLORER_URL: "https://explorer.example.invalid",
  BIDBACK_CHAIN_ID: "84532",
  BIDBACK_RPC_URL: "https://server-rpc.example.invalid/synthetic-server-token",
  ENABLE_LOCAL_DEV_ACTIONS: "false",
  PORT: "3000"
});
const deployment = {
  chainId: 84532,
  contracts: Object.fromEntries([
    "auctionHouse", "nftVault", "escrowVault", "distributionVault", "paramsController", "reputationAdapter"
  ].map((key, index) => [key, `0x${String(index + 1).repeat(40)}`]))
};
const manifest = `${JSON.stringify(deployment)}\n`;
const stamp = createHostedTestnetBuildStamp(profile, manifest);
const clone = (value) => JSON.parse(JSON.stringify(value));
const errors = (overrides = {}, candidate = stamp, bytes = manifest) =>
  validateHostedTestnetRuntime({ ...profile, ...overrides }, candidate, bytes);

function reader(stampText = JSON.stringify(stamp), manifestBytes = manifest) {
  return (filename) => filename.endsWith("84532.json") ? manifestBytes : stampText;
}

function command(args = ["--check"], overrides = {}, injected = {}) {
  const output = [];
  const writes = [];
  const status = runHostedTestnetCommand(args, { ...profile, ...overrides }, {
    readFile: reader(),
    writeFile: (filename, contents) => writes.push({ filename, contents }),
    log: (message) => output.push(message),
    error: (message) => output.push(message),
    ...injected
  });
  return { status, output: output.join("\n"), writes };
}

test("valid hosted startup accepts synthetic configuration without any RPC calls", () => {
  assert.deepEqual(errors(), []);
  assert.deepEqual(checkHostedTestnetRuntime(profile, reader()), []);
  const result = command();
  assert.equal(result.status, 0);
  assert.match(result.output, /offline configuration check only/);
  assert.deepEqual(result.writes, []);
});

test("stamp contains only version, the explicit public whitelist and exact manifest byte SHA256", () => {
  assert.deepEqual(Object.keys(stamp), ["version", "publicEnvironment", "deploymentSha256"]);
  assert.equal(stamp.version, 1);
  assert.deepEqual(Object.keys(stamp.publicEnvironment), publicEnvironmentKeys);
  assert.equal(stamp.deploymentSha256, createHash("sha256").update(manifest).digest("hex"));
  assert.deepEqual(createHostedTestnetBuildStamp(profile, Buffer.from(manifest)), stamp);
  assert.doesNotMatch(JSON.stringify(stamp), /BIDBACK_RPC_URL|synthetic-server-token|ENABLE_LOCAL_DEV_ACTIONS|source|commit/i);
});

test("build command writes only its public stamp and does not print configuration values", () => {
  const result = command(["--write-stamp"]);
  assert.equal(result.status, 0);
  assert.equal(result.writes.length, 1);
  assert.ok(result.writes[0].filename.endsWith("/hosted-testnet-build.json"));
  assert.deepEqual(JSON.parse(result.writes[0].contents), stamp);
  assert.doesNotMatch(result.output, /example\.invalid|synthetic-server-token|Synthetic Base/);
});

for (const key of publicEnvironmentKeys) {
  test(`rejects every changed, omitted or empty public build value for ${key}`, () => {
    const replacement = key.endsWith("URL") ? "https://changed.example.invalid" : "changed-public-value";
    for (const value of [replacement, undefined, "", `${profile[key]} `]) {
      assert.ok(errors({ [key]: value }).some((message) => message.includes(key)), `${key}: ${String(value)}`);
    }
    const alteredStamp = clone(stamp);
    alteredStamp.publicEnvironment[key] = replacement;
    assert.ok(errors({}, alteredStamp).some((message) => message.includes(key)));
  });
}

test("optional public fields preserve exact unset versus empty semantics", () => {
  const minimal = { ...profile };
  delete minimal.NEXT_PUBLIC_CHAIN_NAME;
  delete minimal.NEXT_PUBLIC_BLOCK_EXPLORER_URL;
  const minimalStamp = createHostedTestnetBuildStamp(minimal, manifest);
  assert.equal(minimalStamp.publicEnvironment.NEXT_PUBLIC_CHAIN_NAME, null);
  assert.equal(minimalStamp.publicEnvironment.NEXT_PUBLIC_BLOCK_EXPLORER_URL, null);
  assert.deepEqual(validateHostedTestnetRuntime(minimal, minimalStamp, manifest), []);
  for (const key of ["NEXT_PUBLIC_CHAIN_NAME", "NEXT_PUBLIC_BLOCK_EXPLORER_URL"]) {
    assert.ok(validateHostedTestnetRuntime({ ...minimal, [key]: "" }, minimalStamp, manifest).length);
  }
  const empty = { ...minimal, NEXT_PUBLIC_CHAIN_NAME: "", NEXT_PUBLIC_BLOCK_EXPLORER_URL: "" };
  assert.deepEqual(validateHostedTestnetRuntime(empty, createHostedTestnetBuildStamp(empty, manifest), manifest), []);
});

test("server RPC may change at runtime and is required without becoming part of the stamp", () => {
  assert.deepEqual(errors({ BIDBACK_RPC_URL: "https://different-server.example.invalid/runtime-token" }), []);
  for (const value of [undefined, "", "not-a-url", "file:///tmp/synthetic", "https://rpc.example.invalid/#token"]) {
    assert.ok(errors({ BIDBACK_RPC_URL: value }).length);
  }
});

for (const key of ["NEXT_PUBLIC_CHAIN_ID", "BIDBACK_CHAIN_ID"]) {
  test(`rejects wrong, missing and malformed ${key}`, () => {
    for (const value of [undefined, "", "31337", "1", "84532 ", "84532junk", "0x14a34"]) {
      assert.ok(errors({ [key]: value }).length, `${key}: ${String(value)}`);
    }
  });
}

test("requires exactly false for hosted local-action flag", () => {
  for (const value of [undefined, "", "true", "TRUE", "0", "false ", false]) {
    assert.ok(errors({ ENABLE_LOCAL_DEV_ACTIONS: value }).length);
  }
});

for (const key of [
  "ANVIL_DEV_SELLER_PRIVATE_KEY", "ANVIL_DEV_BIDDER_PRIVATE_KEY",
  "ANVIL_DEV_SECOND_BIDDER_PRIVATE_KEY", "ANVIL_DEV_FEE_RECIPIENT_PRIVATE_KEY",
  "ANVIL_DEV_SYNTHETIC_PRIVATE_KEY"
]) {
  test(`rejects presence of ${key} even if empty or undefined`, () => {
    for (const value of ["synthetic-key-not-a-real-key", "", undefined]) {
      assert.ok(errors({ [key]: value }).length);
    }
  });
}

test("rejects public variables outside the explicit build whitelist", () => {
  for (const key of ["NEXT_PUBLIC_ANVIL_RPC_URL", "NEXT_PUBLIC_SYNTHETIC_SECRET"]) {
    for (const value of [undefined, "", "synthetic-sensitive-value"]) {
      assert.ok(errors({ [key]: value }).length);
      assert.throws(() => createHostedTestnetBuildStamp({ ...profile, [key]: value }, manifest));
    }
  }
});

test("rejects non-string public environment values", () => {
  for (const key of publicEnvironmentKeys) {
    for (const value of [84532, false, null, [], {}]) assert.ok(errors({ [key]: value }).length);
  }
});

test("rejects unsafe browser RPCs including local aliases, credentials, fragments and non-HTTP protocols", () => {
  for (const url of [
    "http://localhost:8545", "http://127.1:8545", "http://2130706433:8545", "http://[::1]:8545",
    "http://host.docker.internal:8545", "http://192.168.1.1:8545", "http://rpc.local:8545",
    "https://user:synthetic-credential@wallet-rpc.example.invalid", "https://rpc.example.invalid/#synthetic-fragment",
    "ws://wallet-rpc.example.invalid", "file:///tmp/rpc", "not-a-url"
  ]) {
    assert.ok(errors({ NEXT_PUBLIC_WALLET_RPC_URL: url }).length);
    assert.throws(() => createHostedTestnetBuildStamp({ ...profile, NEXT_PUBLIC_WALLET_RPC_URL: url }, manifest));
  }
});

test("accepts both port bounds and rejects absent, noncanonical and out-of-range ports", () => {
  for (const PORT of ["1", "3000", "65535"]) assert.deepEqual(errors({ PORT }), []);
  for (const PORT of [undefined, "", "0", "65536", "999999999999999999999999", "-1", "+3000", "03000", "3000 ", " 3000", "3e3", "3000.0", "3000junk", "3000\n", 3000]) {
    assert.ok(errors({ PORT }).some((message) => message.startsWith("PORT ")), String(PORT));
  }
});

test("rejects absent and malformed stamp schema including unknown or missing fields", () => {
  const candidates = [undefined, null, [], "synthetic-stamp", {}, { ...stamp, version: "1" }, { ...stamp, version: 2 },
    { ...stamp, unexpected: "synthetic-sensitive-value" }, { ...stamp, deploymentSha256: "A".repeat(64) },
    { ...stamp, deploymentSha256: "not-a-hash" }, { ...stamp, publicEnvironment: [] }];
  for (const key of Object.keys(stamp)) {
    const candidate = clone(stamp);
    delete candidate[key];
    candidates.push(candidate);
  }
  for (const key of publicEnvironmentKeys) {
    const missing = clone(stamp);
    delete missing.publicEnvironment[key];
    candidates.push(missing);
    const invalid = clone(stamp);
    invalid.publicEnvironment[key] = 84532;
    candidates.push(invalid);
  }
  const extraPublic = clone(stamp);
  extraPublic.publicEnvironment.NEXT_PUBLIC_SYNTHETIC_SECRET = "synthetic-sensitive-value";
  candidates.push(extraPublic);
  for (const key of ["NEXT_PUBLIC_CHAIN_ID", "NEXT_PUBLIC_WALLET_RPC_URL"]) {
    const nullRequired = clone(stamp);
    nullRequired.publicEnvironment[key] = null;
    candidates.push(nullRequired);
  }
  for (const candidate of candidates) {
    assert.ok(validateHostedTestnetRuntime(profile, candidate, manifest).some((message) => message.includes("exact version 1 schema")));
  }
});

test("rejects missing and malformed artifact reads with fixed diagnostics", () => {
  for (const readFile of [
    () => { throw new Error("synthetic-secret-filesystem-path"); },
    reader("synthetic-secret-invalid-json"),
    reader(JSON.stringify(stamp), "synthetic-secret-invalid-manifest")
  ]) {
    const result = command(["--check"], {}, { readFile });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.output, /synthetic-secret|SyntaxError|ENOENT|Error:/);
  }
});

test("requires exact manifest bytes even when shape and chain still match", () => {
  for (const changed of [manifest.trim(), `${manifest}\n`, JSON.stringify({ ...deployment, source: "synthetic-source" })]) {
    assert.ok(errors({}, stamp, changed).some((message) => message.includes("SHA256")));
  }
});

test("rejects invalid manifest shape and chain even when its byte hash matches the stamp", () => {
  for (const changed of [undefined, "not-json", "null", "{}", JSON.stringify({ ...deployment, chainId: 31337 }), JSON.stringify({ ...deployment, contracts: {} })]) {
    const candidate = { ...stamp, deploymentSha256: createHash("sha256").update(changed ?? "").digest("hex") };
    assert.ok(errors({}, candidate, changed).length);
    assert.throws(() => createHostedTestnetBuildStamp(profile, changed));
  }
});

test("all startup diagnostics redact public values, server RPCs, keys, manifest data and raw errors", () => {
  const sensitive = "synthetic-sensitive-value";
  const result = command(["--check"], {
    NEXT_PUBLIC_WALLET_RPC_URL: `https://user:${sensitive}@rpc.example.invalid`,
    NEXT_PUBLIC_CHAIN_NAME: sensitive,
    BIDBACK_RPC_URL: sensitive,
    ENABLE_LOCAL_DEV_ACTIONS: sensitive,
    ANVIL_DEV_SELLER_PRIVATE_KEY: sensitive,
    NEXT_PUBLIC_SYNTHETIC_SECRET: sensitive,
    PORT: sensitive
  }, { readFile: reader(JSON.stringify(stamp), JSON.stringify({ chainId: sensitive, contracts: { [sensitive]: sensitive } })) });
  assert.equal(result.status, 1);
  assert.match(result.output, /NEXT_PUBLIC_WALLET_RPC_URL/);
  assert.match(result.output, /PORT/);
  assert.doesNotMatch(result.output, /synthetic-sensitive-value|example\.invalid|user:|synthetic-server-token|NEXT_PUBLIC_SYNTHETIC_SECRET/);
});

test("build failures do not write a stamp or echo configuration and raw I/O errors", () => {
  for (const injected of [
    { readFile: () => { throw new Error("synthetic-sensitive-value"); } },
    { writeFile: () => { throw new Error("synthetic-sensitive-value"); } }
  ]) {
    const result = command(["--write-stamp"], {}, injected);
    assert.equal(result.status, 1);
    assert.deepEqual(result.writes, []);
    assert.doesNotMatch(result.output, /synthetic-sensitive-value|example\.invalid|Error:/);
  }
  const invalid = command(["--write-stamp"], { ENABLE_LOCAL_DEV_ACTIONS: "synthetic-sensitive-value" });
  assert.equal(invalid.status, 1);
  assert.deepEqual(invalid.writes, []);
  assert.doesNotMatch(invalid.output, /synthetic-sensitive-value/);
});

test("rejects arbitrary command arguments without echoing their values", () => {
  for (const args of [[], ["synthetic-sensitive-value"], ["--check", "synthetic-sensitive-value"]]) {
    const result = command(args);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.output, /synthetic-sensitive-value/);
    assert.deepEqual(result.writes, []);
  }
});
