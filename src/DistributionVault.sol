// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEscrowVault} from "./interfaces/IEscrowVault.sol";
import {Ownable, ZeroAddress} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

error NotAuctionHouse();
error DistributionAlreadyOpened();
error DistributionNotOpened();
error LengthMismatch();
error TooManyRecipients();
error DuplicateRecipient();
error RewardAlreadyClaimed();
error NothingToClaim();

contract DistributionVault is Ownable, ReentrancyGuard {
    uint256 public constant MAX_RECIPIENTS = 256;

    struct Distribution {
        bool opened;
        uint256 totalAssigned;
        uint256 totalClaimed;
    }

    address public auctionHouse;

    mapping(uint256 => Distribution) public distributions;
    mapping(uint256 => mapping(address => uint256)) public entitlementOf;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(uint256 => IEscrowVault) private _escrowForAuction;

    event AuctionHouseUpdated(address indexed auctionHouse);
    event DistributionOpened(uint256 indexed auctionId, uint256 totalAssigned);
    event DistributionClaimed(uint256 indexed auctionId, address indexed claimant, uint256 amount);

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

    function openDistribution(
        uint256 auctionId,
        address[] calldata recipients,
        uint256[] calldata amounts,
        IEscrowVault escrowForClaims
    )
        external
        onlyAuctionHouse
        returns (uint256 totalAssigned)
    {
        if (address(escrowForClaims) == address(0)) revert ZeroAddress();
        if (distributions[auctionId].opened) revert DistributionAlreadyOpened();
        if (recipients.length != amounts.length) revert LengthMismatch();
        if (recipients.length > MAX_RECIPIENTS) revert TooManyRecipients();

        for (uint256 i = 0; i < recipients.length; ++i) {
            address recipient = recipients[i];
            if (recipient == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert NothingToClaim();
            for (uint256 j = i + 1; j < recipients.length; ++j) {
                if (recipient == recipients[j]) revert DuplicateRecipient();
            }

            entitlementOf[auctionId][recipient] = amounts[i];
            totalAssigned += amounts[i];
        }

        _escrowForAuction[auctionId] = escrowForClaims;
        distributions[auctionId] = Distribution({opened: true, totalAssigned: totalAssigned, totalClaimed: 0});

        emit DistributionOpened(auctionId, totalAssigned);
    }

    function claim(uint256 auctionId) external nonReentrant {
        Distribution storage distribution = distributions[auctionId];
        if (!distribution.opened) revert DistributionNotOpened();
        if (claimed[auctionId][msg.sender]) revert RewardAlreadyClaimed();

        uint256 amount = entitlementOf[auctionId][msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimed[auctionId][msg.sender] = true;
        distribution.totalClaimed += amount;

        _escrowForAuction[auctionId].payDistributionReward(auctionId, msg.sender, amount);

        emit DistributionClaimed(auctionId, msg.sender, amount);
    }

    function escrowForAuction(uint256 auctionId) external view returns (IEscrowVault) {
        return _escrowForAuction[auctionId];
    }
}
