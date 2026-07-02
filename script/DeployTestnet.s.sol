// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuctionHouse} from "../src/AuctionHouse.sol";
import {DistributionVault} from "../src/DistributionVault.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {NFTVault} from "../src/NFTVault.sol";
import {ParamsController} from "../src/ParamsController.sol";
import {ReputationAdapter} from "../src/ReputationAdapter.sol";

interface VmTestnet {
    function envUint(string calldata name) external returns (uint256);
    function envAddress(string calldata name) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployTestnet {
    VmTestnet private constant vm = VmTestnet(address(uint160(uint256(keccak256("hevm cheat code")))));

    event TestnetDeployment(
        address indexed deployer,
        address indexed owner,
        address indexed feeRecipient,
        address paramsController,
        address nftVault,
        address escrowVault,
        address distributionVault,
        address reputationAdapter,
        address auctionHouse
    );

    function run()
        external
        returns (
            ParamsController paramsController,
            NFTVault nftVault,
            EscrowVault escrowVault,
            DistributionVault distributionVault,
            ReputationAdapter reputationAdapter,
            AuctionHouse auctionHouse
        )
    {
        uint256 deployerPrivateKey = vm.envUint("TESTNET_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address finalOwner = vm.envAddress("TESTNET_OWNER");
        address feeRecipient = vm.envAddress("TESTNET_FEE_RECIPIENT");

        vm.startBroadcast(deployerPrivateKey);

        paramsController = new ParamsController(deployer);
        nftVault = new NFTVault(deployer);
        escrowVault = new EscrowVault(deployer);
        distributionVault = new DistributionVault(deployer);
        reputationAdapter = new ReputationAdapter(deployer);

        auctionHouse = new AuctionHouse(
            deployer,
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

        paramsController.transferOwnership(finalOwner);
        nftVault.transferOwnership(finalOwner);
        escrowVault.transferOwnership(finalOwner);
        distributionVault.transferOwnership(finalOwner);
        reputationAdapter.transferOwnership(finalOwner);
        auctionHouse.transferOwnership(finalOwner);

        emit TestnetDeployment(
            deployer,
            finalOwner,
            feeRecipient,
            address(paramsController),
            address(nftVault),
            address(escrowVault),
            address(distributionVault),
            address(reputationAdapter),
            address(auctionHouse)
        );

        vm.stopBroadcast();
    }
}
