// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../protocol/markets/basic/library/ArrayUtils.sol";

contract TestArrayUtils {
    function findMaxIndex(
        uint256[] memory array
    ) external pure returns (uint8 maxIndex) {
        return ArrayUtils.findMaxIndex(array);
    }
}
