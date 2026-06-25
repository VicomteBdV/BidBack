// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Receiver} from "../../src/interfaces/IERC721.sol";

error LocalERC721ZeroAddress();
error LocalERC721NotMinted();
error LocalERC721AlreadyMinted();
error LocalERC721NotAuthorized();
error LocalERC721WrongFrom();
error LocalERC721UnsafeRecipient();

contract LocalERC721 {
    string public name;
    string public symbol;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    uint256 public nextTokenId = 1;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _mint(to, tokenId);
    }

    function mintBatch(address to, uint256 count) external {
        for (uint256 i = 0; i < count; ++i) {
            uint256 tokenId = nextTokenId++;
            _mint(to, tokenId);
        }
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert LocalERC721NotMinted();
        return owner;
    }

    function approve(address spender, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        if (msg.sender != owner && !isApprovedForAll[owner][msg.sender]) {
            revert LocalERC721NotAuthorized();
        }

        getApproved[tokenId] = spender;
        emit Approval(owner, spender, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        if (operator == address(0)) revert LocalERC721ZeroAddress();

        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        if (!_isAuthorized(msg.sender, tokenId)) revert LocalERC721NotAuthorized();
        if (ownerOf(tokenId) != from) revert LocalERC721WrongFrom();
        if (to == address(0)) revert LocalERC721ZeroAddress();

        delete getApproved[tokenId];

        _owners[tokenId] = to;
        balanceOf[from] -= 1;
        balanceOf[to] += 1;

        emit Transfer(from, to, tokenId);

        if (to.code.length > 0) {
            bytes4 retval = IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, "");
            if (retval != IERC721Receiver.onERC721Received.selector) {
                revert LocalERC721UnsafeRecipient();
            }
        }
    }

    function tokensOfOwner(address owner) external view returns (uint256[] memory tokenIds) {
        uint256 balance = balanceOf[owner];
        tokenIds = new uint256[](balance);

        uint256 cursor;
        for (uint256 tokenId = 1; tokenId < nextTokenId && cursor < balance; ++tokenId) {
            if (_owners[tokenId] == owner) {
                tokenIds[cursor] = tokenId;
                cursor += 1;
            }
        }
    }

    function _mint(address to, uint256 tokenId) internal {
        if (to == address(0)) revert LocalERC721ZeroAddress();
        if (_owners[tokenId] != address(0)) revert LocalERC721AlreadyMinted();

        _owners[tokenId] = to;
        balanceOf[to] += 1;

        emit Transfer(address(0), to, tokenId);
    }

    function _isAuthorized(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return spender == owner || getApproved[tokenId] == spender || isApprovedForAll[owner][spender];
    }
}