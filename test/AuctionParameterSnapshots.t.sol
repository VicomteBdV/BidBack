// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuctionHouse} from "../src/AuctionHouse.sol";
import {DistributionVault} from "../src/DistributionVault.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {NFTVault} from "../src/NFTVault.sol";
import {ParamsController} from "../src/ParamsController.sol";
import {ReputationAdapter} from "../src/ReputationAdapter.sol";
import {ERC721Mock} from "./mocks/ERC721Mock.sol";

interface VmSnapshots {
    function deal(address account, uint256 newBalance) external;
    function expectRevert() external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
}

contract AuctionParameterSnapshotsTest {
    VmSnapshots private constant vm = VmSnapshots(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant SELLER = address(0xA11CE);
    address private constant BIDDER_ONE = address(0xB01);
    address private constant BIDDER_TWO = address(0xB02);
    address private constant BIDDER_THREE = address(0xB03);
    address private constant FEE_RECIPIENT = address(0xFEE);

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

        nft = new ERC721Mock("BidBack Snapshot NFT", "BBS");
        for (uint256 tokenId = 1; tokenId <= 20; ++tokenId) {
            nft.mint(SELLER, tokenId);
        }

        vm.deal(BIDDER_ONE, 20 ether);
        vm.deal(BIDDER_TWO, 20 ether);
        vm.deal(BIDDER_THREE, 20 ether);
    }

    function testAuctionParamsAreSnapshottedAtCreation() external {
        ParamsController.Params memory initialParams = params.params();

        uint256 auctionId = _createAuction(1, 1 ether, 2 hours);

        ParamsController.Params memory snapshot = auctionHouse.getAuctionParams(auctionId);
        _assertParamsEqual(snapshot, initialParams, "initial snapshot");

        ParamsController.Params memory changedParams = _changedParams();
        params.setParams(changedParams);

        ParamsController.Params memory unchangedSnapshot = auctionHouse.getAuctionParams(auctionId);
        _assertParamsEqual(unchangedSnapshot, initialParams, "snapshot after global update");
    }

    function testMinimumNextBidUsesAuctionSnapshotAfterGlobalParamsChange() external {
        uint256 auctionId = _createAuction(2, 1 ether, 2 hours);
        _bid(BIDDER_ONE, auctionId, 1 ether);

        ParamsController.Params memory changedParams = params.params();
        changedParams.minBidIncrementBps = 2_000;
        params.setParams(changedParams);

        ParamsController.Params memory snapshot = auctionHouse.getAuctionParams(auctionId);
        assertEq(uint256(snapshot.minBidIncrementBps), 500, "auction keeps original increment bps");

        assertEq(auctionHouse.minimumNextBid(auctionId), 1.05 ether, "minimum bid uses auction snapshot");

        _bid(BIDDER_TWO, auctionId, 1.05 ether);
    }

    function testMaxParticipantsUsesAuctionSnapshotAfterGlobalParamsChange() external {
        uint256 auctionId = _createAuction(3, 1 ether, 2 hours);

        ParamsController.Params memory changedParams = params.params();
        changedParams.maxParticipants = 2;
        params.setParams(changedParams);

        ParamsController.Params memory snapshot = auctionHouse.getAuctionParams(auctionId);
        assertEq(uint256(snapshot.maxParticipants), 64, "auction keeps original max participants");

        _bid(BIDDER_ONE, auctionId, 1 ether);
        _bid(BIDDER_TWO, auctionId, 1.1 ether);
        _bid(BIDDER_THREE, auctionId, 1.3 ether);

        AuctionHouse.Auction memory auction = auctionHouse.getAuction(auctionId);
        assertEq(auction.participantCount, 3, "existing auction uses snapshotted max participants");
    }

    function testFinalizationUsesAuctionSnapshotAfterGlobalFeeAndRedistributionChange() external {
        uint256 auctionId = _createAuction(4, 1 ether, 2 hours);

        _bid(BIDDER_ONE, auctionId, 1.2 ether);

        vm.warp(block.timestamp + 20 minutes);
        _bid(BIDDER_TWO, auctionId, 2 ether);

        ParamsController.Params memory changedParams = params.params();
        changedParams.bidbackFeeBps = 0;
        changedParams.redistributionBps = 10_000;
        changedParams.minPremiumNet = 100 ether;
        params.setParams(changedParams);

        ParamsController.Params memory snapshot = auctionHouse.getAuctionParams(auctionId);
        assertEq(uint256(snapshot.bidbackFeeBps), 500, "auction keeps original fee bps");
        assertEq(uint256(snapshot.redistributionBps), 5_000, "auction keeps original redistribution bps");
        assertEq(snapshot.minPremiumNet, 0.01 ether, "auction keeps original premium threshold");

        vm.warp(block.timestamp + 3 hours);
        auctionHouse.finalizeAuction(auctionId);

        (
            bool settled,
            address winner,
            address settlementDistributionVault,
            uint256 finalPrice,
            uint256 sellerProceeds,
            uint256 feeAmount,
            uint256 distributionReserve
        ) = escrowVault.settlements(auctionId);

        (bool distributionOpened, uint256 totalAssigned, uint256 totalClaimed) =
            distributionVault.distributions(auctionId);

        assertTrue(settled, "settlement finalized");
        assertEq(winner, BIDDER_TWO, "winner recorded");
        assertEq(settlementDistributionVault, address(distributionVault), "distribution vault recorded");
        assertEq(finalPrice, 2 ether, "final price recorded");
        assertEq(feeAmount, 0.05 ether, "fee uses auction snapshot");
        assertEq(distributionReserve, 0.19 ether, "distribution reserve uses auction snapshot and cap");
        assertEq(sellerProceeds, 1.76 ether, "seller proceeds use snapshotted economics");
        assertTrue(distributionOpened, "distribution opened");
        assertEq(totalAssigned, 0.19 ether, "assigned reward uses auction snapshot");
        assertEq(totalClaimed, 0, "nothing claimed yet");
    }

    function testNewAuctionsUseUpdatedGlobalParams() external {
        ParamsController.Params memory changedParams = _changedParams();
        params.setParams(changedParams);

        uint256 auctionId = _createAuction(5, 1 ether, 2 hours);

        ParamsController.Params memory snapshot = auctionHouse.getAuctionParams(auctionId);
        _assertParamsEqual(snapshot, changedParams, "new auction uses updated params");
    }

    function testPauseRemainsGlobalEmergencyControl() external {
        uint256 auctionId = _createAuction(6, 1 ether, 2 hours);
        _bid(BIDDER_ONE, auctionId, 1 ether);

        params.setPaused(true);

        vm.expectRevert();
        vm.prank(BIDDER_TWO);
        auctionHouse.placeBid{value: 1.1 ether}(auctionId, 1.1 ether);

        vm.startPrank(SELLER);
        nft.approve(address(nftVault), 7);
        vm.expectRevert();
        auctionHouse.createAuction(address(nft), 7, 1 ether, 2 hours);
        vm.stopPrank();

        vm.warp(block.timestamp + 3 hours);
        auctionHouse.finalizeAuction(auctionId);

        AuctionHouse.Auction memory auction = auctionHouse.getAuction(auctionId);
        assertTrue(auction.state == AuctionHouse.State.FINALIZED, "pause does not block finalization");
    }

    function _changedParams() internal view returns (ParamsController.Params memory changedParams) {
        changedParams = params.params();
        changedParams.bidbackFeeBps = 1_000;
        changedParams.redistributionBps = 3_000;
        changedParams.minBidIncrementBps = 1_000;
        changedParams.perUserRewardCapBps = 2_500;
        changedParams.maxParticipants = 3;
        changedParams.maxInteractionCount = 8;
        changedParams.antiSnipeWindow = 15 minutes;
        changedParams.antiSnipeExtension = 12 minutes;
        changedParams.maxAntiSnipeExtensions = 3;
        changedParams.minExposure = 10 minutes;
        changedParams.minPremiumNet = 0.02 ether;
    }

    function _createAuction(uint256 tokenId, uint256 startPrice, uint64 duration) internal returns (uint256 auctionId) {
        vm.startPrank(SELLER);
        nft.approve(address(nftVault), tokenId);
        auctionId = auctionHouse.createAuction(address(nft), tokenId, startPrice, duration);
        vm.stopPrank();
    }

    function _bid(address bidder, uint256 auctionId, uint256 amount) internal {
        vm.prank(bidder);
        auctionHouse.placeBid{value: amount}(auctionId, amount);
    }

    function _assertParamsEqual(
        ParamsController.Params memory actual,
        ParamsController.Params memory expected,
        string memory context
    ) internal pure {
        assertEq(uint256(actual.bidbackFeeBps), uint256(expected.bidbackFeeBps), context);
        assertEq(uint256(actual.redistributionBps), uint256(expected.redistributionBps), context);
        assertEq(uint256(actual.minParticipants), uint256(expected.minParticipants), context);
        assertEq(uint256(actual.alphaBps), uint256(expected.alphaBps), context);
        assertEq(uint256(actual.betaBps), uint256(expected.betaBps), context);
        assertEq(uint256(actual.gammaBps), uint256(expected.gammaBps), context);
        assertEq(uint256(actual.minBidIncrementBps), uint256(expected.minBidIncrementBps), context);
        assertEq(uint256(actual.perUserRewardCapBps), uint256(expected.perUserRewardCapBps), context);
        assertEq(uint256(actual.maxParticipants), uint256(expected.maxParticipants), context);
        assertEq(uint256(actual.maxInteractionCount), uint256(expected.maxInteractionCount), context);
        assertEq(uint256(actual.minAuctionDuration), uint256(expected.minAuctionDuration), context);
        assertEq(uint256(actual.antiSnipeWindow), uint256(expected.antiSnipeWindow), context);
        assertEq(uint256(actual.antiSnipeExtension), uint256(expected.antiSnipeExtension), context);
        assertEq(uint256(actual.maxAntiSnipeExtensions), uint256(expected.maxAntiSnipeExtensions), context);
        assertEq(uint256(actual.minExposure), uint256(expected.minExposure), context);
        assertEq(actual.minPremiumNet, expected.minPremiumNet, context);
        assertEq(actual.efCap, expected.efCap, context);
        assertEq(actual.etCap, expected.etCap, context);
        assertEq(actual.iiCap, expected.iiCap, context);
    }

    function assertEq(uint256 actual, uint256 expected, string memory message) internal pure {
        require(actual == expected, message);
    }

    function assertEq(address actual, address expected, string memory message) internal pure {
        require(actual == expected, message);
    }

    function assertTrue(bool condition, string memory message) internal pure {
        require(condition, message);
    }
}