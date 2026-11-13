#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateControlledTestnetEnvironment } from "./validate-controlled-testnet-env.mjs";

export const publicEnvironmentKeys = Object.freeze([
  "NEXT_PUBLIC_CHAIN_ID",
  "NEXT_PUBLIC_CHAIN_NAME",
  "NEXT_PUBLIC_WALLET_RPC_URL",
  "NEXT_PUBLIC_BLOCK_EXPLORER_URL"
]);

const manifestPath = fileURLToPath(new URL("../public/deployments/84532.json", import.meta.url));
const stampPath = fileURLToPath(new URL("../hosted-testnet-build.json", import.meta.url));
const stampError = "hosted-testnet-build.json must have the exact version 1 schema.";
const manifestError = "84532 deployment manifest SHA256 must match hosted-testnet-build.json.";

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function publicEnvironment(environment) {
  return Object.fromEntries(publicEnvironmentKeys.map((key) => [key, environment[key] ?? null]));
}

function parseManifest(bytes) {
  try {
    return JSON.parse(bytes.toString());
  } catch {
    return undefined;
  }
}

function manifestSha256(bytes) {
  return typeof bytes === "string" || bytes instanceof Uint8Array
    ? createHash("sha256").update(bytes).digest("hex")
    : undefined;
}

function configurationErrors(environment, manifestBytes) {
  // This validator is offline and uses only Node built-ins and the pure JSON validator.
  const errors = validateControlledTestnetEnvironment(environment, parseManifest(manifestBytes));
  if (environment.ENABLE_LOCAL_DEV_ACTIONS !== "false") {
    errors.push("ENABLE_LOCAL_DEV_ACTIONS must be exactly false for hosted startup.");
  }
  if (Object.keys(environment).some((key) => /^ANVIL_DEV_.*PRIVATE_KEY$/.test(key))) {
    errors.push("ANVIL_DEV_*PRIVATE_KEY variables must be absent for hosted startup.");
  }
  if (Object.keys(environment).some((key) => key.startsWith("NEXT_PUBLIC_") && !publicEnvironmentKeys.includes(key))) {
    errors.push("NEXT_PUBLIC_* variables must use only the hosted public configuration whitelist.");
  }
  for (const key of publicEnvironmentKeys) {
    if (environment[key] !== undefined && typeof environment[key] !== "string") {
      errors.push(`${key} must be a string when provided.`);
    }
  }
  if (typeof environment.PORT !== "string" || !/^[1-9]\d{0,4}$/.test(environment.PORT) || Number(environment.PORT) > 65535) {
    errors.push("PORT must be an integer from 1 through 65535 without whitespace or leading zeros.");
  }
  return errors;
}

function validStamp(stamp) {
  return exactKeys(stamp, ["version", "publicEnvironment", "deploymentSha256"]) &&
    stamp.version === 1 &&
    typeof stamp.deploymentSha256 === "string" && /^[a-f0-9]{64}$/.test(stamp.deploymentSha256) &&
    exactKeys(stamp.publicEnvironment, publicEnvironmentKeys) &&
    publicEnvironmentKeys.every((key) => typeof stamp.publicEnvironment[key] === "string" ||
      (["NEXT_PUBLIC_CHAIN_NAME", "NEXT_PUBLIC_BLOCK_EXPLORER_URL"].includes(key) && stamp.publicEnvironment[key] === null));
}

export function createHostedTestnetBuildStamp(environment, manifestBytes) {
  const errors = configurationErrors(environment, manifestBytes);
  if (errors.length) throw new Error(errors.join("\n"));
  return {
    version: 1,
    publicEnvironment: publicEnvironment(environment),
    deploymentSha256: manifestSha256(manifestBytes)
  };
}

export function validateHostedTestnetRuntime(environment, stamp, manifestBytes) {
  const errors = configurationErrors(environment, manifestBytes);
  if (!validStamp(stamp)) {
    errors.push(stampError);
    return errors;
  }
  const currentPublic = publicEnvironment(environment);
  for (const key of publicEnvironmentKeys) {
    if (stamp.publicEnvironment[key] !== currentPublic[key]) {
      errors.push(`${key} must match hosted-testnet-build.json exactly; rebuild to change public configuration.`);
    }
  }
  if (stamp.deploymentSha256 !== manifestSha256(manifestBytes)) errors.push(manifestError);
  return errors;
}

// Injected reads keep missing/malformed artifact tests offline and free of generated files.
export function checkHostedTestnetRuntime(environment = process.env, readFile = readFileSync) {
  let manifestBytes;
  let stamp;
  try { manifestBytes = readFile(manifestPath); } catch { /* Fixed diagnostic below. */ }
  try { stamp = JSON.parse(readFile(stampPath, "utf8")); } catch { /* Fixed diagnostic below. */ }
  return validateHostedTestnetRuntime(environment, stamp, manifestBytes);
}

export function runHostedTestnetCommand(args, environment = process.env, io = {}) {
  const readFile = io.readFile ?? readFileSync;
  const writeFile = io.writeFile ?? writeFileSync;
  const log = io.log ?? console.log;
  const error = io.error ?? console.error;
  if (args.length !== 1 || !["--check", "--write-stamp"].includes(args[0])) {
    error("Usage: hosted-testnet-runtime.mjs --check | --write-stamp");
    return 1;
  }
  if (args[0] === "--write-stamp") {
    try {
      const stamp = createHostedTestnetBuildStamp(environment, readFile(manifestPath));
      writeFile(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
      log("Hosted-testnet public build stamp written; offline configuration check only.");
      return 0;
    } catch {
      error("Hosted-testnet build stamp failed: check public configuration and the 84532 deployment manifest.");
      return 1;
    }
  }
  // Never forward filesystem, parser, URL or other raw error text to startup logs.
  try {
    const errors = checkHostedTestnetRuntime(environment, readFile);
    if (!errors.length) {
      log("Hosted-testnet startup configuration valid; offline configuration check only.");
      return 0;
    }
    error("Hosted-testnet startup validation failed:");
    for (const message of errors) error(`- ${message}`);
  } catch {
    error("Hosted-testnet startup validation failed: configuration could not be checked.");
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runHostedTestnetCommand(process.argv.slice(2));
}
