// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface ITokenIncentiveRegistry {
    function getTokenIncentives(
        address tokenAddress
    ) external view returns (uint8, uint8, uint8, uint8);

    function isTokenEnabled(address tokenAddress) external view returns (bool);
}
