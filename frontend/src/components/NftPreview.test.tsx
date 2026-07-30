import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NftPreview } from "@/components/NftPreview";
import { testAddresses } from "@/test/fixtures";

describe("NftPreview", () => {
  it("renders a useful image description and accessible external links", () => {
    const { container } = render(
      <NftPreview
        contractAddress={testAddresses.localNft}
        tokenId="7"
        metadata={{
          contractAddress: testAddresses.localNft,
          tokenId: "7",
          metadataName: "Demo token",
          imageUrl: "https://images.example/demo.png",
          tokenUriGatewayUrl: "https://metadata.example/7",
          externalUrl: "https://collection.example/7",
          status: "loaded"
        }}
      />
    );

    expect(screen.getByRole("img", { name: "NFT preview: Demo token" })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("min-w-0");
    expect(screen.getByRole("link", { name: /Open token metadata for Demo token/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the external NFT page for Demo token/ })).toBeInTheDocument();
  });

  it("keeps a stable local fallback when metadata or the image is unavailable", () => {
    const rendered = render(
      <NftPreview contractAddress={testAddresses.localNft} tokenId="0" />
    );

    expect(screen.getByText("NFT preview")).toBeInTheDocument();
    expect(screen.getByText("Metadata not loaded")).toBeInTheDocument();

    rendered.rerender(
      <NftPreview
        contractAddress={testAddresses.localNft}
        tokenId="0"
        metadata={{
          contractAddress: testAddresses.localNft,
          tokenId: "0",
          metadataName: "Broken image token",
          imageUrl: "https://images.example/broken.png",
          status: "loaded"
        }}
      />
    );

    fireEvent.error(screen.getByRole("img", { name: "NFT preview: Broken image token" }));
    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("does not render unsupported external schemes as links", () => {
    render(
      <NftPreview
        contractAddress={testAddresses.localNft}
        tokenId="8"
        metadata={{
          contractAddress: testAddresses.localNft,
          tokenId: "8",
          tokenUriGatewayUrl: "javascript:alert(1)",
          externalUrl: "data:text/html,unsafe",
          status: "no-image"
        }}
      />
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
