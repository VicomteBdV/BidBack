// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuctionHouse} from "../../src/AuctionHouse.sol";
import {DistributionVault} from "../../src/DistributionVault.sol";
import {EscrowVault} from "../../src/EscrowVault.sol";
import {NFTVault} from "../../src/NFTVault.sol";
import {ParamsController} from "../../src/ParamsController.sol";
import {IReputationAdapter} from "../../src/interfaces/IReputationAdapter.sol";

/// @dev Test-only visibility adapter. Every result delegates to AuctionHouse's
/// existing internal implementation; this contract contains no economic formula.
contract AuctionHouseEconomicHarness is AuctionHouse {
    constructor(
        address initialOwner,
        ParamsController paramsController_,
        NFTVault nftVault_,
        EscrowVault escrowVault_,
        DistributionVault distributionVault_,
        IReputationAdapter reputationAdapter_,
        address feeRecipient_
    )
        AuctionHouse(
            initialOwner,
            paramsController_,
            nftVault_,
            escrowVault_,
            distributionVault_,
            reputationAdapter_,
            feeRecipient_
        )
    {}

    function exposedFinancialEngagement(uint256 maxCap, uint256 finalPrice, uint256 cap)
        external
        pure
        returns (uint256)
    {
        return _financialEngagement(maxCap, finalPrice, cap);
    }

    function exposedTimeEngagement(
        uint64 firstBidTime,
        uint64 startTime,
        uint64 initialEndTime,
        ParamsController.Params calldata p
    ) external pure returns (uint256) {
        return _timeEngagement(firstBidTime, startTime, initialEndTime, p);
    }

    function exposedInteractionIntensity(uint16 significantOverbids, ParamsController.Params calldata p)
        external
        pure
        returns (uint256)
    {
        return _interactionIntensity(significantOverbids, p);
    }

    function exposedCandidateDistributionPool(uint256 auctionId, uint256 premiumNet) external view returns (uint256) {
        ParamsController.Params memory p = this.getAuctionParams(auctionId);
        return _candidateDistributionPool(auctions[auctionId], p, premiumNet);
    }

    function exposedScore(uint256 auctionId, address bidder) external view returns (uint256) {
        ParamsController.Params memory p = this.getAuctionParams(auctionId);
        Modules memory modules = this.getAuctionModules(auctionId);
        return _score(auctionId, bidder, p, modules.reputationAdapter);
    }

    function exposedScoreComponents(uint256 auctionId, address bidder)
        external
        view
        returns (uint256 ef, uint256 et, uint256 ii, uint256 finalScore)
    {
        Auction storage auction = auctions[auctionId];
        BidderStats storage stats = bidderStats[auctionId][bidder];
        ParamsController.Params memory p = this.getAuctionParams(auctionId);
        Modules memory modules = this.getAuctionModules(auctionId);

        ef = _financialEngagement(stats.maxCap, auction.highestBid, p.efCap);
        et = _timeEngagement(stats.firstBidTime, auction.startTime, auction.initialEndTime, p);
        ii = _interactionIntensity(stats.significantOverbids, p);
        finalScore = _score(auctionId, bidder, p, modules.reputationAdapter);
    }

    function exposedTimeEngagementForBidder(uint256 auctionId, address bidder) external view returns (uint256) {
        Auction storage auction = auctions[auctionId];
        BidderStats storage stats = bidderStats[auctionId][bidder];
        ParamsController.Params memory p = this.getAuctionParams(auctionId);
        return _timeEngagement(stats.firstBidTime, auction.startTime, auction.initialEndTime, p);
    }

    function exposedBuildDistribution(uint256 auctionId, uint256 pool)
        external
        view
        returns (address[] memory recipients, uint256[] memory amounts, uint256 assigned)
    {
        ParamsController.Params memory p = this.getAuctionParams(auctionId);
        Modules memory modules = this.getAuctionModules(auctionId);
        return _buildDistribution(auctionId, p, pool, modules.reputationAdapter);
    }
}
