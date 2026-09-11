#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateDeploymentJson } from "./deployment-json-validator.mjs";

const deploymentPath = fileURLToPath(new URL("../public/deployments/84532.json", import.meta.url));

function rpcUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.hash ? url : null;
  } catch {
    return null;
  }
}

function isLocalBrowserHost(hostname) {
  // URL parsing canonicalizes alternate numeric IPv4 and compressed IPv6 forms.
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host === "host.docker.internal" || host === "::" || host === "::1" ||
      host.startsWith("::ffff:") || /^(fc|fd|fe[89ab])/.test(host) && host.includes(":")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

export function validateControlledTestnetEnvironment(environment, deployment) {
  const errors = [];
  if (environment.NEXT_PUBLIC_CHAIN_ID !== "84532" || environment.BIDBACK_CHAIN_ID !== "84532") {
    errors.push("NEXT_PUBLIC_CHAIN_ID and BIDBACK_CHAIN_ID must both be exactly 84532.");
  }
  if (![undefined, "", "false"].includes(environment.ENABLE_LOCAL_DEV_ACTIONS)) {
    errors.push("ENABLE_LOCAL_DEV_ACTIONS must be unset or false.");
  }
  if (Object.entries(environment).some(([key, value]) =>
    /^ANVIL_DEV_.*PRIVATE_KEY$/.test(key) && value !== undefined && value !== ""
  )) {
    errors.push("Local Anvil private-key variables must be empty or unset.");
  }
  const browser = rpcUrl(environment.NEXT_PUBLIC_WALLET_RPC_URL);
  if (!browser || browser.username || browser.password || isLocalBrowserHost(browser.hostname)) {
    errors.push("NEXT_PUBLIC_WALLET_RPC_URL must be a non-local HTTP(S) URL without embedded credentials or a fragment.");
  }
  if (!rpcUrl(environment.BIDBACK_RPC_URL)) {
    errors.push("BIDBACK_RPC_URL must be an explicit HTTP(S) URL without a fragment.");
  }
  // Reuse the repository's shape/address validator without echoing manifest values.
  if (!validateDeploymentJson(deployment, 84532).ok) {
    errors.push("The 84532 deployment manifest must exist, be valid JSON, and match chain 84532 with all core addresses.");
  }
  return errors;
}

export function checkControlledTestnetEnvironment(environment = process.env, manifestPath = deploymentPath) {
  let deployment;
  try {
    deployment = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    // A missing or malformed manifest is reported through the same fixed error.
  }
  return validateControlledTestnetEnvironment(environment, deployment);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const errors = checkControlledTestnetEnvironment();
  if (errors.length) {
    console.error("Controlled-testnet environment validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Controlled-testnet environment configuration valid for Base Sepolia (84532).");
    console.log("Offline configuration check only; RPC reachability and on-chain correctness are not verified.");
  }
}
