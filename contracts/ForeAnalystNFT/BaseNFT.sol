// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


abstract contract BaseNFT is
    ERC721Enumerable,
    Ownable
{

    error TokenNotExist();


    event BaseURIChanged(string baseURI);
    event TokenPenaltyChanged(uint256 tokenId, uint64 penalty);


    struct Token {
        /// @notice amount of staked FORE
        uint256 staked;

        /// @notice 1:1000000 penalty ratio
        uint64 penalty;
    }


    /// @notice Base URL
    string private _baseURI_;

    /// @notice Tokens
    Token[] public tokens;

    /// @notice Token creation date
    uint64[] public tokenCreatedAt;


    constructor (
        string memory name_,
        string memory symbol_,
        string memory baseURI_
    )
        ERC721(name_, symbol_)
    {
        _baseURI_ = baseURI_;
    }


    /**
     * @inheritdoc ERC721
     */
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseURI_;
    }

    /**
     * @notice Returns base URI
     */
    function getBaseURI() public view returns (string memory)
    {
        return _baseURI();
    }

    /**
     * @notice Changes base URI
     * @dev Allowed only to contract owner
     * @param baseURI_ New base URI
     */
    function setBaseURI(
        string calldata baseURI_
    ) external
        onlyOwner
    {
        _baseURI_ = baseURI_;

        emit BaseURIChanged(baseURI_);
    }

    /**
     * @notice Changes token penalty ratio
     * @param tokenId Specific token
     * @param penalty Penalty ratio
     */
    function setTokenPenalty(
        uint256 tokenId,
        uint64 penalty
    ) public
        onlyOwner
    {
        _verifyTokenExists(tokenId);
        tokens[tokenId].penalty = penalty;

        emit TokenPenaltyChanged(tokenId, penalty);
    }

    /**
     * @dev Verifies token exists. Reverts otherwise
     */
    function _verifyTokenExists(uint256 tokenId) internal view
    {
        if (!_exists(tokenId)) {
            revert TokenNotExist();
        }
    }

    /**
     * @notice Mints new token
     * @dev Verifies recipient. If it is a contract it will verify supported interfaces.
     * @param to Recipient address
     * @param token Token struct
     */
    function mint(
        address to,
        Token calldata token
    ) external
        onlyOwner
    {
        uint256 tokenId = tokens.length;

        _safeMint(
            to,
            tokenId
        );

        tokens.push(token);
    }

    /**
     * @inheritdoc ERC721Enumerable
     * @notice Adds creation date information
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override
    {
        ERC721Enumerable._beforeTokenTransfer(from, to, tokenId);

        if (from == address(0)) {
            tokenCreatedAt.push(uint64(block.timestamp));
        }
    }

}
