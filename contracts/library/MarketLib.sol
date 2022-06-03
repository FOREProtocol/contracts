// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "../ForeMarket.sol";

library MarketLib {
    using MarketLib for Market;

    /// @dev Checks if one side of the market is fully verified
    function _isVerified(Market memory m)
        internal
        pure
        returns (bool)
    {
        return m.sideA <= m.verifiedB || m.sideB <= m.verifiedA;
    }

    /// @dev Checks if one side of the market is fully verified
    function isVerified(Market memory m)
        external
        pure
        returns (bool)
    {
        return _isVerified(m);
    }

    /// @dev Returns the maximum value(power) available for verification for side
    function maxAmountToVerifyForSide(Market memory m, bool side)
        external
        pure
        returns (uint256)
    {
        if (_isVerified(m)) {
            return 0;
        }

        if (side) {
            return m.sideB - m.verifiedA;
        }
        else {
            return m.sideA - m.verifiedB;
        }
    }

    ///@dev Calculates Result for markeet
    ///@param m Market Info
    function calculateMarketResult(Market memory m)
        external
        pure
        returns (ResultType)
    {
        if (m.verifiedA == m.verifiedB) {
            return ResultType.DRAW;
        }
        else if (m.verifiedA > m.verifiedB) {
            return ResultType.AWON;
        }
        else {
            return ResultType.BWON;
        }
    }

}
