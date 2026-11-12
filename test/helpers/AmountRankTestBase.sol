// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuctionHouse} from "../../src/AuctionHouse.sol";
import {DistributionVault} from "../../src/DistributionVault.sol";
import {EscrowVault} from "../../src/EscrowVault.sol";
import {NFTVault} from "../../src/NFTVault.sol";
import {ParamsController} from "../../src/ParamsController.sol";
import {ReputationAdapter} from "../../src/ReputationAdapter.sol";
import {ERC721Mock} from "../mocks/ERC721Mock.sol";
import {AuctionHouseEconomicHarness} from "../harness/AuctionHouseEconomicHarness.sol";

interface VmAmountRank {
    function deal(address account, uint256 balance) external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 timestamp) external;
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonUint(string calldata json, string calldata key) external pure returns (uint256);
    function parseJson(string calldata json, string calldata key) external pure returns (bytes memory);
    function toString(uint256 value) external pure returns (string memory);
}

abstract contract AmountRankTestBase {
    VmAmountRank internal constant vm = VmAmountRank(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant SELLER = address(0xA11CE);
    address internal constant FEE = address(0xFEE);
    uint256 internal constant Q = 1 << 136;
    ParamsController internal params;
    NFTVault internal nftVault;
    EscrowVault internal escrow;
    DistributionVault internal distribution;
    ReputationAdapter internal reputation;
    AuctionHouseEconomicHarness internal house;
    ERC721Mock internal nft;

    function setUp() public virtual {
        vm.warp(1 days);
        params = new ParamsController(address(this));
        nftVault = new NFTVault(address(this));
        escrow = new EscrowVault(address(this));
        distribution = new DistributionVault(address(this));
        reputation = new ReputationAdapter(address(this));
        house = new AuctionHouseEconomicHarness(address(this), params, nftVault, escrow, distribution, reputation, FEE);
        nftVault.setAuctionHouse(address(house));
        escrow.setAuctionHouse(address(house));
        distribution.setAuctionHouse(address(house));
        nft = new ERC721Mock("Amount Rank Test", "ART");
    }

    function _create(uint256 tokenId, uint256 startPrice) internal returns (uint256 id) {
        nft.mint(SELLER, tokenId);
        vm.startPrank(SELLER);
        nft.approve(address(nftVault), tokenId);
        id = house.createAuction(address(nft), tokenId, startPrice, 1 hours);
        vm.stopPrank();
    }

    function _bid(uint256 id, address bidder, uint256 cap) internal {
        uint256 delta = cap - escrow.capOf(id, bidder);
        vm.deal(bidder, delta);
        vm.prank(bidder);
        house.placeBid{value: delta}(id, cap);
    }

    function _finish(uint256 id) internal {
        vm.warp(uint256(house.getAuction(id).endTime) + 1);
        house.finalizeAuction(id);
    }

    function _actor(uint256 index) internal pure returns (address) {
        return address(uint160(0x10000 + index));
    }

    function _eq(uint256 actual, uint256 expected, string memory reason) internal pure {
        require(actual == expected, reason);
    }
}
