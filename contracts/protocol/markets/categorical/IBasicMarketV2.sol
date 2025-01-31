// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./library/MarketLibV2.sol";

interface IBasicMarketV2 {
    function initialize(
        MarketLibV2.MarketCreationInitialData calldata payload
    ) external;
}
