import { anvilChainId } from "@/lib/chains";
import { orderedContractKeys, type ContractKey } from "@/lib/contracts";

export type DeploymentContracts = Record<ContractKey, `0x${string}`>;

export type LocalDeployment = {
  chainId: number;
  generatedAt: string;
  source: string;
  contracts: DeploymentContracts;
};

function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function validateDeployment(value: unknown): LocalDeployment {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid deployment file");
  }

  const candidate = value as Partial<LocalDeployment>;

  if (typeof candidate.chainId !== "number") {
    throw new Error("Deployment file is missing chainId");
  }

  if (!candidate.contracts || typeof candidate.contracts !== "object") {
    throw new Error("Deployment file is missing contracts");
  }

  for (const key of orderedContractKeys) {
    if (!isAddress(candidate.contracts[key])) {
      throw new Error(`Deployment file is missing ${key}`);
    }
  }

  return candidate as LocalDeployment;
}

export async function fetchLocalDeployment(chainId = anvilChainId): Promise<LocalDeployment> {
  const response = await fetch(`/deployments/${chainId}.json`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Deployment file not found for chain ${chainId}`);
  }

  const payload = await response.json();
  return validateDeployment(payload);
}