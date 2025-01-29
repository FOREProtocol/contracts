// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IBasicMarket {
    function initialize(
        bytes32 mHash,
        address receiver,
        uint256 amountA,
        uint256 amountB,
        address protocolAddress,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp,
        uint64 tokenId
    ) external;
}
