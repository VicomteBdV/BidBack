import { describe, expect, it } from "vitest";
import { assertValidDeploymentJson } from "../../scripts/deployment-json-validator.mjs";

const addressA = "0x0000000000000000000000000000000000000001";
const addressB = "0x0000000000000000000000000000000000000002";
const addressC = "0x0000000000000000000000000000000000000003";
const addressD = "0x0000000000000000000000000000000000000004";
const addressE = "0x0000000000000000000000000000000000000005";
const addressF = "0x0000000000000000000000000000000000000006";

function validDeployment(overrides = {}) {
  return {
    chainId: 31337,
    generatedAt: "2026-06-29T00:00:00.000Z",
    source: "test",
    contracts: {
      auctionHouse: addressA,
      nftVault: addressB,
      escrowVault: addressC,
      distributionVault: addressD,
      paramsController: addressE,
      reputationAdapter: addressF
    },
    ...overrides
  };
}

describe("deployment JSON validator", () => {
  it("accepts a minimal valid deployment without localNft", () => {
    expect(() => assertValidDeploymentJson(validDeployment(), 31337)).not.toThrow();
  });

  it("rejects a deployment without auctionHouse", () => {
    const deployment = validDeployment({
      contracts: {
        nftVault: addressB,
        escrowVault: addressC,
        distributionVault: addressD,
        paramsController: addressE,
        reputationAdapter: addressF
      }
    });

    expect(() => assertValidDeploymentJson(deployment, 31337)).toThrow(/missing auctionHouse/i);
  });

  it("rejects an invalid core contract address", () => {
    const deployment = validDeployment({
      contracts: {
        ...validDeployment().contracts,
        auctionHouse: "not-an-address"
      }
    });

    expect(() => assertValidDeploymentJson(deployment, 31337)).toThrow(/auctionHouse must be a valid Ethereum address/i);
  });

  it("rejects a chainId that does not match the expected file chainId", () => {
    const deployment = validDeployment({
      chainId: 1
    });

    expect(() => assertValidDeploymentJson(deployment, 31337)).toThrow(/chainId mismatch/i);
  });

  it("accepts unknown fields with warnings", () => {
    const result = assertValidDeploymentJson(
      validDeployment({
        extraTopLevelField: true,
        contracts: {
          ...validDeployment().contracts,
          extraContractField: addressA
        }
      }),
      31337
    );

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("extraTopLevelField"),
        expect.stringContaining("extraContractField")
      ])
    );
  });

  it("validates localNft when present", () => {
    const deployment = validDeployment({
      contracts: {
        ...validDeployment().contracts,
        localNft: "invalid"
      }
    });

    expect(() => assertValidDeploymentJson(deployment, 31337)).toThrow(/localNft must be a valid Ethereum address/i);
  });
});