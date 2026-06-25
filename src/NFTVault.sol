// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721, IERC721Receiver} from "./interfaces/IERC721.sol";
import {Ownable, ZeroAddress} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

error NotAuctionHouse();
error NFTAlreadyLocked();
error NFTNotLocked();
error NFTAlreadyReleased();

contract NFTVault is Ownable, ReentrancyGuard, IERC721Receiver {
    struct Lock {
        address nft;
        uint256 tokenId;
        address seller;
        bool locked;
        bool released;
    }

    address public auctionHouse;
    mapping(uint256 => Lock) public locks;

    event AuctionHouseUpdated(address indexed auctionHouse);
    event NFTLocked(uint256 indexed auctionId, address indexed nft, uint256 indexed tokenId, address seller);
    event NFTReleased(uint256 indexed auctionId, address indexed recipient);

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

    function lockFrom(uint256 auctionId, address seller, address nft, uint256 tokenId)
        external
        onlyAuctionHouse
        nonReentrant
    {
        if (seller == address(0) || nft == address(0)) revert ZeroAddress();
        if (locks[auctionId].locked || locks[auctionId].released) revert NFTAlreadyLocked();

        IERC721(nft).safeTransferFrom(seller, address(this), tokenId);

        locks[auctionId] = Lock({nft: nft, tokenId: tokenId, seller: seller, locked: true, released: false});

        emit NFTLocked(auctionId, nft, tokenId, seller);
    }

    function releaseTo(uint256 auctionId, address recipient) external onlyAuctionHouse nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();

        Lock storage lockedNft = locks[auctionId];
        if (!lockedNft.locked) revert NFTNotLocked();
        if (lockedNft.released) revert NFTAlreadyReleased();

        lockedNft.locked = false;
        lockedNft.released = true;

        IERC721(lockedNft.nft).safeTransferFrom(address(this), recipient, lockedNft.tokenId);

        emit NFTReleased(auctionId, recipient);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
