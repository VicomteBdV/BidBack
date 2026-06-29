export const coreContractKeys = [
  "auctionHouse",
  "nftVault",
  "escrowVault",
  "distributionVault",
  "paramsController",
  "reputationAdapter"
];

export const optionalContractKeys = ["localNft"];

const allowedTopLevelKeys = ["chainId", "generatedAt", "source", "contracts"];
const allowedContractKeys = [...coreContractKeys, ...optionalContractKeys];

export class DeploymentValidationError extends Error {
  constructor(errors, warnings = []) {
    super(`Deployment JSON validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "DeploymentValidationError";
    this.errors = errors;
    this.warnings = warnings;
  }
}

export function isEthereumAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(source, allowedKeys) {
  return Object.keys(source).filter((key) => !allowedKeys.includes(key));
}

export function validateDeploymentJson(payload, expectedChainId) {
  const errors = [];
  const warnings = [];

  if (!Number.isInteger(expectedChainId) || expectedChainId <= 0) {
    errors.push("Expected chainId must be a positive integer.");
  }

  if (!isPlainObject(payload)) {
    errors.push("Deployment JSON root must be an object.");
    return { ok: false, errors, warnings };
  }

  for (const key of unknownKeys(payload, allowedTopLevelKeys)) {
    warnings.push(`Unknown top-level field "${key}" is ignored by the frontend validator.`);
  }

  if (!Object.prototype.hasOwnProperty.call(payload, "chainId")) {
    errors.push("Deployment JSON is missing chainId.");
  } else if (!Number.isInteger(payload.chainId) || payload.chainId <= 0) {
    errors.push("Deployment chainId must be a positive integer.");
  } else if (Number.isInteger(expectedChainId) && payload.chainId !== expectedChainId) {
    errors.push(`Deployment chainId mismatch. Expected ${expectedChainId}, got ${payload.chainId}.`);
  }

  if (!Object.prototype.hasOwnProperty.call(payload, "contracts")) {
    errors.push("Deployment JSON is missing contracts.");
    return { ok: false, errors, warnings };
  }

  if (!isPlainObject(payload.contracts)) {
    errors.push("Deployment contracts must be an object.");
    return { ok: false, errors, warnings };
  }

  for (const key of unknownKeys(payload.contracts, allowedContractKeys)) {
    warnings.push(`Unknown contract field "${key}" is ignored by the frontend validator.`);
  }

  for (const key of coreContractKeys) {
    if (!Object.prototype.hasOwnProperty.call(payload.contracts, key)) {
      errors.push(`Deployment contracts is missing ${key}.`);
      continue;
    }

    if (!isEthereumAddress(payload.contracts[key])) {
      errors.push(`Deployment contract ${key} must be a valid Ethereum address.`);
    }
  }

  for (const key of optionalContractKeys) {
    if (!Object.prototype.hasOwnProperty.call(payload.contracts, key)) {
      continue;
    }

    if (!isEthereumAddress(payload.contracts[key])) {
      errors.push(`Optional deployment contract ${key} must be a valid Ethereum address when present.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

export function assertValidDeploymentJson(payload, expectedChainId) {
  const result = validateDeploymentJson(payload, expectedChainId);

  if (!result.ok) {
    throw new DeploymentValidationError(result.errors, result.warnings);
  }

  return result;
}