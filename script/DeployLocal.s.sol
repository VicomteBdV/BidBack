// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuctionHouse} from "../src/AuctionHouse.sol";
import {DistributionVault} from "../src/DistributionVault.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {NFTVault} from "../src/NFTVault.sol";
import {ParamsController} from "../src/ParamsController.sol";
import {ReputationAdapter} from "../src/ReputationAdapter.sol";
import {LocalERC721} from "./mocks/LocalERC721.sol";

interface VmLocal {
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployLocal {
    VmLocal private constant vm = VmLocal(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant ANVIL_PRIVATE_KEY =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    address private constant ANVIL_DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    uint256 private constant DEMO_TOKEN_ID = 1;
    uint256 private constant DEMO_START_PRICE = 1 ether;
    uint64 private constant DEMO_DURATION = 2 hours;

    event LocalDeployment(
        address indexed deployer,
        address paramsController,
        address nftVault,
        address escrowVault,
        address distributionVault,
        address reputationAdapter,
        address auctionHouse,
        address localNft,
        address feeRecipient
    );

    event LocalDemoAuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed localNft,
        uint256 tokenId,
        uint256 startPrice,
        uint64 duration
    );

    function run()
        external
        returns (
            ParamsController paramsController,
            NFTVault nftVault,
            EscrowVault escrowVault,
            DistributionVault distributionVault,
            ReputationAdapter reputationAdapter,
            AuctionHouse auctionHouse,
            LocalERC721 localNft
        )
    {
        vm.startBroadcast(ANVIL_PRIVATE_KEY);

        address owner = ANVIL_DEPLOYER;
        address feeRecipient = ANVIL_DEPLOYER;

        paramsController = new ParamsController(owner);
        nftVault = new NFTVault(owner);
        escrowVault = new EscrowVault(owner);
        distributionVault = new DistributionVault(owner);
        reputationAdapter = new ReputationAdapter(owner);

        auctionHouse = new AuctionHouse(
            owner,
            paramsController,
            nftVault,
            escrowVault,
            distributionVault,
            reputationAdapter,
            feeRecipient
        );

        nftVault.setAuctionHouse(address(auctionHouse));
        escrowVault.setAuctionHouse(address(auctionHouse));
        distributionVault.setAuctionHouse(address(auctionHouse));

        localNft = new LocalERC721("BidBack Local NFT", "BBLOCAL");
        localNft.mintBatch(owner, 12);

        localNft.setApprovalForAll(address(nftVault), true);

        uint256 demoAuctionId =
            auctionHouse.createAuction(address(localNft), DEMO_TOKEN_ID, DEMO_START_PRICE, DEMO_DURATION);

        emit LocalDeployment(
            owner,
            address(paramsController),
            address(nftVault),
            address(escrowVault),
            address(distributionVault),
            address(reputationAdapter),
            address(auctionHouse),
            address(localNft),
            feeRecipient
        );

        emit LocalDemoAuctionCreated(
            demoAuctionId,
            owner,
            address(localNft),
            DEMO_TOKEN_ID,
            DEMO_START_PRICE,
            DEMO_DURATION
        );

        vm.stopBroadcast();
    }
}