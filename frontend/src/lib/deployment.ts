import { anvilChainId, targetChainId } from "@/lib/chains";
import {
  orderedCoreContractKeys,
  orderedOptionalContractKeys,
  type ContractKey,
  type DeploymentContracts
} from "@/lib/contracts";

export type Deployment = {
  chainId: number;
  generatedAt?: string;
  source?: string;
  contracts: DeploymentContracts;
};

export type LocalDeployment = Deployment;

function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function assertAddress(value: unknown, label: string): `0x${string}` {
  if (isAddress(value)) return value;
  throw new Error(`Deployment file is missing ${label}`);
}

function validateDeployment(value: unknown, expectedChainId: number): Deployment {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid deployment file");
  }

  const candidate = value as {
    chainId?: unknown;
    generatedAt?: unknown;
    source?: unknown;
    contracts?: Record<string, unknown>;
  };

  if (typeof candidate.chainId !== "number") {
    throw new Error("Deployment file is missing chainId");
  }

  if (candidate.chainId !== expectedChainId) {
    throw new Error(`Deployment chainId mismatch. Expected ${expectedChainId}, got ${candidate.chainId}`);
  }

  if (!candidate.contracts || typeof candidate.contracts !== "object") {
    throw new Error("Deployment file is missing contracts");
  }

  const contracts: Partial<Record<ContractKey, `0x${string}`>> = {};

  for (const key of orderedCoreContractKeys) {
    contracts[key] = assertAddress(candidate.contracts[key], key);
  }

  for (const key of orderedOptionalContractKeys) {
    const value = candidate.contracts[key];

    if (value !== undefined && value !== null) {
      contracts[key] = assertAddress(value, key);
    }
  }

  return {
    chainId: candidate.chainId,
    generatedAt: typeof candidate.generatedAt === "string" ? candidate.generatedAt : undefined,
    source: typeof candidate.source === "string" ? candidate.source : undefined,
    contracts: contracts as DeploymentContracts
  };
}

export async function fetchDeployment(chainId = targetChainId): Promise<Deployment> {
  const response = await fetch(`/deployments/${chainId}.json`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Deployment file not found for chain ${chainId}`);
  }

  const payload = await response.json();
  return validateDeployment(payload, chainId);
}

export async function fetchLocalDeployment(chainId = anvilChainId): Promise<LocalDeployment> {
  return fetchDeployment(chainId);
}