// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./ForeAnalystNFT/BaseNFT.sol";
import "./ForeAnalystNFT/TransferingWhitelist.sol";


contract ForeAnalystNFT is
    BaseNFT,
    TransferingWhitelist
{

    constructor ()
        BaseNFT(
            "ForeAnalystNFT",
            "FORE",
            "http://example.com/r/"
        )
    {
    }

    /**
     * @inheritdoc BaseNFT
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(BaseNFT, TransferingWhitelist)
    {
        BaseNFT._beforeTokenTransfer(from, to, tokenId);
        TransferingWhitelist._beforeTokenTransfer(from, to, tokenId);
    }

}
