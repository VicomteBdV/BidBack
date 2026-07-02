// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuctionHouse} from "../src/AuctionHouse.sol";
import {DistributionVault} from "../src/DistributionVault.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {NFTVault} from "../src/NFTVault.sol";
import {ParamsController} from "../src/ParamsController.sol";
import {ReputationAdapter} from "../src/ReputationAdapter.sol";
import {ERC721Mock} from "./mocks/ERC721Mock.sol";

interface VmFeeRecipientSnapshots {
    function deal(address account, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
}

contract AuctionFeeRecipientSnapshotsTest {
    VmFeeRecipientSnapshots private constant vm =
        VmFeeRecipientSnapshots(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant SELLER = address(0xA11CE);
    address private constant BIDDER_ONE = address(0xB01);
    address private constant BIDDER_TWO = address(0xB02);
    address private constant FEE_RECIPIENT = address(0xFEE);
    address private constant NEW_FEE_RECIPIENT = address(0xFEE2);
    address private constant LATER_FEE_RECIPIENT = address(0xFEE3);

    ParamsController private params;
    NFTVault private nftVault;
    EscrowVault private escrowVault;
    DistributionVault private distributionVault;
    ReputationAdapter private reputation;
    AuctionHouse private auctionHouse;
    ERC721Mock private nft;

    function setUp() external {
        vm.warp(1 days);

        params = new ParamsController(address(this));
        nftVault = new NFTVault(address(this));
        escrowVault = new EscrowVault(address(this));
        distributionVault = new DistributionVault(address(this));
        reputation = new ReputationAdapter(address(this));
        auctionHouse = new AuctionHouse(
            address(this),
            params,
            nftVault,
            escrowVault,
            distributionVault,
            reputation,
            FEE_RECIPIENT
        );

        nftVault.setAuctionHouse(address(auctionHouse));
        escrowVault.setAuctionHouse(address(auctionHouse));
        distributionVault.setAuctionHouse(address(auctionHouse));

        nft = new ERC721Mock("BidBack Fee Snapshot NFT", "BBFS");
        for (uint256 tokenId = 1; tokenId <= 10; ++tokenId) {
            nft.mint(SELLER, tokenId);
        }

        vm.deal(BIDDER_ONE, 20 ether);
        vm.deal(BIDDER_TWO, 20 ether);
    }

    function testFeeRecipientIsSnapshottedAtAuctionCreation() external {
        uint256 auctionId = _createAuction(1, 1 ether, 2 hours);

        assertEq(auctionHouse.feeRecipient(), FEE_RECIPIENT, "global fee recipient starts with initial value");
        assertEq(
            auctionHouse.getAuctionFeeRecipient(auctionId),
            FEE_RECIPIENT,
            "auction snapshots initial fee recipient"
        );

        auctionHouse.setFeeRecipient(NEW_FEE_RECIPIENT);

        assertEq(auctionHouse.feeRecipient(), NEW_FEE_RECIPIENT, "global fee recipient updates");
        assertEq(
            auctionHouse.getAuctionFeeRecipient(auctionId),
            FEE_RECIPIENT,
            "existing auction keeps fee recipient snapshot"
        );
    }

    function testChangingGlobalFeeRecipientDoesNotModifyExistingAuctionSnapshot() external {
        uint256 auctionId = _createAuction(2, 1 ether, 2 hours);

        auctionHouse.setFeeRecipient(NEW_FEE_RECIPIENT);
        auctionHouse.setFeeRecipient(LATER_FEE_RECIPIENT);

        assertEq(
            auctionHouse.getAuctionFeeRecipient(auctionId),
            FEE_RECIPIENT,
            "existing auction remains tied to creation-time fee recipient"
        );
        assertEq(auctionHouse.feeRecipient(), LATER_FEE_RECIPIENT, "global config remains mutable for future auctions");
    }

    function testNewAuctionsUseUpdatedFeeRecipient() external {
        auctionHouse.setFeeRecipient(NEW_FEE_RECIPIENT);

        uint256 auctionId = _createAuction(3, 1 ether, 2 hours);

        assertEq(
            auctionHouse.getAuctionFeeRecipient(auctionId),
            NEW_FEE_RECIPIENT,
            "new auction snapshots updated global fee recipient"
        );
    }

    function testFinalizationCreditsSnapshottedFeeRecipientAfterGlobalChange() external {
        uint256 auctionId = _createAuction(4, 1 ether, 2 hours);

        auctionHouse.setFeeRecipient(NEW_FEE_RECIPIENT);

        _placeTwoBidsAndFinalize(auctionId);

        assertEq(
            escrowVault.protocolFeeCredits(FEE_RECIPIENT),
            0.025 ether,
            "snapshotted recipient receives protocol fees"
        );
        assertEq(
            escrowVault.protocolFeeCredits(NEW_FEE_RECIPIENT),
            0,
            "updated global recipient does not receive existing auction fees"
        );
    }

    function testAuctionCreatedAfterFeeRecipientUpdateDoesNotCreditOldOrLaterGlobalRecipient() external {
        auctionHouse.setFeeRecipient(NEW_FEE_RECIPIENT);
        uint256 auctionId = _createAuction(5, 1 ether, 2 hours);

        auctionHouse.setFeeRecipient(LATER_FEE_RECIPIENT);

        _placeTwoBidsAndFinalize(auctionId);

        assertEq(
            escrowVault.protocolFeeCredits(NEW_FEE_RECIPIENT),
            0.025 ether,
            "auction settlement credits creation-time fee recipient"
        );
        assertEq(
            escrowVault.protocolFeeCredits(FEE_RECIPIENT),
            0,
            "previous fee recipient does not receive fees for later snapshot"
        );
        assertEq(
            escrowVault.protocolFeeCredits(LATER_FEE_RECIPIENT),
            0,
            "later global recipient does not receive fees for existing auction"
        );
    }

    function _createAuction(uint256 tokenId, uint256 startPrice, uint64 duration) internal returns (uint256 auctionId) {
        vm.startPrank(SELLER);
        nft.approve(address(nftVault), tokenId);
        auctionId = auctionHouse.createAuction(address(nft), tokenId, startPrice, duration);
        vm.stopPrank();
    }

    function _placeTwoBidsAndFinalize(uint256 auctionId) internal {
        vm.prank(BIDDER_ONE);
        auctionHouse.placeBid{value: 1.2 ether}(auctionId, 1.2 ether);

        vm.warp(block.timestamp + 20 minutes);

        vm.prank(BIDDER_TWO);
        auctionHouse.placeBid{value: 1.5 ether}(auctionId, 1.5 ether);

        vm.warp(block.timestamp + 3 hours);
        auctionHouse.finalizeAuction(auctionId);
    }

    function assertEq(uint256 actual, uint256 expected, string memory message) internal pure {
        require(actual == expected, message);
    }

    function assertEq(address actual, address expected, string memory message) internal pure {
        require(actual == expected, message);
    }
}