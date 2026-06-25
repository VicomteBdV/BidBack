// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuctionHouse} from "../src/AuctionHouse.sol";
import {DistributionVault} from "../src/DistributionVault.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {NFTVault} from "../src/NFTVault.sol";
import {ParamsController} from "../src/ParamsController.sol";
import {ReputationAdapter} from "../src/ReputationAdapter.sol";
import {ERC721Mock} from "./mocks/ERC721Mock.sol";

interface VmSecurity {
    function deal(address account, uint256 newBalance) external;
    function expectRevert() external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
}

contract AuctionHouseSecurityTest {
    VmSecurity private constant vm = VmSecurity(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant SELLER = address(0xA11CE);
    address private constant BIDDER_ONE = address(0xB01);
    address private constant BIDDER_TWO = address(0xB02);
    address private constant BIDDER_THREE = address(0xB03);
    address private constant BIDDER_FOUR = address(0xB04);
    address private constant FEE_RECIPIENT = address(0xFEE);

    ParamsController private params;
    NFTVault private nftVault;
    EscrowVault private escrowVault;
    DistributionVault private distributionVault;
    ReputationAdapter private reputation;
    AuctionHouse private auctionHouse;
    ERC721Mock private nft;

    function setUp() external {
        vm.warp(1 days);
        vm.deal(address(this), 20 ether);

        params = new ParamsController(address(this));
        nftVault = new NFTVault(address(this));
        escrowVault = new EscrowVault(address(this));
        distributionVault = new DistributionVault(address(this));
        reputation = new ReputationAdapter(address(this));
        auctionHouse = new AuctionHouse(
            address(this),
            params,
            nftVault,
            escrowVault,
            distributionVault,
            reputation,
            FEE_RECIPIENT
        );

        nftVault.setAuctionHouse(address(auctionHouse));
        escrowVault.setAuctionHouse(address(auctionHouse));
        distributionVault.setAuctionHouse(address(auctionHouse));

        nft = new ERC721Mock("BidBack Test NFT", "BBT");
        for (uint256 tokenId = 1; tokenId <= 30; ++tokenId) {
            nft.mint(SELLER, tokenId);
        }

        vm.deal(BIDDER_ONE, 20 ether);
        vm.deal(BIDDER_TWO, 20 ether);
        vm.deal(BIDDER_THREE, 20 ether);
        vm.deal(BIDDER_FOUR, 20 ether);
    }

    function testVaultAuctionHouseCanOnlyBeSetOnce() external {
        vm.expectRevert();
        nftVault.setAuctionHouse(address(0x123));

        vm.expectRevert();
        escrowVault.setAuctionHouse(address(0x123));

        vm.expectRevert();
        distributionVault.setAuctionHouse(address(0x123));
    }

    function testCreateAuctionRejectsDurationBelowMinimum() external {
        vm.startPrank(SELLER);
        nft.approve(address(nftVault), 1);
        vm.expectRevert();
        auctionHouse.createAuction(address(nft), 1, 1 ether, 59 minutes);
        vm.stopPrank();
    }

    function testDoubleClaimsAreRejected() external {
        uint256 auctionId = _finalizeTwoBidAuction(2);

        vm.prank(BIDDER_ONE);
        escrowVault.claimRefund(auctionId);

        vm.expectRevert();
        vm.prank(BIDDER_ONE);
        escrowVault.claimRefund(auctionId);

        vm.prank(BIDDER_ONE);
        distributionVault.claim(auctionId);

        vm.expectRevert();
        vm.prank(BIDDER_ONE);
        distributionVault.claim(auctionId);

        vm.prank(BIDDER_TWO);
        auctionHouse.claimNft(auctionId);

        vm.expectRevert();
        vm.prank(BIDDER_TWO);
        auctionHouse.claimNft(auctionId);
    }

    function testEscrowSupportsWinnerSurplusRefund() external {
        EscrowVault isolatedEscrow = new EscrowVault(address(this));
        isolatedEscrow.setAuctionHouse(address(this));

        uint256 auctionId = 9001;
        isolatedEscrow.depositCap{value: 2 ether}(auctionId, BIDDER_TWO, 2 ether);
        isolatedEscrow.finalizeSettlement(
            auctionId,
            BIDDER_TWO,
            SELLER,
            FEE_RECIPIENT,
            address(distributionVault),
            1.5 ether,
            0.1 ether,
            0
        );

        assertEq(isolatedEscrow.refundableAmount(auctionId, BIDDER_TWO), 0.5 ether, "winner surplus available");

        uint256 bidderBefore = BIDDER_TWO.balance;
        vm.prank(BIDDER_TWO);
        isolatedEscrow.claimRefund(auctionId);
        assertEq(BIDDER_TWO.balance - bidderBefore, 0.5 ether, "winner surplus refunded");
    }

    function testSellerAndFeeRecipientWithdrawals() external {
        _finalizeTwoBidAuction(3);

        uint256 sellerBefore = SELLER.balance;
        vm.prank(SELLER);
        escrowVault.withdrawSellerProceeds();
        assertEq(SELLER.balance - sellerBefore, 1.38 ether, "seller proceeds withdrawn");

        uint256 feeBefore = FEE_RECIPIENT.balance;
        vm.prank(FEE_RECIPIENT);
        escrowVault.withdrawProtocolFees();
        assertEq(FEE_RECIPIENT.balance - feeBefore, 0.025 ether, "fees withdrawn");
    }

    function testDistributionWithThreeLosersRespectsCapsAndPremiumNet() external {
        uint256 auctionId = _createAuction(4, 1 ether, 2 hours);

        _bid(BIDDER_ONE, auctionId, 1.1 ether);
        vm.warp(block.timestamp + 10 minutes);
        _bid(BIDDER_TWO, auctionId, 1.3 ether);
        vm.warp(block.timestamp + 10 minutes);
        _bid(BIDDER_THREE, auctionId, 1.6 ether);
        vm.warp(block.timestamp + 10 minutes);
        _bid(BIDDER_FOUR, auctionId, 2 ether);

        vm.warp(block.timestamp + 3 hours);
        auctionHouse.finalizeAuction(auctionId);

        uint256 premiumGross = 1 ether;
        uint256 feeAmount = 0.05 ether;
        uint256 premiumNet = premiumGross - feeAmount;
        uint256 pool = premiumNet / 2;
        uint256 perUserCap = (pool * 4_000) / 10_000;

        uint256 rewardOne = distributionVault.entitlementOf(auctionId, BIDDER_ONE);
        uint256 rewardTwo = distributionVault.entitlementOf(auctionId, BIDDER_TWO);
        uint256 rewardThree = distributionVault.entitlementOf(auctionId, BIDDER_THREE);
        (, uint256 totalAssigned,) = distributionVault.distributions(auctionId);

        assertGt(rewardOne, 0, "first loser gets reward");
        assertGt(rewardTwo, 0, "second loser gets reward");
        assertGt(rewardThree, 0, "third loser gets reward");
        assertLe(rewardOne, perUserCap, "reward one capped");
        assertLe(rewardTwo, perUserCap, "reward two capped");
        assertLe(rewardThree, perUserCap, "reward three capped");
        assertLe(totalAssigned, pool, "assigned rewards stay within pool");
        assertLe(totalAssigned, premiumNet, "assigned rewards stay within premium net");

        _claimRefund(BIDDER_ONE, auctionId);
        _claimRefund(BIDDER_TWO, auctionId);
        _claimRefund(BIDDER_THREE, auctionId);
        _claimReward(BIDDER_ONE, auctionId);
        _claimReward(BIDDER_TWO, auctionId);
        _claimReward(BIDDER_THREE, auctionId);

        vm.prank(SELLER);
        escrowVault.withdrawSellerProceeds();
        vm.prank(FEE_RECIPIENT);
        escrowVault.withdrawProtocolFees();

        assertEq(address(escrowVault).balance, 0, "all claims preserve solvency");
    }

    function testFinalizeBeforeEndTimeReverts() external {
        uint256 auctionId = _createAuction(6, 1 ether, 2 hours);
        _bid(BIDDER_ONE, auctionId, 1 ether);

        vm.expectRevert();
        auctionHouse.finalizeAuction(auctionId);
    }

    function testNoBidAuctionLetsSellerReclaimNft() external {
        uint256 auctionId = _createAuction(7, 1 ether, 2 hours);

        vm.warp(block.timestamp + 3 hours);
        auctionHouse.finalizeAuction(auctionId);

        vm.prank(SELLER);
        auctionHouse.claimNft(auctionId);

        assertEq(nft.ownerOf(7), SELLER, "seller reclaims unsold nft");
    }

    function testOnlyExpectedClaimantCanClaimNft() external {
        uint256 auctionId = _finalizeTwoBidAuction(8);

        vm.expectRevert();
        vm.prank(BIDDER_ONE);
        auctionHouse.claimNft(auctionId);

        vm.expectRevert();
        vm.prank(SELLER);
        auctionHouse.claimNft(auctionId);
    }

    function testNonSellerCannotReclaimUnsoldNft() external {
        uint256 auctionId = _createAuction(9, 1 ether, 2 hours);

        vm.warp(block.timestamp + 3 hours);
        auctionHouse.finalizeAuction(auctionId);

        vm.expectRevert();
        vm.prank(BIDDER_ONE);
        auctionHouse.claimNft(auctionId);
    }

    function testMaxParticipantsIsEnforced() external {
        ParamsController.Params memory p = params.params();
        p.maxParticipants = 2;
        params.setParams(p);

        uint256 auctionId = _createAuction(10, 1 ether, 2 hours);

        _bid(BIDDER_ONE, auctionId, 1 ether);
        _bid(BIDDER_TWO, auctionId, 1.1 ether);

        vm.expectRevert();
        vm.prank(BIDDER_THREE);
        auctionHouse.placeBid{value: 1.3 ether}(auctionId, 1.3 ether);
    }

    function testInvalidParamsAreRejected() external {
        ParamsController.Params memory p = params.params();
        p.minParticipants = 1;

        vm.expectRevert();
        params.setParams(p);

        p = params.params();
        p.alphaBps = 3_000;
        p.betaBps = 3_000;
        p.gammaBps = 4_000;

        vm.expectRevert();
        params.setParams(p);
    }

    function testPauseBlocksCreateAndBidOnly() external {
        params.setPaused(true);

        vm.startPrank(SELLER);
        nft.approve(address(nftVault), 11);
        vm.expectRevert();
        auctionHouse.createAuction(address(nft), 11, 1 ether, 2 hours);
        vm.stopPrank();

        params.setPaused(false);
        uint256 auctionId = _createAuction(11, 1 ether, 2 hours);
        _bid(BIDDER_ONE, auctionId, 1 ether);

        params.setPaused(true);
        vm.expectRevert();
        vm.prank(BIDDER_TWO);
        auctionHouse.placeBid{value: 1.1 ether}(auctionId, 1.1 ether);
    }

    function testPauseDoesNotBlockFinalizeOrClaims() external {
        uint256 auctionId = _createAuction(12, 1 ether, 2 hours);
        _bid(BIDDER_ONE, auctionId, 1.2 ether);
        vm.warp(block.timestamp + 20 minutes);
        _bid(BIDDER_TWO, auctionId, 1.5 ether);

        params.setPaused(true);
        vm.warp(block.timestamp + 3 hours);
        auctionHouse.finalizeAuction(auctionId);

        _claimRefund(BIDDER_ONE, auctionId);
        _claimReward(BIDDER_ONE, auctionId);

        vm.prank(BIDDER_TWO);
        auctionHouse.claimNft(auctionId);

        vm.prank(SELLER);
        escrowVault.withdrawSellerProceeds();

        vm.prank(FEE_RECIPIENT);
        escrowVault.withdrawProtocolFees();

        assertEq(address(escrowVault).balance, 0, "pause does not trap funds");
    }

    function _finalizeTwoBidAuction(uint256 tokenId) internal returns (uint256 auctionId) {
        auctionId = _createAuction(tokenId, 1 ether, 2 hours);

        _bid(BIDDER_ONE, auctionId, 1.2 ether);

        vm.warp(block.timestamp + 20 minutes);
        _bid(BIDDER_TWO, auctionId, 1.5 ether);

        vm.warp(block.timestamp + 3 hours);
        auctionHouse.finalizeAuction(auctionId);
    }

    function _createAuction(uint256 tokenId, uint256 startPrice, uint64 duration) internal returns (uint256 auctionId) {
        vm.startPrank(SELLER);
        nft.approve(address(nftVault), tokenId);
        auctionId = auctionHouse.createAuction(address(nft), tokenId, startPrice, duration);
        vm.stopPrank();
    }

    function _bid(address bidder, uint256 auctionId, uint256 amount) internal {
        vm.prank(bidder);
        auctionHouse.placeBid{value: amount}(auctionId, amount);
    }

    function _claimRefund(address bidder, uint256 auctionId) internal {
        vm.prank(bidder);
        escrowVault.claimRefund(auctionId);
    }

    function _claimReward(address bidder, uint256 auctionId) internal {
        vm.prank(bidder);
        distributionVault.claim(auctionId);
    }

    function assertEq(uint256 actual, uint256 expected, string memory message) internal pure {
        require(actual == expected, message);
    }

    function assertEq(address actual, address expected, string memory message) internal pure {
        require(actual == expected, message);
    }

    function assertGt(uint256 actual, uint256 floor, string memory message) internal pure {
        require(actual > floor, message);
    }

    function assertLe(uint256 actual, uint256 ceiling, string memory message) internal pure {
        require(actual <= ceiling, message);
    }
}