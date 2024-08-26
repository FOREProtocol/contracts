// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface ITokenIncentiveRegistry {
    function getTokenIncentives(
        address tokenAddress
    ) external view returns (uint256, uint256, uint256, uint256, uint256);

    function isTokenEnabled(address tokenAddress) external view returns (bool);
}
