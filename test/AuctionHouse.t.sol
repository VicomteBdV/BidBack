// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuctionHouse} from "../src/AuctionHouse.sol";
import {DistributionVault} from "../src/DistributionVault.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {NFTVault} from "../src/NFTVault.sol";
import {ParamsController} from "../src/ParamsController.sol";
import {ReputationAdapter} from "../src/ReputationAdapter.sol";
import {ERC721Mock} from "./mocks/ERC721Mock.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
}

contract AuctionHouseTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant SELLER = address(0xA11CE);
    address private constant BIDDER_ONE = address(0xB01);
    address private constant BIDDER_TWO = address(0xB02);
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
        nft.mint(SELLER, 1);
        nft.mint(SELLER, 2);

        vm.deal(BIDDER_ONE, 10 ether);
        vm.deal(BIDDER_TWO, 10 ether);
    }

    function testFinalizationKeepsLoserRefundWholeAndFundsRewardFromPremiumOnly() external {
        uint256 auctionId = _createAuction(1, 1 ether, 2 hours);

        vm.prank(BIDDER_ONE);
        auctionHouse.placeBid{value: 1.2 ether}(auctionId, 1.2 ether);

        vm.warp(block.timestamp + 20 minutes);
        vm.prank(BIDDER_TWO);
        auctionHouse.placeBid{value: 1.5 ether}(auctionId, 1.5 ether);

        vm.warp(block.timestamp + 3 hours);
        auctionHouse.finalizeAuction(auctionId);

        vm.prank(BIDDER_TWO);
        auctionHouse.claimNft(auctionId);

        assertEq(nft.ownerOf(1), BIDDER_TWO, "winner receives nft");
        assertEq(escrowVault.refundableAmount(auctionId, BIDDER_ONE), 1.2 ether, "loser refund is full cap");
        assertEq(escrowVault.refundableAmount(auctionId, BIDDER_TWO), 0, "winner has no surplus");

        uint256 reward = distributionVault.entitlementOf(auctionId, BIDDER_ONE);
        assertEq(reward, 0.095 ether, "reward is capped from net premium");

        uint256 bidderOneBefore = BIDDER_ONE.balance;
        vm.prank(BIDDER_ONE);
        escrowVault.claimRefund(auctionId);
        assertEq(BIDDER_ONE.balance - bidderOneBefore, 1.2 ether, "refund paid");

        bidderOneBefore = BIDDER_ONE.balance;
        vm.prank(BIDDER_ONE);
        distributionVault.claim(auctionId);
        assertEq(BIDDER_ONE.balance - bidderOneBefore, reward, "reward paid");

        assertEq(escrowVault.sellerCredits(SELLER), 1.38 ether, "seller receives final price minus fee and reward");
        assertEq(escrowVault.protocolFeeCredits(FEE_RECIPIENT), 0.025 ether, "fee is premium-only");
    }

    function testNoPremiumMeansNoFeeAndNoRedistribution() external {
        uint256 auctionId = _createAuction(2, 1 ether, 2 hours);

        vm.prank(BIDDER_ONE);
        auctionHouse.placeBid{value: 1 ether}(auctionId, 1 ether);

        vm.warp(block.timestamp + 3 hours);
        auctionHouse.finalizeAuction(auctionId);

        (, uint256 totalAssigned,) = distributionVault.distributions(auctionId);
        assertEq(totalAssigned, 0, "no reward without value creation");
        assertEq(escrowVault.sellerCredits(SELLER), 1 ether, "seller receives final price");
        assertEq(escrowVault.protocolFeeCredits(FEE_RECIPIENT), 0, "no premium fee");
    }

    function testAntiSnipingExtendsDeterministically() external {
        uint256 auctionId = _createAuction(1, 1 ether, 1 hours);
        AuctionHouse.Auction memory auction = auctionHouse.getAuction(auctionId);
        uint64 initialEndTime = auction.endTime;

        vm.warp(initialEndTime - 5 minutes);
        vm.prank(BIDDER_ONE);
        auctionHouse.placeBid{value: 1 ether}(auctionId, 1 ether);

        auction = auctionHouse.getAuction(auctionId);
        assertEq(auction.endTime, initialEndTime + 10 minutes, "extended by rule");
    }

    function _createAuction(uint256 tokenId, uint256 startPrice, uint64 duration) internal returns (uint256 auctionId) {
        vm.startPrank(SELLER);
        nft.approve(address(nftVault), tokenId);
        auctionId = auctionHouse.createAuction(address(nft), tokenId, startPrice, duration);
        vm.stopPrank();
    }

    function assertEq(uint256 actual, uint256 expected, string memory message) internal pure {
        require(actual == expected, message);
    }

    function assertEq(address actual, address expected, string memory message) internal pure {
        require(actual == expected, message);
    }
}
