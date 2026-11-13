// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AmountRankTestBase} from "./helpers/AmountRankTestBase.sol";
import {AuctionHouse, AmountTooLarge} from "../src/AuctionHouse.sol";
import {ParamsController} from "../src/ParamsController.sol";

contract AmountRankAllocationTest is AmountRankTestBase {
    struct VectorBid { uint256 bidderIndex; uint256 newCapWei; }

    function testIndependentOracleVectors() external {
        string memory json = vm.readFile("./test/fixtures/amount-rank-vectors.json");
        _eq(vm.parseJsonUint(json, ".schemaVersion"), 1, "oracle schema");
        _eq(vm.parseJsonUint(json, ".scoreScale"), Q, "oracle score scale");
        _eq(vm.parseJsonUint(json, ".maxAmount"), house.MAX_AMOUNT(), "oracle monetary bound");
        uint256 count = vm.parseJsonUint(json, ".vectorCount");
        require(count >= 28, "required historical and boundary vectors");
        for (uint256 i = 0; i < count; ++i) _checkVector(json, string.concat(".vectors[", vm.toString(i), "]"));
    }

    function _checkVector(string memory json, string memory key) internal view {
        uint256 pool = vm.parseJsonUint(json, string.concat(key, ".poolWei"));
        uint16 h = uint16(vm.parseJsonUint(json, string.concat(key, ".h")));
        uint256 length = vm.parseJsonUint(json, string.concat(key, ".bidderCount"));
        uint256 winner = vm.parseJsonUint(json, string.concat(key, ".winnerIndex"));
        VectorBid[] memory bids = abi.decode(vm.parseJson(json, string.concat(key, ".bids")), (VectorBid[]));
        uint256[] memory scores = new uint256[](length);
        uint256[] memory caps = new uint256[](length);
        for (uint256 i = 0; i < bids.length; ++i) {
            VectorBid memory bid = bids[i];
            scores[bid.bidderIndex] += house.exposedScoreIncrement(bid.newCapWei - caps[bid.bidderIndex], h, i + 1);
            caps[bid.bidderIndex] = bid.newCapWei;
        }
        uint256 denominator;
        for (uint256 i = 0; i < length; ++i) {
            string memory index = string.concat("[", vm.toString(i), "]");
            _eq(scores[i], vm.parseJsonUint(json, string.concat(key, ".expectedScores", index)), "oracle score");
            if (i == winner) scores[i] = 0;
            denominator += scores[i];
        }
        _eq(denominator, vm.parseJsonUint(json, string.concat(key, ".expectedDenominator")), "oracle denominator");
        (uint256[] memory rewards, uint256 assigned) = house.exposedAllocateRewards(scores, pool);
        for (uint256 i = 0; i < length; ++i) {
            string memory index = string.concat("[", vm.toString(i), "]");
            _eq(rewards[i], vm.parseJsonUint(json, string.concat(key, ".expectedRewards", index)), "oracle reward");
            uint256 remainder = denominator == 0 ? 0 : mulmod(pool, scores[i], denominator);
            _eq(remainder, vm.parseJsonUint(json, string.concat(key, ".expectedRemainders", index)), "oracle remainder");
        }
        _eq(assigned, vm.parseJsonUint(json, string.concat(key, ".expectedAllocated")), "oracle allocated");
        _eq(pool - assigned, vm.parseJsonUint(json, string.concat(key, ".expectedUnallocated")), "oracle unallocated");
    }

    function testOwnCapDeltaGlobalRankAndWholeWinnerExclusion() external {
        uint256 id = _create(1, 0);
        _bid(id, _actor(0), 100);
        _bid(id, _actor(1), 200);
        _bid(id, _actor(0), 300);
        _bid(id, _actor(2), 400);
        _eq(house.bidderScores(id, _actor(0)), 100 * Q + 200 * Q * 4 / 6, "rebid adds own delta at global rank3");
        _eq(house.bidderScores(id, _actor(1)), 200 * Q * 4 / 5, "rank2 including eventual winner history");
        _bid(id, _actor(0), 500);
        _eq(house.bidderScores(id, _actor(0)), 100 * Q + 200 * Q * 4 / 6 + 200 * Q * 4 / 8, "winner retains history for audit");
        (address[] memory recipients,, uint256 assigned) = house.exposedBuildDistribution(id, 17);
        _eq(assigned, 17, "full abstract pool allocated");
        _eq(recipients.length, 2, "both positive losers");
        require(recipients[0] == _actor(1) && recipients[1] == _actor(2), "entire winner score excluded");
    }

    function testRemainderTiesUseImmutableParticipationOrder() external view {
        uint256[] memory scores = new uint256[](3);
        scores[0] = 1; scores[1] = 1; scores[2] = 1;
        (uint256[] memory rewards, uint256 assigned) = house.exposedAllocateRewards(scores, 2);
        _eq(assigned, 2, "full tiny pool");
        _eq(rewards[0], 1, "first tie");
        _eq(rewards[1], 1, "second tie");
        _eq(rewards[2], 0, "last tie rounds to zero");
    }

    function testRebidDoesNotReorderParticipantsAndTieWinner() external {
        uint256 id = _create(2, 0);
        _bid(id, _actor(0), 100);
        _bid(id, _actor(1), 200);
        _bid(id, _actor(0), 300);
        address[] memory order = house.getParticipants(id);
        require(order[0] == _actor(0) && order[1] == _actor(1), "rebids preserve first participation");
    }

    function testZeroPoolNoBidsAndOnlyWinnerAllocateZero() external {
        uint256 id = _create(3, 0);
        (,, uint256 none) = house.exposedBuildDistribution(id, 5);
        _eq(none, 0, "no bids");
        _bid(id, _actor(0), 10);
        (,, uint256 winnerOnly) = house.exposedBuildDistribution(id, 5);
        _eq(winnerOnly, 0, "no losers");
        _bid(id, _actor(1), 20);
        (,, uint256 zero) = house.exposedBuildDistribution(id, 0);
        _eq(zero, 0, "zero pool");
    }

    function testMaxAmountBoundAndLargestAggregateScores() external {
        uint256 maxAmount = house.MAX_AMOUNT();
        uint256 id = _create(4, maxAmount);
        _bid(id, _actor(0), maxAmount);
        _eq(house.bidderScores(id, _actor(0)), maxAmount * Q, "maximum first score fits");
        uint256[] memory scores = new uint256[](256);
        for (uint256 i = 0; i < 256; ++i) scores[i] = maxAmount * Q;
        (uint256[] memory rewards, uint256 assigned) = house.exposedAllocateRewards(scores, maxAmount);
        _eq(assigned, maxAmount, "aggregate strictly below uint256");
        uint256 sum;
        for (uint256 i = 0; i < rewards.length; ++i) sum += rewards[i];
        _eq(sum, maxAmount, "large-product allocation conservation");
        nft.mint(SELLER, 5);
        vm.startPrank(SELLER);
        nft.approve(address(nftVault), 5);
        vm.expectRevert(AmountTooLarge.selector);
        house.createAuction(address(nft), 5, maxAmount + 1, 1 hours);
        vm.stopPrank();
        vm.expectRevert(AmountTooLarge.selector);
        vm.prank(_actor(1));
        house.placeBid(id, maxAmount + 1);
    }

    function testRejectedDepositRollsBackRankScoreAndParticipation() external {
        uint256 id = _create(6, 0);
        _bid(id, _actor(0), 100);
        uint256 beforeScore = house.bidderScores(id, _actor(0));
        vm.expectRevert();
        vm.prank(_actor(0));
        house.placeBid(id, 200);
        _eq(house.bidderScores(id, _actor(0)), beforeScore, "failed rebid score rolled back");
        _eq(escrow.capOf(id, _actor(0)), 100, "failed rebid cap rolled back");
        vm.expectRevert();
        vm.prank(_actor(1));
        house.placeBid(id, 200);
        _eq(house.bidderScores(id, _actor(1)), 0, "failed new bidder score rolled back");
        _eq(house.getAuction(id).participantCount, 1, "failed participant rolled back");
        _eq(house.getAuction(id).bidCount, 1, "failed rank rolled back");
        _eq(house.getBidCount(id), 1, "failed history rolled back");
        _bid(id, _actor(1), 200);
        _eq(house.bidderScores(id, _actor(1)), 160 * Q, "next valid bid still rank2");
    }

    function testSoftnessMaximumAndRankBoundary() external view {
        uint16 h = type(uint16).max;
        uint256 maxAmount = house.MAX_AMOUNT();
        _eq(house.exposedScoreIncrement(maxAmount, h, 1), maxAmount * Q, "hmax first weight one");
        uint256 later = house.exposedScoreIncrement(1, 1, (1 << 21) - 1);
        require(later > 0, "last bounded rank retains positive score");
    }

    function testFuzzHamiltonConservationAndQuota(uint112 a, uint112 b, uint112 c, uint112 rawPool) external view {
        uint256[] memory scores = new uint256[](3);
        scores[0] = uint256(a) * Q;
        scores[1] = uint256(b) * Q;
        scores[2] = uint256(c) * Q;
        uint256 denominator = scores[0] + scores[1] + scores[2];
        uint256 pool = uint256(rawPool);
        (uint256[] memory rewards, uint256 assigned) = house.exposedAllocateRewards(scores, pool);
        uint256 sum;
        for (uint256 i = 0; i < 3; ++i) {
            sum += rewards[i];
            if (denominator == 0) _eq(rewards[i], 0, "zero score reward");
            else {
                // Native products fit: pool,a,b,c <= 2^112-1. This independent
                // reference avoids calling FullMath to calculate its own expectation.
                uint256 floorReward = pool * (scores[i] / Q) / (denominator / Q);
                require(rewards[i] >= floorReward && rewards[i] <= floorReward + 1, "Hamilton quota");
                if (scores[i] == 0) _eq(rewards[i], 0, "zero weight excluded");
            }
        }
        _eq(sum, assigned, "sum equals assigned");
        _eq(assigned, denominator == 0 ? 0 : pool, "full pool conservation");
    }
}
