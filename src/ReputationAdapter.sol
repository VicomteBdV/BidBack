// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReputationAdapter} from "./interfaces/IReputationAdapter.sol";
import {Ownable, ZeroAddress} from "./utils/Ownable.sol";

error ReputationOutOfBounds();

contract ReputationAdapter is Ownable, IReputationAdapter {
    uint256 public constant DEFAULT_REPUTATION_BPS = 10_000;
    uint256 public constant MIN_REPUTATION_BPS = 5_000;
    uint256 public constant MAX_REPUTATION_BPS = 15_000;

    mapping(address => uint256) private _reputationBps;

    event ReputationUpdated(address indexed user, uint256 reputationBps);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setReputationBps(address user, uint256 newReputationBps) external onlyOwner {
        if (user == address(0)) revert ZeroAddress();
        if (newReputationBps < MIN_REPUTATION_BPS || newReputationBps > MAX_REPUTATION_BPS) {
            revert ReputationOutOfBounds();
        }
        _reputationBps[user] = newReputationBps;
        emit ReputationUpdated(user, newReputationBps);
    }

    function clearReputation(address user) external onlyOwner {
        delete _reputationBps[user];
        emit ReputationUpdated(user, DEFAULT_REPUTATION_BPS);
    }

    function reputationBps(address user) external view returns (uint256) {
        uint256 stored = _reputationBps[user];
        return stored == 0 ? DEFAULT_REPUTATION_BPS : stored;
    }
}
