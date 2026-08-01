// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LocalERC721} from "./mocks/LocalERC721.sol";

interface VmBaseSepoliaSmokeNft {
    function envUint(string calldata name) external returns (uint256);
    function envAddress(string calldata name) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys a valueless ERC-721 helper for the controlled Base Sepolia smoke test only.
/// @dev This helper is separate from the six BidBack core contracts and must not be added to 84532.json.
contract DeployBaseSepoliaSmokeNft {
    VmBaseSepoliaSmokeNft private constant vm =
        VmBaseSepoliaSmokeNft(address(uint160(uint256(keccak256("hevm cheat code")))));

    event BaseSepoliaSmokeNftDeployed(
        address indexed deployer,
        address indexed recipient,
        address indexed nft,
        uint256 tokenId
    );

    function run() external returns (LocalERC721 nft, uint256 tokenId) {
        uint256 deployerPrivateKey = vm.envUint("TESTNET_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address recipient = vm.envAddress("TESTNET_SMOKE_NFT_RECIPIENT");

        vm.startBroadcast(deployerPrivateKey);

        nft = new LocalERC721("BidBack Base Sepolia Smoke NFT - No Value", "BB-SMOKE");
        tokenId = nft.mint(recipient);

        emit BaseSepoliaSmokeNftDeployed(deployer, recipient, address(nft), tokenId);

        vm.stopBroadcast();
    }
}
