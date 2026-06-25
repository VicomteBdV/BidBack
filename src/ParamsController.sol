// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./utils/Ownable.sol";

error InvalidParams();

contract ParamsController is Ownable {
    uint256 public constant BPS = 10_000;
    uint256 public constant SCALE = 1e18;

    struct Params {
        uint16 bidbackFeeBps;
        uint16 redistributionBps;
        uint16 minParticipants;
        uint16 alphaBps;
        uint16 betaBps;
        uint16 gammaBps;
        uint16 minBidIncrementBps;
        uint16 perUserRewardCapBps;
        uint16 maxParticipants;
        uint16 maxInteractionCount;
        uint64 minAuctionDuration;
        uint64 antiSnipeWindow;
        uint64 antiSnipeExtension;
        uint8 maxAntiSnipeExtensions;
        uint64 minExposure;
        uint256 minPremiumNet;
        uint256 efCap;
        uint256 etCap;
        uint256 iiCap;
    }

    Params private _params;
    bool public paused;

    event ParamsUpdated();
    event PauseUpdated(bool paused);

    constructor(address initialOwner) Ownable(initialOwner) {
        _params = Params({
            bidbackFeeBps: 500,
            redistributionBps: 5_000,
            minParticipants: 2,
            alphaBps: 6_000,
            betaBps: 3_000,
            gammaBps: 1_000,
            minBidIncrementBps: 500,
            perUserRewardCapBps: 4_000,
            maxParticipants: 64,
            maxInteractionCount: 5,
            minAuctionDuration: 1 hours,
            antiSnipeWindow: 10 minutes,
            antiSnipeExtension: 10 minutes,
            maxAntiSnipeExtensions: 6,
            minExposure: 5 minutes,
            minPremiumNet: 0.01 ether,
            efCap: SCALE,
            etCap: SCALE,
            iiCap: SCALE
        });
        _validate(_params);
    }

    function params() external view returns (Params memory) {
        return _params;
    }

    function setParams(Params calldata newParams) external onlyOwner {
        _validate(newParams);
        _params = newParams;
        emit ParamsUpdated();
    }

    function setPaused(bool newPaused) external onlyOwner {
        paused = newPaused;
        emit PauseUpdated(newPaused);
    }

    function _validate(Params memory p) internal pure {
        if (p.bidbackFeeBps > 2_000) revert InvalidParams();
        if (p.redistributionBps > BPS) revert InvalidParams();
        if (p.minParticipants < 2) revert InvalidParams();
        if (p.maxParticipants < p.minParticipants || p.maxParticipants > 256) revert InvalidParams();
        if (p.alphaBps <= p.betaBps || p.betaBps < p.gammaBps) revert InvalidParams();
        if (uint256(p.alphaBps) + p.betaBps + p.gammaBps != BPS) revert InvalidParams();
        if (p.minBidIncrementBps == 0 || p.minBidIncrementBps > BPS) revert InvalidParams();
        if (p.perUserRewardCapBps == 0 || p.perUserRewardCapBps > BPS) revert InvalidParams();
        if (p.maxInteractionCount == 0) revert InvalidParams();
        if (p.minAuctionDuration == 0) revert InvalidParams();
        if (p.antiSnipeWindow == 0 || p.antiSnipeExtension == 0) revert InvalidParams();
        if (p.maxAntiSnipeExtensions > 20) revert InvalidParams();
        if (p.minExposure > p.minAuctionDuration) revert InvalidParams();
        if (p.efCap == 0 || p.efCap > SCALE) revert InvalidParams();
        if (p.etCap == 0 || p.etCap > SCALE) revert InvalidParams();
        if (p.iiCap == 0 || p.iiCap > SCALE) revert InvalidParams();
    }
}

