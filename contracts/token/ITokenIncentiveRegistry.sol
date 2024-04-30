// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface ITokenIncentiveRegistry {
    function getDiscountRate(address token) external view returns (uint8);

    function isTokenEnabled(address token) external view returns (bool);

    function addToken(address token) external;

    function addToken(address token, uint8 discountRate) external;

    function disableToken(address token) external;

    function setDiscountRate(address token, uint8 discountRate) external;
}
