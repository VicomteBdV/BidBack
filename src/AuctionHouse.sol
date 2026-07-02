// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DistributionVault} from "./DistributionVault.sol";
import {EscrowVault} from "./EscrowVault.sol";
import {IEscrowVault} from "./interfaces/IEscrowVault.sol";
import {NFTVault} from "./NFTVault.sol";
import {ParamsController} from "./ParamsController.sol";
import {IReputationAdapter} from "./interfaces/IReputationAdapter.sol";
import {Ownable, ZeroAddress} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

error Paused();
error InvalidAuction();
error InvalidDuration();
error AuctionNotOpen();
error AuctionNotEnded();
error BidTooLow();
error MaxParticipantsReached();
error AlreadyFinalized();
error NotNftClaimant();
error NFTAlreadyClaimed();

contract AuctionHouse is Ownable, ReentrancyGuard {
    uint256 public constant BPS = 10_000;
    uint256 public constant SCALE = 1e18;

    enum State {
        OPEN,
        ENDED,
        FINALIZED
    }

    struct Auction {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 startPrice;
        uint64 startTime;
        uint64 initialEndTime;
        uint64 endTime;
        uint8 extensionsUsed;
        State state;
        address highestBidder;
        uint256 highestBid;
        uint256 participantCount;
        uint256 bidCount;
        bool nftClaimed;
    }

    struct BidderStats {
        uint256 maxCap;
        uint64 firstBidTime;
        uint16 significantOverbids;
        bool exists;
    }

    struct BidRecord {
        address bidder;
        uint256 amount;
        uint64 timestamp;
    }

    struct Modules {
        NFTVault nftVault;
        EscrowVault escrowVault;
        DistributionVault distributionVault;
        IReputationAdapter reputationAdapter;
    }

    ParamsController public paramsController;
    NFTVault public nftVault;
    EscrowVault public escrowVault;
    DistributionVault public distributionVault;
    IReputationAdapter public reputationAdapter;
    address public feeRecipient;
    uint256 public nextAuctionId = 1;

    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => mapping(address => BidderStats)) public bidderStats;
    mapping(uint256 => ParamsController.Params) private _auctionParams;
    mapping(uint256 => Modules) private _auctionModules;
    mapping(uint256 => address) private _auctionFeeRecipients;
    mapping(uint256 => address[]) private _participants;
    mapping(uint256 => BidRecord[]) private _bidRecords;

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nft,
        uint256 tokenId,
        uint256 startPrice,
        uint64 initialEndTime
    );
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event AuctionExtended(uint256 indexed auctionId, uint64 newEndTime, uint8 extensionsUsed);
    event AuctionEnded(uint256 indexed auctionId);
    event AuctionFinalized(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 finalPrice,
        uint256 feeAmount,
        uint256 distributionAmount
    );
    event NFTClaimed(uint256 indexed auctionId, address indexed claimant);
    event FeeRecipientUpdated(address indexed feeRecipient);
    event ModulesUpdated(
        address indexed nftVault,
        address indexed escrowVault,
        address indexed distributionVault,
        address reputationAdapter
    );

    constructor(
        address initialOwner,
        ParamsController paramsController_,
        NFTVault nftVault_,
        EscrowVault escrowVault_,
        DistributionVault distributionVault_,
        IReputationAdapter reputationAdapter_,
        address feeRecipient_
    ) Ownable(initialOwner) {
        if (address(paramsController_) == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();

        paramsController = paramsController_;
        _setModules(nftVault_, escrowVault_, distributionVault_, reputationAdapter_);
        feeRecipient = feeRecipient_;
    }

    function setModules(
        NFTVault newNftVault,
        EscrowVault newEscrowVault,
        DistributionVault newDistributionVault,
        IReputationAdapter newReputationAdapter
    ) external onlyOwner {
        _setModules(newNftVault, newEscrowVault, newDistributionVault, newReputationAdapter);
    }

    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        if (newFeeRecipient == address(0)) revert ZeroAddress();
        feeRecipient = newFeeRecipient;
        emit FeeRecipientUpdated(newFeeRecipient);
    }

    function createAuction(address nft, uint256 tokenId, uint256 startPrice, uint64 duration)
        external
        nonReentrant
        returns (uint256 auctionId)
    {
        if (paramsController.paused()) revert Paused();
        if (nft == address(0)) revert ZeroAddress();
        if (duration == 0) revert InvalidDuration();

        ParamsController.Params memory p = paramsController.params();
        if (duration < p.minAuctionDuration) revert InvalidDuration();

        auctionId = nextAuctionId++;
        Modules memory modules = Modules({
            nftVault: nftVault,
            escrowVault: escrowVault,
            distributionVault: distributionVault,
            reputationAdapter: reputationAdapter
        });
        uint64 startTime = uint64(block.timestamp);
        uint64 initialEndTime = startTime + duration;

        auctions[auctionId] = Auction({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            startPrice: startPrice,
            startTime: startTime,
            initialEndTime: initialEndTime,
            endTime: initialEndTime,
            extensionsUsed: 0,
            state: State.OPEN,
            highestBidder: address(0),
            highestBid: 0,
            participantCount: 0,
            bidCount: 0,
            nftClaimed: false
        });
        _auctionParams[auctionId] = p;
        _auctionModules[auctionId] = modules;
        _auctionFeeRecipients[auctionId] = feeRecipient;

        modules.nftVault.lockFrom(auctionId, msg.sender, nft, tokenId);

        emit AuctionCreated(auctionId, msg.sender, nft, tokenId, startPrice, initialEndTime);
    }

    function placeBid(uint256 auctionId, uint256 newCap) external payable nonReentrant {
        if (paramsController.paused()) revert Paused();

        Auction storage auction = auctions[auctionId];
        if (auction.seller == address(0)) revert InvalidAuction();
        if (auction.state != State.OPEN) revert AuctionNotOpen();

        uint64 nowTs = uint64(block.timestamp);
        if (nowTs >= auction.endTime) revert AuctionNotOpen();

        ParamsController.Params memory p = _auctionParams[auctionId];
        uint256 minimumBid = minimumNextBid(auctionId);
        if (newCap < minimumBid) revert BidTooLow();

        BidderStats storage stats = bidderStats[auctionId][msg.sender];
        uint256 previousCap = stats.maxCap;
        if (newCap <= previousCap) revert BidTooLow();

        if (!stats.exists) {
            if (auction.participantCount >= p.maxParticipants) revert MaxParticipantsReached();
            stats.exists = true;
            stats.firstBidTime = nowTs;
            _participants[auctionId].push(msg.sender);
            auction.participantCount += 1;
        }

        if (auction.highestBidder != address(0) && auction.highestBidder != msg.sender) {
            if (stats.significantOverbids < type(uint16).max) {
                stats.significantOverbids += 1;
            }
        }

        stats.maxCap = newCap;

        _auctionModules[auctionId].escrowVault.depositCap{value: msg.value}(auctionId, msg.sender, newCap);

        auction.highestBidder = msg.sender;
        auction.highestBid = newCap;
        auction.bidCount += 1;
        _bidRecords[auctionId].push(BidRecord({bidder: msg.sender, amount: newCap, timestamp: nowTs}));

        emit BidPlaced(auctionId, msg.sender, newCap);

        if (
            auction.endTime - nowTs <= p.antiSnipeWindow
                && auction.extensionsUsed < p.maxAntiSnipeExtensions
        ) {
            auction.endTime = auction.endTime + p.antiSnipeExtension;
            auction.extensionsUsed += 1;
            emit AuctionExtended(auctionId, auction.endTime, auction.extensionsUsed);
        }
    }

    function endAuction(uint256 auctionId) public {
        Auction storage auction = auctions[auctionId];
        if (auction.seller == address(0)) revert InvalidAuction();
        if (auction.state == State.FINALIZED) revert AlreadyFinalized();
        if (auction.state == State.ENDED) return;
        if (auction.state != State.OPEN) revert AuctionNotOpen();
        if (block.timestamp < auction.endTime) revert AuctionNotEnded();

        auction.state = State.ENDED;
        emit AuctionEnded(auctionId);
    }

    function finalizeAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        if (auction.seller == address(0)) revert InvalidAuction();
        if (auction.state == State.FINALIZED) revert AlreadyFinalized();
        if (auction.state == State.OPEN) {
            endAuction(auctionId);
        }
        if (auction.state != State.ENDED) revert AuctionNotEnded();

        auction.state = State.FINALIZED;
        Modules memory modules = _auctionModules[auctionId];

        if (auction.highestBidder == address(0)) {
            emit AuctionFinalized(auctionId, address(0), 0, 0, 0);
            return;
        }

        ParamsController.Params memory p = _auctionParams[auctionId];
        uint256 finalPrice = auction.highestBid;
        uint256 premiumGross = finalPrice > auction.startPrice ? finalPrice - auction.startPrice : 0;
        uint256 feeAmount = premiumGross == 0 ? 0 : (premiumGross * p.bidbackFeeBps) / BPS;
        uint256 premiumNet = premiumGross - feeAmount;
        uint256 candidateDistribution = _candidateDistributionPool(auction, p, premiumNet);

        (address[] memory recipients, uint256[] memory amounts, uint256 distributionAmount) =
            _buildDistribution(auctionId, p, candidateDistribution, modules.reputationAdapter);

        modules.distributionVault.openDistribution(
            auctionId, recipients, amounts, IEscrowVault(address(modules.escrowVault))
        );
        modules.escrowVault.finalizeSettlement(
            auctionId,
            auction.highestBidder,
            auction.seller,
            _auctionFeeRecipients[auctionId],
            address(modules.distributionVault),
            finalPrice,
            feeAmount,
            distributionAmount
        );
        emit AuctionFinalized(auctionId, auction.highestBidder, finalPrice, feeAmount, distributionAmount);
    }

    function claimNft(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        if (auction.seller == address(0)) revert InvalidAuction();
        if (auction.state != State.FINALIZED) revert AuctionNotEnded();
        if (auction.nftClaimed) revert NFTAlreadyClaimed();

        address claimant = auction.highestBidder == address(0) ? auction.seller : auction.highestBidder;
        if (msg.sender != claimant) revert NotNftClaimant();

        auction.nftClaimed = true;
        _auctionModules[auctionId].nftVault.releaseTo(auctionId, claimant);

        emit NFTClaimed(auctionId, claimant);
    }

    function getParticipants(uint256 auctionId) external view returns (address[] memory) {
        return _participants[auctionId];
    }

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    function getAuctionParams(uint256 auctionId) external view returns (ParamsController.Params memory) {
        return _auctionParams[auctionId];
    }

    function getAuctionFeeRecipient(uint256 auctionId) external view returns (address) {
        return _auctionFeeRecipients[auctionId];
    }

    function getAuctionModules(uint256 auctionId) external view returns (Modules memory) {
        return _auctionModules[auctionId];
    }

    function getBidCount(uint256 auctionId) external view returns (uint256) {
        return _bidRecords[auctionId].length;
    }

    function getBid(uint256 auctionId, uint256 index) external view returns (BidRecord memory) {
        return _bidRecords[auctionId][index];
    }

    function minimumNextBid(uint256 auctionId) public view returns (uint256) {
        Auction memory auction = auctions[auctionId];
        if (auction.seller == address(0)) revert InvalidAuction();

        if (auction.highestBid == 0) {
            return auction.startPrice == 0 ? 1 : auction.startPrice;
        }

        ParamsController.Params memory p = _auctionParams[auctionId];
        uint256 increment = (auction.highestBid * p.minBidIncrementBps + BPS - 1) / BPS;
        if (increment == 0) increment = 1;
        return auction.highestBid + increment;
    }

    function _candidateDistributionPool(
        Auction memory auction,
        ParamsController.Params memory p,
        uint256 premiumNet
    ) internal pure returns (uint256) {
        if (premiumNet < p.minPremiumNet) return 0;
        if (auction.participantCount < p.minParticipants) return 0;
        if (auction.initialEndTime - auction.startTime < p.minAuctionDuration) return 0;

        uint256 candidate = (premiumNet * p.redistributionBps) / BPS;
        return candidate > premiumNet ? premiumNet : candidate;
    }

    function _buildDistribution(
        uint256 auctionId,
        ParamsController.Params memory p,
        uint256 pool,
        IReputationAdapter auctionReputationAdapter
    )
        internal
        view
        returns (address[] memory recipients, uint256[] memory amounts, uint256 assigned)
    {
        if (pool == 0) {
            recipients = new address[](0);
            amounts = new uint256[](0);
            return (recipients, amounts, 0);
        }

        Auction storage auction = auctions[auctionId];
        address[] storage participants = _participants[auctionId];
        uint256 participantLength = participants.length;
        uint256[] memory scores = new uint256[](participantLength);
        uint256 totalScore;

        for (uint256 i = 0; i < participantLength; ++i) {
            address participant = participants[i];
            if (participant == auction.highestBidder) continue;

            uint256 score = _score(auctionId, participant, p, auctionReputationAdapter);
            scores[i] = score;
            totalScore += score;
        }

        if (totalScore == 0) {
            recipients = new address[](0);
            amounts = new uint256[](0);
            return (recipients, amounts, 0);
        }

        address[] memory tmpRecipients = new address[](participantLength);
        uint256[] memory tmpAmounts = new uint256[](participantLength);
        uint256 count;
        uint256 perUserCap = (pool * p.perUserRewardCapBps) / BPS;

        for (uint256 i = 0; i < participantLength; ++i) {
            if (scores[i] == 0) continue;

            uint256 amount = (pool * scores[i]) / totalScore;
            if (amount > perUserCap) amount = perUserCap;
            if (amount == 0) continue;

            tmpRecipients[count] = participants[i];
            tmpAmounts[count] = amount;
            assigned += amount;
            count += 1;
        }

        recipients = new address[](count);
        amounts = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            recipients[i] = tmpRecipients[i];
            amounts[i] = tmpAmounts[i];
        }
    }

    function _score(
        uint256 auctionId,
        address bidder,
        ParamsController.Params memory p,
        IReputationAdapter auctionReputationAdapter
    ) internal view returns (uint256) {
        Auction storage auction = auctions[auctionId];
        BidderStats storage stats = bidderStats[auctionId][bidder];

        uint256 ef = _financialEngagement(stats.maxCap, auction.highestBid, p.efCap);
        uint256 et = _timeEngagement(stats.firstBidTime, auction.startTime, auction.initialEndTime, p);
        uint256 ii = _interactionIntensity(stats.significantOverbids, p);

        uint256 weighted = (p.alphaBps * ef + p.betaBps * et + p.gammaBps * ii) / BPS;
        uint256 reputation = auctionReputationAdapter.reputationBps(bidder);

        return (weighted * reputation) / BPS;
    }

    function _setModules(
        NFTVault newNftVault,
        EscrowVault newEscrowVault,
        DistributionVault newDistributionVault,
        IReputationAdapter newReputationAdapter
    ) internal {
        if (
            address(newNftVault) == address(0) || address(newEscrowVault) == address(0)
                || address(newDistributionVault) == address(0) || address(newReputationAdapter) == address(0)
        ) revert ZeroAddress();

        nftVault = newNftVault;
        escrowVault = newEscrowVault;
        distributionVault = newDistributionVault;
        reputationAdapter = newReputationAdapter;

        emit ModulesUpdated(
            address(newNftVault),
            address(newEscrowVault),
            address(newDistributionVault),
            address(newReputationAdapter)
        );
    }

    function _financialEngagement(uint256 maxCap, uint256 finalPrice, uint256 cap) internal pure returns (uint256) {
        if (finalPrice == 0 || maxCap == 0) return 0;

        uint256 cappedCap = maxCap > finalPrice ? finalPrice : maxCap;
        uint256 ratio = (cappedCap * SCALE) / finalPrice;
        uint256 ef = (ratio * ratio) / SCALE;
        return ef > cap ? cap : ef;
    }

    function _timeEngagement(
        uint64 firstBidTime,
        uint64 startTime,
        uint64 initialEndTime,
        ParamsController.Params memory p
    ) internal pure returns (uint256) {
        if (firstBidTime == 0 || firstBidTime >= initialEndTime) return 0;

        uint256 exposure = initialEndTime - firstBidTime;
        if (exposure < p.minExposure) return 0;

        uint256 initialDuration = initialEndTime - startTime;
        if (initialDuration == 0) return 0;

        uint256 et = (exposure * SCALE) / initialDuration;
        return et > p.etCap ? p.etCap : et;
    }

    function _interactionIntensity(uint16 significantOverbids, ParamsController.Params memory p)
        internal
        pure
        returns (uint256)
    {
        if (significantOverbids == 0) return 0;

        uint256 capped = significantOverbids > p.maxInteractionCount ? p.maxInteractionCount : significantOverbids;
        uint256 ii = (capped * SCALE) / p.maxInteractionCount;
        return ii > p.iiCap ? p.iiCap : ii;
    }
}