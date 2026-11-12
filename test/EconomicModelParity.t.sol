// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuctionHouse} from "../src/AuctionHouse.sol";
import {DistributionVault} from "../src/DistributionVault.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {NFTVault} from "../src/NFTVault.sol";
import {ParamsController} from "../src/ParamsController.sol";
import {ReputationAdapter} from "../src/ReputationAdapter.sol";
import {ERC721Mock} from "./mocks/ERC721Mock.sol";
import {AuctionHouseEconomicHarness} from "./harness/AuctionHouseEconomicHarness.sol";

interface VmEconomicModel {
    function deal(address account, uint256 newBalance) external;
    function expectRevert() external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
}

// Historical fixture files remain untouched. Stateful vectors below now assert
// approved amount-rank behavior; pure EF/ET/II vectors cover inactive legacy helpers.
contract EconomicModelParityTest {
    VmEconomicModel private constant vm = VmEconomicModel(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant BPS = 10_000;
    uint256 private constant SCALE = 1e18;
    uint256 private constant Q = 1 << 136;
    address private constant SELLER = address(0xA11CE);
    address private constant BIDDER_A = address(0xB01);
    address private constant BIDDER_B = address(0xB02);
    address private constant BIDDER_C = address(0xB03);
    address private constant BIDDER_D = address(0xB04);
    address private constant FEE_RECIPIENT = address(0xFEE);

    ParamsController private params;
    NFTVault private nftVault;
    EscrowVault private escrowVault;
    DistributionVault private distributionVault;
    ReputationAdapter private reputation;
    AuctionHouseEconomicHarness private auctionHouse;
    ERC721Mock private nft;

    function setUp() external {
        vm.warp(1 days);

        params = new ParamsController(address(this));
        nftVault = new NFTVault(address(this));
        escrowVault = new EscrowVault(address(this));
        distributionVault = new DistributionVault(address(this));
        reputation = new ReputationAdapter(address(this));
        auctionHouse = new AuctionHouseEconomicHarness(
            address(this), params, nftVault, escrowVault, distributionVault, reputation, FEE_RECIPIENT
        );

        nftVault.setAuctionHouse(address(auctionHouse));
        escrowVault.setAuctionHouse(address(auctionHouse));
        distributionVault.setAuctionHouse(address(auctionHouse));

        nft = new ERC721Mock("BidBack Economic Vector NFT", "BBEV");
        for (uint256 tokenId = 1; tokenId <= 40; ++tokenId) {
            nft.mint(SELLER, tokenId);
        }

        uint256 balance = 1e40;
        vm.deal(BIDDER_A, balance);
        vm.deal(BIDDER_B, balance);
        vm.deal(BIDDER_C, balance);
        vm.deal(BIDDER_D, balance);
    }

    function testVectorNoBids() external {
        uint256 auctionId = _createAuction(1, 1 ether, 1 hours);
        assertEq(auctionHouse.minimumNextBid(auctionId), 1 ether, "no-bid minimum equals start price");

        vm.warp(block.timestamp + 1 hours + 1);
        auctionHouse.finalizeAuction(auctionId);

        AuctionHouse.Auction memory auction = auctionHouse.getAuction(auctionId);
        (bool settled,,,,,,) = escrowVault.settlements(auctionId);
        (bool opened, uint256 assigned, uint256 claimed) = distributionVault.distributions(auctionId);

        assertTrue(auction.state == AuctionHouse.State.FINALIZED, "no-bid auction finalized");
        assertEq(auction.highestBid, 0, "no final price");
        assertFalse(settled, "no escrow settlement without bids");
        assertFalse(opened, "no distribution without bids");
        assertEq(assigned, 0, "nothing assigned");
        assertEq(claimed, 0, "nothing claimed");
        assertEq(address(escrowVault).balance, 0, "no liabilities");

        vm.prank(SELLER);
        auctionHouse.claimNft(auctionId);
        assertEq(nft.ownerOf(1), SELLER, "seller reclaims NFT");
    }

    function testVectorOneBidderZeroPremium() external {
        uint256 auctionId = _createAuction(2, 1 ether, 1 hours);
        _bid(BIDDER_A, auctionId, 1 ether);
        _finalizeAfter(auctionId, 1 hours + 1);

        (
            bool settled,
            address winner,,
            uint256 finalPrice,
            uint256 sellerProceeds,
            uint256 feeAmount,
            uint256 reserve
        ) = escrowVault.settlements(auctionId);

        assertTrue(settled, "settled");
        assertEq(winner, BIDDER_A, "winner");
        assertEq(finalPrice, 1 ether, "final price");
        assertEq(feeAmount, 0, "zero-premium fee");
        assertEq(reserve, 0, "zero-premium distribution");
        assertEq(sellerProceeds, 1 ether, "seller receives final price");
        assertEq(escrowVault.refundableAmount(auctionId, BIDDER_A), 0, "normal winner has no surplus");
        _assertLiabilities(auctionId, 1 ether, 0);
    }

    function testVectorMinimumBidCeilAndCapDelta() external {
        uint256 auctionId = _createAuction(15, 10_000, 1 hours);
        _bid(BIDDER_A, auctionId, 10_001);

        assertEq(auctionHouse.minimumNextBid(auctionId), 10_502, "minimum bid uses ceil");
        uint256 escrowBefore = address(escrowVault).balance;
        _bid(BIDDER_B, auctionId, 10_502);

        assertEq(address(escrowVault).balance - escrowBefore, 10_502, "new bidder deposits full cap");
        assertEq(escrowVault.capOf(auctionId, BIDDER_A), 10_001, "first cap retained");
        assertEq(escrowVault.capOf(auctionId, BIDDER_B), 10_502, "second cap recorded");
        assertEq(auctionHouse.minimumNextBid(auctionId), 11_028, "next minimum also uses ceil");

        uint256 escrowBeforeStepUp = address(escrowVault).balance;
        _bid(BIDDER_A, auctionId, 11_028);
        assertEq(address(escrowVault).balance - escrowBeforeStepUp, 1_027, "step-up deposits exact delta");
        assertEq(escrowVault.capOf(auctionId, BIDDER_A), 11_028, "stepped cap recorded");
        AuctionHouse.Auction memory auction = auctionHouse.getAuction(auctionId);
        assertEq(auction.startPrice, 10_000, "start price retained");
        assertEq(auction.highestBid, 11_028, "trace final price");
    }

    function testVectorPremiumBelowThreshold() external {
        _assertPremiumThresholdVector(3, 0.01 ether - 1, 0);
    }

    function testVectorPremiumAtThreshold() external {
        _assertPremiumThresholdVector(4, 0.01 ether, 0.005 ether);
    }

    function testVectorPremiumAboveThreshold() external {
        _assertPremiumThresholdVector(5, 0.01 ether + 1, 0.005 ether);
    }

    function testVectorCanonicalAnvilSettlement() external {
        uint256 auctionId = _createAuction(6, 1 ether, 2 hours);
        _bid(BIDDER_A, auctionId, 1.2 ether);
        vm.warp(block.timestamp + 10 minutes);
        _bid(BIDDER_B, auctionId, 1.5 ether);
        vm.warp(block.timestamp + 10 minutes);
        _bid(BIDDER_A, auctionId, 2 ether);

        uint256 candidatePool = auctionHouse.exposedCandidateDistributionPool(auctionId, 0.95 ether);
        assertEq(candidatePool, 0.475 ether, "Anvil candidate pool");

        _finalizeAfter(auctionId, 3 hours);

        (,,,, uint256 sellerProceeds, uint256 feeAmount, uint256 reserve) = escrowVault.settlements(auctionId);
        assertEq(feeAmount, 0.05 ether, "Anvil fee");
        assertEq(reserve, 0.475 ether, "Anvil assigned distribution");
        assertEq(sellerProceeds, 1.475 ether, "Anvil seller proceeds");
        assertEq(escrowVault.refundableAmount(auctionId, BIDDER_B), 1.5 ether, "Anvil full refund");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_B), 0.475 ether, "Anvil reward");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_A), 0, "winner excluded");
        _assertLiabilities(auctionId, 3.5 ether, 1.5 ether);
    }

    function testVectorCanonicalBaseSepoliaSettlement() external {
        uint256 auctionId = _createAuction(7, 0.01 ether, 2 hours);
        _bid(BIDDER_A, auctionId, 0.012 ether);
        _bid(BIDDER_B, auctionId, 0.015 ether);
        _bid(BIDDER_A, auctionId, 0.03 ether);

        uint256 candidatePool = auctionHouse.exposedCandidateDistributionPool(auctionId, 0.019 ether);
        assertEq(candidatePool, 0.0095 ether, "Base candidate pool");

        _finalizeAfter(auctionId, 3 hours);

        (,,,, uint256 sellerProceeds, uint256 feeAmount, uint256 reserve) = escrowVault.settlements(auctionId);
        assertEq(feeAmount, 0.001 ether, "Base fee");
        assertEq(reserve, 0.0095 ether, "Base assigned distribution");
        assertEq(sellerProceeds, 0.0195 ether, "Base seller proceeds");
        assertEq(escrowVault.refundableAmount(auctionId, BIDDER_B), 0.015 ether, "Base full refund");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_B), 0.0095 ether, "Base reward");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_A), 0, "Base winner excluded");
        _assertLiabilities(auctionId, 0.045 ether, 0.015 ether);
    }

    function testVectorMultipleLosersHamiltonAllocatesDust() external {
        uint256 auctionId = _createPureEfTrace(8, 10_000, 10_000, 10_000);

        _assertPureEfComponents(auctionId, BIDDER_A, 62_500_000_000_000_000, 0, 0, 2_500 * Q);
        _assertPureEfComponents(
            auctionId, BIDDER_B, 250_000_000_000_000_000, 0, 200_000_000_000_000_000, 4_000 * Q
        );
        _assertPureEfComponents(
            auctionId, BIDDER_C, 562_500_000_000_000_000, 0, 200_000_000_000_000_000, 5_000 * Q
        );

        _finalizeAfter(auctionId, 2 hours);

        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_A), 2_174, "reward A");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_B), 3_478, "reward B");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_C), 4_348, "reward C");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_D), 0, "winner excluded");

        (, uint256 assigned,) = distributionVault.distributions(auctionId);
        (,,,, uint256 sellerProceeds,, uint256 reserve) = escrowVault.settlements(auctionId);
        assertEq(assigned, 10_000, "Hamilton allocates all dust");
        assertEq(reserve, 10_000, "full pool reserved");
        assertEq(sellerProceeds, 0, "no dust left for seller");
        assertEq(escrowVault.refundableAmount(auctionId, BIDDER_A), 2_500, "refund A independent");
        assertEq(escrowVault.refundableAmount(auctionId, BIDDER_B), 5_000, "refund B independent");
        assertEq(escrowVault.refundableAmount(auctionId, BIDDER_C), 7_500, "refund C independent");
        _assertLiabilities(auctionId, 25_000, 15_000);
    }

    function testVectorLegacyPerUserCapIsInactive() external {
        uint256 auctionId = _createPureEfTrace(9, 4_000, 10_000, 10_000);
        _finalizeAfter(auctionId, 2 hours);

        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_A), 2_174, "amount-rank small reward");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_B), 3_478, "amount-rank middle reward");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_C), 4_348, "legacy per-user cap is inactive");

        (, uint256 assigned,) = distributionVault.distributions(auctionId);
        (,,,, uint256 sellerProceeds,, uint256 reserve) = escrowVault.settlements(auctionId);
        assertEq(assigned, 10_000, "full assigned total");
        assertEq(reserve, 10_000, "reserve equals assigned total");
        assertEq(sellerProceeds, 0, "full pool has no seller remainder");
        _assertLiabilities(auctionId, 25_000, 15_000);
    }

    function testVectorTinyPoolAwardsLargestRemainder() external {
        uint256 auctionId = _createPureEfTrace(10, 10_000, 1, 10_000);
        assertEq(auctionHouse.exposedCandidateDistributionPool(auctionId, 10_000), 1, "one wei pool");
        _finalizeAfter(auctionId, 2 hours);

        (, uint256 assigned,) = distributionVault.distributions(auctionId);
        (,,,, uint256 sellerProceeds,, uint256 reserve) = escrowVault.settlements(auctionId);
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_A), 0, "A rounds to zero");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_B), 0, "B rounds to zero");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_C), 1, "C receives largest remainder wei");
        assertEq(assigned, 1, "tiny pool fully assigned");
        assertEq(reserve, 1, "tiny pool reserved");
        assertEq(sellerProceeds, 9_999, "seller receives price less assigned wei");
    }

    function testVectorTinyCapRetainsPositiveScore() external {
        ParamsController.Params memory p = _pureEfParams(10_000, 10_000);
        params.setParams(p);

        uint256 auctionId = _createAuction(11, 0, 1 hours);
        vm.warp(block.timestamp + 1);
        _bid(BIDDER_A, auctionId, 1);
        _bid(BIDDER_B, auctionId, 2 ether);

        assertEq(auctionHouse.exposedScore(auctionId, BIDDER_A), Q, "one wei retains one Q score at first rank");
        _finalizeAfter(auctionId, 2 hours);

        (, uint256 assigned,) = distributionVault.distributions(auctionId);
        (,,,, uint256 sellerProceeds,, uint256 reserve) = escrowVault.settlements(auctionId);
        assertEq(assigned, 2 ether, "sole loser receives full pool");
        assertEq(reserve, 2 ether, "full pool reserve");
        assertEq(sellerProceeds, 0, "full funded pool is assigned");
        assertEq(escrowVault.refundableAmount(auctionId, BIDDER_A), 1, "full refund remains independent");
    }

    function testVectorFinancialEngagementBoundaries() external view {
        assertEq(auctionHouse.exposedFinancialEngagement(1, 4, SCALE), 62_500_000_000_000_000, "low EF");
        assertEq(auctionHouse.exposedFinancialEngagement(1, 2, SCALE), 250_000_000_000_000_000, "intermediate EF");
        assertEq(
            auctionHouse.exposedFinancialEngagement(2, 1, 800_000_000_000_000_000), 800_000_000_000_000_000, "EF cap"
        );
    }

    function testVectorTimeEngagementBoundaries() external view {
        ParamsController.Params memory p = params.params();
        p.minExposure = 300;

        assertEq(auctionHouse.exposedTimeEngagement(1_000, 1_000, 2_000, p), SCALE, "early ET");
        assertEq(auctionHouse.exposedTimeEngagement(1_500, 1_000, 2_000, p), 500_000_000_000_000_000, "mid ET");
        assertEq(auctionHouse.exposedTimeEngagement(1_800, 1_000, 2_000, p), 0, "late ET below exposure");
        assertEq(auctionHouse.exposedTimeEngagement(2_001, 1_000, 2_000, p), 0, "post-initial-end ET");
    }

    function testVectorFirstBidAfterInitialEndDuringExtensionHasZeroEt() external {
        uint256 auctionId = _createAuction(12, 1 ether, 1 hours);
        AuctionHouse.Auction memory auction = auctionHouse.getAuction(auctionId);

        vm.warp(uint256(auction.initialEndTime) - 1);
        _bid(BIDDER_A, auctionId, 1 ether);

        auction = auctionHouse.getAuction(auctionId);
        assertTrue(auction.endTime > auction.initialEndTime, "auction extended");

        vm.warp(uint256(auction.initialEndTime) + 1);
        _bid(BIDDER_B, auctionId, 1.1 ether);

        assertEq(
            auctionHouse.exposedTimeEngagementForBidder(auctionId, BIDDER_B),
            0,
            "first bid after initial end has zero ET"
        );
        assertEq(auctionHouse.exposedScore(auctionId, BIDDER_B), 1.1 ether * Q * 4 / 5, "late bid still earns rank score");
    }

    function testVectorInteractionIntensityBoundaries() external view {
        ParamsController.Params memory p = params.params();
        assertEq(auctionHouse.exposedInteractionIntensity(0, p), 0, "II zero");
        assertEq(auctionHouse.exposedInteractionIntensity(1, p), 200_000_000_000_000_000, "II one");
        assertEq(auctionHouse.exposedInteractionIntensity(5, p), SCALE, "II max");
        assertEq(auctionHouse.exposedInteractionIntensity(6, p), SCALE, "II above max");
    }

    function testVectorReputationBoundsDoNotChangeScore() external {
        ParamsController.Params memory p = _pureEfParams(10_000, 10_000);
        params.setParams(p);

        uint256 auctionId = _createAuction(13, 0, 1 hours);
        vm.warp(block.timestamp + 1);
        _bid(BIDDER_A, auctionId, 5_000);
        _bid(BIDDER_B, auctionId, 10_000);

        assertEq(auctionHouse.exposedScore(auctionId, BIDDER_A), 5_000 * Q, "default rep is inactive");

        reputation.setReputationBps(BIDDER_A, 5_000);
        assertEq(auctionHouse.exposedScore(auctionId, BIDDER_A), 5_000 * Q, "minimum rep is inactive");

        reputation.setReputationBps(BIDDER_A, 10_000);
        assertEq(auctionHouse.exposedScore(auctionId, BIDDER_A), 5_000 * Q, "explicit default rep is inactive");

        reputation.setReputationBps(BIDDER_A, 15_000);
        assertEq(auctionHouse.exposedScore(auctionId, BIDDER_A), 5_000 * Q, "maximum rep is inactive");
    }

    function testVectorReputationChangeBeforeFinalizationDoesNotChangeNormalization() external {
        ParamsController.Params memory p = _pureEfParams(10_000, 10_000);
        params.setParams(p);

        uint256 auctionId = _createAuction(14, 0, 1 hours);
        vm.warp(block.timestamp + 1);
        _bid(BIDDER_A, auctionId, 7_250);
        _bid(BIDDER_B, auctionId, 14_500);
        _bid(BIDDER_C, auctionId, 21_750);
        _bid(BIDDER_D, auctionId, 29_000);

        reputation.setReputationBps(BIDDER_A, 15_000);

        assertEq(auctionHouse.exposedScore(auctionId, BIDDER_A), 7_250 * Q, "reputation leaves score A unchanged");
        assertEq(auctionHouse.exposedScore(auctionId, BIDDER_B), 11_600 * Q, "score B");
        assertEq(auctionHouse.exposedScore(auctionId, BIDDER_C), 14_500 * Q, "score C");
        _finalizeAfter(auctionId, 2 hours);

        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_A), 6_304, "amount-rank reward A");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_B), 10_087, "reward B");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_C), 12_609, "reward C");
        assertEq(distributionVault.entitlementOf(auctionId, BIDDER_D), 0, "winner excluded");

        (, uint256 assigned,) = distributionVault.distributions(auctionId);
        (,,,, uint256 sellerProceeds,,) = escrowVault.settlements(auctionId);
        assertEq(assigned, 29_000, "full pool unaffected by reputation change");
        assertEq(sellerProceeds, 0, "no unassigned remainder");
    }

    function testVectorCheckedOverflowReverts() external {
        vm.expectRevert();
        auctionHouse.exposedFinancialEngagement(type(uint256).max, type(uint256).max, SCALE);
    }

    function _assertPremiumThresholdVector(uint256 tokenId, uint256 premium, uint256 expectedPool) internal {
        ParamsController.Params memory p = params.params();
        p.bidbackFeeBps = 0;
        p.redistributionBps = 5_000;
        p.perUserRewardCapBps = 10_000;
        p.minBidIncrementBps = 1;
        params.setParams(p);

        uint256 startPrice = 1 ether;
        uint256 auctionId = _createAuction(tokenId, startPrice, 1 hours);
        _bid(BIDDER_A, auctionId, startPrice);
        _bid(BIDDER_B, auctionId, startPrice + premium);

        assertEq(auctionHouse.exposedCandidateDistributionPool(auctionId, premium), expectedPool, "threshold pool");
        _finalizeAfter(auctionId, 2 hours);

        (,,,, uint256 sellerProceeds, uint256 feeAmount, uint256 reserve) = escrowVault.settlements(auctionId);
        assertEq(feeAmount, 0, "threshold fee");
        assertEq(reserve, expectedPool, "threshold assigned reserve");
        assertEq(sellerProceeds, startPrice + premium - expectedPool, "threshold seller proceeds");
        assertEq(escrowVault.refundableAmount(auctionId, BIDDER_A), startPrice, "threshold full refund");
        _assertLiabilities(auctionId, startPrice + startPrice + premium, startPrice);
    }

    function _createPureEfTrace(
        uint256 tokenId,
        uint16 perUserRewardCapBps,
        uint16 redistributionBps,
        uint256 minPremiumNet
    ) internal returns (uint256 auctionId) {
        ParamsController.Params memory p = params.params();
        p.bidbackFeeBps = 0;
        p.redistributionBps = redistributionBps;
        p.minBidIncrementBps = 1;
        p.perUserRewardCapBps = perUserRewardCapBps;
        p.alphaBps = 9_999;
        p.betaBps = 1;
        p.gammaBps = 0;
        p.minExposure = p.minAuctionDuration;
        p.minPremiumNet = minPremiumNet;
        params.setParams(p);

        auctionId = _createAuction(tokenId, 0, 1 hours);
        vm.warp(block.timestamp + 1);
        _bid(BIDDER_A, auctionId, 2_500);
        _bid(BIDDER_B, auctionId, 5_000);
        _bid(BIDDER_C, auctionId, 7_500);
        _bid(BIDDER_D, auctionId, 10_000);
    }

    function _pureEfParams(uint16 perUserRewardCapBps, uint16 redistributionBps)
        internal
        view
        returns (ParamsController.Params memory p)
    {
        p = params.params();
        p.bidbackFeeBps = 0;
        p.redistributionBps = redistributionBps;
        p.minBidIncrementBps = 1;
        p.perUserRewardCapBps = perUserRewardCapBps;
        p.alphaBps = 10_000;
        p.betaBps = 0;
        p.gammaBps = 0;
        p.minExposure = p.minAuctionDuration;
        p.minPremiumNet = 0;
    }

    function _createAuction(uint256 tokenId, uint256 startPrice, uint64 duration) internal returns (uint256 auctionId) {
        vm.startPrank(SELLER);
        nft.approve(address(nftVault), tokenId);
        auctionId = auctionHouse.createAuction(address(nft), tokenId, startPrice, duration);
        vm.stopPrank();
    }

    function _bid(address bidder, uint256 auctionId, uint256 newCap) internal {
        uint256 previousCap = escrowVault.capOf(auctionId, bidder);
        uint256 delta = newCap - previousCap;
        vm.prank(bidder);
        auctionHouse.placeBid{value: delta}(auctionId, newCap);
    }

    function _finalizeAfter(uint256 auctionId, uint256 secondsLater) internal {
        vm.warp(block.timestamp + secondsLater);
        auctionHouse.finalizeAuction(auctionId);
    }

    function _assertLiabilities(uint256 auctionId, uint256 totalCaps, uint256 losingRefunds) internal view {
        (bool settled, address winner,,, uint256 sellerProceeds, uint256 feeAmount, uint256 reserve) =
            escrowVault.settlements(auctionId);
        uint256 winnerRefund = escrowVault.refundableAmount(auctionId, winner);
        assertTrue(settled, "settlement required");
        assertEq(
            losingRefunds + winnerRefund + sellerProceeds + feeAmount + reserve,
            totalCaps,
            "liabilities conserve deposits"
        );
    }

    function _assertPureEfComponents(
        uint256 auctionId,
        address bidder,
        uint256 expectedEf,
        uint256 expectedEt,
        uint256 expectedIi,
        uint256 expectedScore
    ) internal view {
        (uint256 ef, uint256 et, uint256 ii, uint256 score) = auctionHouse.exposedScoreComponents(auctionId, bidder);
        assertEq(ef, expectedEf, "EF component");
        assertEq(et, expectedEt, "ET component");
        assertEq(ii, expectedIi, "II component");
        assertEq(score, expectedScore, "final score");
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

    function assertFalse(bool condition, string memory message) internal pure {
        require(!condition, message);
    }
}
