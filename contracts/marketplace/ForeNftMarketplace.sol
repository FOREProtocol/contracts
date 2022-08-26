// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "../external/pancake-nft-markets/ERC721NFTMarketV1.sol";


contract ForeNftMarketplace is
    ERC721NFTMarketV1
{

    constructor(
        address _adminAddress,
        address _treasuryAddress,
        address _WBNBAddress,
        uint256 _minimumAskPrice,
        uint256 _maximumAskPrice
    )
        ERC721NFTMarketV1(
            _adminAddress,
            _treasuryAddress,
            _WBNBAddress,
            _minimumAskPrice,
            _maximumAskPrice
        )
    {

    }

}
