// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IBasicFactory is IERC721 {
    function INIT_CODE_PAIR_HASH() external view returns (bytes32);

    function allMarketLength() external view returns (uint256);

    function allMarkets(uint256) external view returns (address);

    function burn(uint256 tokenId) external;

    function buyPower(uint256 id, uint256 amount) external;

    function config() external view returns (address);

    function createMarket(
        bytes32 marketHash,
        address receiver,
        uint256 amountA,
        uint256 amountB,
        uint256 endPredictionTimestamp,
        uint256 startVerificationTimestamp
    ) external returns (address market);

    function foreToken() external view returns (address);

    function foreVerifiers() external view returns (address);

    function isForeMarket(address market) external view returns (bool);

    function isForeOperator(address addr) external view returns (bool);

    function mintVerifier(address receiver) external;
}
