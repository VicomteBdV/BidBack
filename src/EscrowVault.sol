// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, ZeroAddress} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

error NotAuctionHouse();
error NotDistributionVault();
error InvalidDeposit();
error AuctionAlreadySettled();
error AuctionNotSettled();
error CapTooLow();
error NothingToClaim();
error RefundAlreadyClaimed();
error InsufficientDistributionReserve();
error TransferFailed();

contract EscrowVault is Ownable, ReentrancyGuard {
    struct Settlement {
        bool finalized;
        address winner;
        address distributionVault;
        uint256 finalPrice;
        uint256 sellerProceeds;
        uint256 feeAmount;
        uint256 distributionReserve;
    }

    address public auctionHouse;

    mapping(uint256 => mapping(address => uint256)) private _caps;
    mapping(uint256 => mapping(address => bool)) public refundClaimed;
    mapping(uint256 => Settlement) public settlements;
    mapping(address => uint256) public sellerCredits;
    mapping(address => uint256) public protocolFeeCredits;

    event AuctionHouseUpdated(address indexed auctionHouse);
    event CapDeposited(uint256 indexed auctionId, address indexed bidder, uint256 cap, uint256 delta);
    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 finalPrice,
        uint256 sellerProceeds,
        uint256 feeAmount,
        uint256 distributionReserve
    );
    event RefundClaimed(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event SellerProceedsWithdrawn(address indexed seller, uint256 amount);
    event ProtocolFeesWithdrawn(address indexed recipient, uint256 amount);
    event DistributionRewardPaid(uint256 indexed auctionId, address indexed recipient, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyAuctionHouse() {
        if (msg.sender != auctionHouse) revert NotAuctionHouse();
        _;
    }

    function setAuctionHouse(address newAuctionHouse) external onlyOwner {
        if (newAuctionHouse == address(0)) revert ZeroAddress();
        auctionHouse = newAuctionHouse;
        emit AuctionHouseUpdated(newAuctionHouse);
    }

    function capOf(uint256 auctionId, address bidder) external view returns (uint256) {
        return _caps[auctionId][bidder];
    }

    function depositCap(uint256 auctionId, address bidder, uint256 newCap) external payable onlyAuctionHouse {
        if (bidder == address(0)) revert ZeroAddress();
        uint256 previousCap = _caps[auctionId][bidder];
        if (newCap <= previousCap) revert CapTooLow();
        uint256 delta = newCap - previousCap;
        if (msg.value != delta) revert InvalidDeposit();

        _caps[auctionId][bidder] = newCap;

        emit CapDeposited(auctionId, bidder, newCap, delta);
    }

    function finalizeSettlement(
        uint256 auctionId,
        address winner,
        address seller,
        address feeRecipient,
        address authorizedDistributionVault,
        uint256 finalPrice,
        uint256 feeAmount,
        uint256 distributionAmount
    ) external onlyAuctionHouse {
        if (
            winner == address(0) || seller == address(0) || feeRecipient == address(0)
                || authorizedDistributionVault == address(0)
        ) revert ZeroAddress();
        if (settlements[auctionId].finalized) revert AuctionAlreadySettled();
        if (_caps[auctionId][winner] < finalPrice) revert CapTooLow();
        if (feeAmount + distributionAmount > finalPrice) revert InvalidDeposit();

        uint256 sellerProceeds = finalPrice - feeAmount - distributionAmount;

        settlements[auctionId] = Settlement({
            finalized: true,
            winner: winner,
            distributionVault: authorizedDistributionVault,
            finalPrice: finalPrice,
            sellerProceeds: sellerProceeds,
            feeAmount: feeAmount,
            distributionReserve: distributionAmount
        });

        sellerCredits[seller] += sellerProceeds;
        protocolFeeCredits[feeRecipient] += feeAmount;

        emit AuctionSettled(auctionId, winner, finalPrice, sellerProceeds, feeAmount, distributionAmount);
    }

    function refundableAmount(uint256 auctionId, address bidder) public view returns (uint256) {
        Settlement memory settlement = settlements[auctionId];
        if (!settlement.finalized) return 0;

        uint256 cap = _caps[auctionId][bidder];
        if (cap == 0) return 0;
        if (bidder == settlement.winner) {
            if (cap <= settlement.finalPrice) return 0;
            return cap - settlement.finalPrice;
        }
        return cap;
    }

    function claimRefund(uint256 auctionId) external nonReentrant {
        if (!settlements[auctionId].finalized) revert AuctionNotSettled();
        if (refundClaimed[auctionId][msg.sender]) revert RefundAlreadyClaimed();

        uint256 amount = refundableAmount(auctionId, msg.sender);
        if (amount == 0) revert NothingToClaim();

        refundClaimed[auctionId][msg.sender] = true;
        _sendValue(msg.sender, amount);

        emit RefundClaimed(auctionId, msg.sender, amount);
    }

    function withdrawSellerProceeds() external nonReentrant {
        uint256 amount = sellerCredits[msg.sender];
        if (amount == 0) revert NothingToClaim();

        sellerCredits[msg.sender] = 0;
        _sendValue(msg.sender, amount);

        emit SellerProceedsWithdrawn(msg.sender, amount);
    }

    function withdrawProtocolFees() external nonReentrant {
        uint256 amount = protocolFeeCredits[msg.sender];
        if (amount == 0) revert NothingToClaim();

        protocolFeeCredits[msg.sender] = 0;
        _sendValue(msg.sender, amount);

        emit ProtocolFeesWithdrawn(msg.sender, amount);
    }

    function payDistributionReward(uint256 auctionId, address recipient, uint256 amount)
        external
        nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        Settlement storage settlement = settlements[auctionId];
        if (!settlement.finalized) revert AuctionNotSettled();
        if (msg.sender != settlement.distributionVault) revert NotDistributionVault();
        if (amount == 0) revert NothingToClaim();

        if (settlement.distributionReserve < amount) revert InsufficientDistributionReserve();

        settlement.distributionReserve -= amount;
        _sendValue(recipient, amount);

        emit DistributionRewardPaid(auctionId, recipient, amount);
    }

    function _sendValue(address recipient, uint256 amount) internal {
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
    }
}
