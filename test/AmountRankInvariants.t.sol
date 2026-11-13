// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AmountRankTestBase, VmAmountRank} from "./helpers/AmountRankTestBase.sol";
import {AuctionHouse} from "../src/AuctionHouse.sol";
import {AuctionHouseEconomicHarness} from "./harness/AuctionHouseEconomicHarness.sol";
import {ParamsController} from "../src/ParamsController.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {DistributionVault} from "../src/DistributionVault.sol";

/// @dev Randomized state transitions with ghost cash flows independent of reserves.
contract AmountRankHandler {
    VmAmountRank private constant vm = VmAmountRank(address(uint160(uint256(keccak256("hevm cheat code")))));
    AuctionHouseEconomicHarness public immutable house;
    ParamsController public immutable params;
    EscrowVault public immutable escrow;
    DistributionVault public immutable distribution;
    uint256 public immutable id;
    address private constant SELLER = address(0xA11CE);
    address private constant FEE = address(0xFEE);
    uint256 public deposited;
    uint256 public paid;
    uint256 public validBids;

    constructor(AuctionHouseEconomicHarness h, ParamsController p, EscrowVault e, DistributionVault d, uint256 auctionId) {
        house = h; params = p; escrow = e; distribution = d; id = auctionId;
        deposited = address(e).balance;
        validBids = h.getAuction(auctionId).bidCount;
    }

    function bid(uint256 actorSeed, uint64 jump) external {
        AuctionHouse.Auction memory a = house.getAuction(id);
        if (a.state != AuctionHouse.State.OPEN || block.timestamp >= a.endTime || params.paused()) return;
        address actor = address(uint160(0x10000 + actorSeed % 8));
        uint256 cap = house.minimumNextBid(id) + uint256(jump) % 1 ether;
        if (cap > house.MAX_AMOUNT()) return;
        uint256 delta = cap - escrow.capOf(id, actor);
        vm.deal(actor, delta);
        vm.prank(actor);
        house.placeBid{value: delta}(id, cap);
        deposited += delta;
        ++validBids;
    }

    function togglePause(bool paused) external { params.setPaused(paused); }

    function updateFutureSoftness(uint16 rawH) external {
        ParamsController.Params memory p = params.params();
        p.rankSoftness = rawH == 0 ? 1 : rawH;
        params.setParams(p);
    }

    function finish() external {
        AuctionHouse.Auction memory a = house.getAuction(id);
        if (a.state == AuctionHouse.State.FINALIZED) return;
        vm.warp(uint256(a.endTime) + 1);
        house.finalizeAuction(id);
    }

    function refund(uint256 actorSeed) external {
        address actor = address(uint160(0x10000 + actorSeed % 8));
        if (escrow.refundClaimed(id, actor) || escrow.refundableAmount(id, actor) == 0) return;
        uint256 beforeBalance = address(escrow).balance;
        vm.prank(actor);
        escrow.claimRefund(id);
        paid += beforeBalance - address(escrow).balance;
    }

    function reward(uint256 actorSeed) external {
        address actor = address(uint160(0x10000 + actorSeed % 8));
        if (distribution.claimed(id, actor) || distribution.entitlementOf(id, actor) == 0) return;
        uint256 beforeBalance = address(escrow).balance;
        vm.prank(actor);
        distribution.claim(id);
        paid += beforeBalance - address(escrow).balance;
    }

    function withdrawSeller() external {
        if (escrow.sellerCredits(SELLER) == 0) return;
        uint256 beforeBalance = address(escrow).balance;
        vm.prank(SELLER);
        escrow.withdrawSellerProceeds();
        paid += beforeBalance - address(escrow).balance;
    }

    function withdrawFee() external {
        if (escrow.protocolFeeCredits(FEE) == 0) return;
        uint256 beforeBalance = address(escrow).balance;
        vm.prank(FEE);
        escrow.withdrawProtocolFees();
        paid += beforeBalance - address(escrow).balance;
    }

    function claimNft() external {
        AuctionHouse.Auction memory a = house.getAuction(id);
        if (a.state != AuctionHouse.State.FINALIZED || a.nftClaimed) return;
        vm.prank(a.highestBidder);
        house.claimNft(id);
    }

    function rejectUnfundedBid(uint256 actorSeed) external {
        AuctionHouse.Auction memory a = house.getAuction(id);
        if (a.state != AuctionHouse.State.OPEN || block.timestamp >= a.endTime || params.paused()) return;
        address actor = address(uint160(0x10000 + actorSeed % 8));
        uint256 cap = house.minimumNextBid(id);
        vm.prank(actor);
        (bool success,) = address(house).call(abi.encodeCall(house.placeBid, (id, cap)));
        require(!success, "unfunded cap accepted");
        require(house.getAuction(id).bidCount == validBids, "failed call changed rank");
    }
}

contract AmountRankStatefulInvariants is AmountRankTestBase {
    AmountRankHandler private handler;
    uint256 private auctionId;

    function setUp() public override {
        super.setUp();
        auctionId = _create(100, 1 ether);
        _bid(auctionId, _actor(0), 1 ether);
        _bid(auctionId, _actor(1), 2 ether);
        _bid(auctionId, _actor(2), 3 ether);
        handler = new AmountRankHandler(house, params, escrow, distribution, auctionId);
        params.transferOwnership(address(handler));
    }

    // Foundry's native invariant target discovery, without a new test dependency.
    function targetContracts() external view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function invariant_cashFlowsAndLiabilitiesAreSolvent() external view {
        _eq(address(escrow).balance + handler.paid(), handler.deposited(), "ghost cash-flow conservation");
        AuctionHouse.Auction memory a = house.getAuction(auctionId);
        uint256 liabilities;
        if (a.state != AuctionHouse.State.FINALIZED) {
            for (uint256 i = 0; i < 8; ++i) liabilities += escrow.capOf(auctionId, _actor(i));
        } else {
            (,,,,,, uint256 reserve) = escrow.settlements(auctionId);
            liabilities = reserve + escrow.sellerCredits(SELLER) + escrow.protocolFeeCredits(FEE);
            for (uint256 i = 0; i < 8; ++i) {
                address actor = _actor(i);
                if (!escrow.refundClaimed(auctionId, actor)) liabilities += escrow.refundableAmount(auctionId, actor);
            }
        }
        _eq(address(escrow).balance, liabilities, "escrow exactly covers outstanding liabilities");
    }

    function invariant_onlineScoresRankAndSnapshotsRemainBounded() external view {
        AuctionHouse.Auction memory a = house.getAuction(auctionId);
        _eq(a.bidCount, handler.validBids(), "rank equals accepted bids");
        _eq(house.getBidCount(auctionId), a.bidCount, "records and global rank agree");
        _eq(uint256(house.getAuctionParams(auctionId).rankSoftness), 4, "governance cannot alter existing softness");
        for (uint256 i = 0; i < 8; ++i) {
            uint256 cap = escrow.capOf(auctionId, _actor(i));
            uint256 score = house.bidderScores(auctionId, _actor(i));
            require(score <= cap * Q, "score exceeds fully weighted cap");
            if (cap != 0) require(score != 0, "accepted participant has positive score");
        }
    }

    function invariant_fullFundedPoolAndWholeWinnerExcluded() external view {
        AuctionHouse.Auction memory a = house.getAuction(auctionId);
        if (a.state != AuctionHouse.State.FINALIZED) return;
        (,,, uint256 finalPrice, uint256 sellerProceeds, uint256 fee, uint256 reserve) = escrow.settlements(auctionId);
        uint256 premium = finalPrice - a.startPrice;
        _eq(fee, premium * 500 / 10_000, "single gross premium fee");
        uint256 pool = (premium - fee) * 5_000 / 10_000;
        (, uint256 assigned, uint256 claimed) = distribution.distributions(auctionId);
        _eq(assigned, pool, "all funded pool assigned");
        _eq(reserve + claimed, assigned, "reserve tracks unclaimed entitlements");
        _eq(sellerProceeds + fee + assigned, finalPrice, "price conservation");
        _eq(distribution.entitlementOf(auctionId, a.highestBidder), 0, "winner excluded");
        uint256 sum;
        for (uint256 i = 0; i < 8; ++i) sum += distribution.entitlementOf(auctionId, _actor(i));
        _eq(sum, assigned, "entitlements conserve pool");
    }
}

contract AdversarialAmountRankClaimant {
    AuctionHouse public immutable house;
    EscrowVault public immutable escrow;
    DistributionVault public immutable distribution;
    uint256 public id;
    bool public rejectPayment;
    bool public reenter;
    bool public nestedSucceeded;
    bool public rewardMode;

    constructor(AuctionHouse h, EscrowVault e, DistributionVault d) { house = h; escrow = e; distribution = d; }
    function bid(uint256 auctionId, uint256 cap) external payable { id = auctionId; house.placeBid{value: msg.value}(id, cap); }
    function configure(bool reject, bool attack, bool reward) external {
        rejectPayment = reject; reenter = attack; rewardMode = reward;
    }
    function claimRefund() external { escrow.claimRefund(id); }
    function claimReward() external { distribution.claim(id); }
    receive() external payable {
        require(!rejectPayment, "REJECT_PAYMENT");
        if (reenter) {
            bytes memory callData = rewardMode ? abi.encodeCall(distribution.claim, (id)) : abi.encodeCall(escrow.claimRefund, (id));
            address target = rewardMode ? address(distribution) : address(escrow);
            (nestedSucceeded,) = target.call(callData);
        }
    }
}

contract AmountRankAccountingTest is AmountRankTestBase {
    event GasMeasured(string scenario, uint256 callGas);

    function testTransfersFailAndReentryPreserveRefundsAndRewardsDuringPause() external {
        uint256 id = _create(1, 1 ether);
        AdversarialAmountRankClaimant actor = new AdversarialAmountRankClaimant(house, escrow, distribution);
        vm.deal(address(this), 1 ether);
        actor.bid{value: 1 ether}(id, 1 ether);
        _bid(id, _actor(0), 2 ether);
        params.setPaused(true);
        _finish(id);
        uint256 beforeBalance = address(escrow).balance;
        actor.configure(true, false, false);
        vm.expectRevert(); actor.claimRefund();
        require(!escrow.refundClaimed(id, address(actor)), "failed refund remains claimable");
        _eq(address(escrow).balance, beforeBalance, "failed refund leaves cash intact");
        actor.configure(false, true, false);
        actor.claimRefund();
        require(!actor.nestedSucceeded(), "refund reentry rejected");
        _eq(address(escrow).balance, beforeBalance - 1 ether, "refund paid once");
        uint256 reward = distribution.entitlementOf(id, address(actor));
        _eq(reward, 0.475 ether, "sole loser gets full net pool");
        actor.configure(true, false, true);
        vm.expectRevert(); actor.claimReward();
        require(!distribution.claimed(id, address(actor)), "failed reward remains claimable");
        (, , uint256 claimed) = distribution.distributions(id);
        _eq(claimed, 0, "failed reward rolls back claimed total");
        (,,,,,, uint256 reserve) = escrow.settlements(id);
        _eq(reserve, reward, "failed reward restores reserve");
        actor.configure(false, true, true);
        actor.claimReward();
        require(!actor.nestedSucceeded(), "reward reentry rejected");
        vm.expectRevert(); actor.claimReward();
        vm.expectRevert(); actor.claimRefund();
        vm.prank(SELLER); escrow.withdrawSellerProceeds();
        vm.prank(FEE); escrow.withdrawProtocolFees();
        _eq(address(escrow).balance, 0, "all outstanding claims paid");
        vm.prank(_actor(0)); house.claimNft(id);
        require(nft.ownerOf(1) == _actor(0), "paused NFT exit");
    }

    function testFuzzEndToEndAccountingAndClaimOrder(uint96 rawA, uint96 rawB, bool rewardFirst) external {
        uint256 start = 1 ether;
        uint256 capA = start + uint256(rawA) % 100 ether;
        uint256 capB = capA + capA / 20 + 1 ether + uint256(rawB) % 100 ether;
        uint256 id = _create(2, start);
        _bid(id, _actor(0), capA);
        _bid(id, _actor(1), capB);
        params.setPaused(true);
        _finish(id);
        uint256 fee = (capB - start) * 500 / 10_000;
        uint256 pool = (capB - start - fee) / 2;
        _eq(distribution.entitlementOf(id, _actor(0)), pool, "sole loser full pool");
        _eq(escrow.refundableAmount(id, _actor(0)), capA, "loser fully refundable");
        _eq(escrow.sellerCredits(SELLER), capB - fee - pool, "seller net proceeds");
        if (rewardFirst) { vm.prank(_actor(0)); distribution.claim(id); }
        vm.prank(_actor(0)); escrow.claimRefund(id);
        if (!rewardFirst) { vm.prank(_actor(0)); distribution.claim(id); }
        vm.prank(SELLER); escrow.withdrawSellerProceeds();
        vm.prank(FEE); escrow.withdrawProtocolFees();
        _eq(address(escrow).balance, 0, "claim order leaves no trapped balance");
    }

    function testGasFinalize64Participants() external { _measureFinalize(64, 1, 0); }
    function testGasFinalize256Participants() external { _measureFinalize(256, 2, 0); }
    function testGasFinalizeAfterLongRebids() external { _measureFinalize(64, 3, 512); }

    function _measureFinalize(uint16 count, uint256 token, uint256 rebids) internal {
        ParamsController.Params memory p = params.params();
        p.maxParticipants = count;
        p.minBidIncrementBps = 1;
        p.minPremiumNet = 0;
        params.setParams(p);
        uint256 id = _create(token, 1 ether);
        for (uint256 i = 0; i < count; ++i) _bid(id, _actor(i), house.minimumNextBid(id) + 1 ether);
        for (uint256 i = 0; i < rebids; ++i) _bid(id, _actor(i % count), house.minimumNextBid(id) + 1 ether);
        vm.warp(uint256(house.getAuction(id).endTime) + 1);
        uint256 beforeGas = gasleft();
        house.finalizeAuction(id);
        uint256 used = beforeGas - gasleft();
        emit GasMeasured(rebids == 0 ? (count == 64 ? "participants64" : "participants256") : "participants64-rebids512", used);
        (, uint256 assigned,) = distribution.distributions(id);
        (,,,, uint256 sellerProceeds, uint256 fee, uint256 reserve) = escrow.settlements(id);
        _eq(reserve, assigned, "gas case reserve");
        _eq(sellerProceeds + fee + assigned, house.getAuction(id).highestBid, "gas case accounting");
    }
}
