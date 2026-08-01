// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LocalERC721} from "../script/mocks/LocalERC721.sol";
import {IERC721Receiver} from "../src/interfaces/IERC721.sol";

interface VmBaseSepoliaSmokeNftTest {
    function prank(address sender) external;
}

contract BaseSepoliaSmokeNftTest is IERC721Receiver {
    VmBaseSepoliaSmokeNftTest private constant vm =
        VmBaseSepoliaSmokeNftTest(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant SELLER = address(0xA11CE);

    function testSmokeNftCanBeMintedApprovedAndSafelyTransferred() external {
        LocalERC721 nft = new LocalERC721("BidBack Base Sepolia Smoke NFT - No Value", "BB-SMOKE");
        uint256 tokenId = nft.mint(SELLER);

        require(tokenId == 1, "unexpected token id");
        require(nft.ownerOf(tokenId) == SELLER, "seller does not own token");

        vm.prank(SELLER);
        nft.approve(address(this), tokenId);
        require(nft.getApproved(tokenId) == address(this), "approval missing");

        nft.safeTransferFrom(SELLER, address(this), tokenId);
        require(nft.ownerOf(tokenId) == address(this), "safe transfer failed");
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
