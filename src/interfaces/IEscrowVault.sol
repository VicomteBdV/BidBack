// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEscrowVault {
    function payDistributionReward(uint256 auctionId, address recipient, uint256 amount) external;
}

