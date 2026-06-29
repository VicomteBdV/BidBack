#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DeploymentValidationError, assertValidDeploymentJson } from "./deployment-json-validator.mjs";

function parseChainId(value) {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error("Usage: npm run validate:deployment -- <chainId>");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("chainId must be a positive safe integer.");
  }

  return parsed;
}

async function main() {
  const chainId = parseChainId(process.argv[2]);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendRoot = path.resolve(scriptDir, "..");
  const deploymentPath = path.join(frontendRoot, "public", "deployments", `${chainId}.json`);

  let raw;

  try {
    raw = await readFile(deploymentPath, "utf8");
  } catch (error) {
    throw new Error(`Deployment file not found or unreadable: ${deploymentPath}\n${error.message}`);
  }

  let payload;

  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Deployment file is not valid JSON: ${deploymentPath}\n${error.message}`);
  }

  const result = assertValidDeploymentJson(payload, chainId);

  console.log(`Deployment JSON valid: ${deploymentPath}`);

  if (result.warnings.length > 0) {
    console.warn("Warnings:");
    for (const warning of result.warnings) {
      console.warn(`- ${warning}`);
    }
  }
}

main().catch((error) => {
  if (error instanceof DeploymentValidationError) {
    console.error(error.message);

    if (error.warnings.length > 0) {
      console.error("Warnings:");
      for (const warning of error.warnings) {
        console.error(`- ${warning}`);
      }
    }
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }

  process.exit(1);
});