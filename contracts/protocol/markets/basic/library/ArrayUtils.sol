// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

/**
 * @title Array Utilities
 * @dev Provides utility functions for array management.
 */
library ArrayUtils {
    /**
     * @notice Finds the index of the first non-zero element in the array.
     * @dev Returns the index of the first non-zero element, or -1 if all elements are zero.
     * @param array The array to search through.
     * @return The index of the first non-zero element as int8, or -1 if no non-zero element is found.
     */
    function findNonZeroIndex(
        uint256[] memory array
    ) internal pure returns (int8) {
        for (uint8 i = 0; i < array.length; i++) {
            if (array[i] != 0) {
                return int8(i);
            }
        }
        return -1;
    }

    /**
     * @notice Checks if there exists at least one element in the array that is greater than or equal to the specified value.
     * @dev Iterates through the array and returns true if an element greater than or equal to `value` is found.
     * @param array The array of `uint256` to search through.
     * @param value The `uint256` value to compare against the array elements.
     * @return bool Returns true if an element greater than or equal to `value` is found, otherwise false.
     */
    function containsValueGreaterThanOrEqual(
        uint256[] memory array,
        uint256 value
    ) internal pure returns (bool) {
        for (uint256 i = 0; i < array.length; i++) {
            if (value <= array[i]) {
                return true;
            }
        }
        return false;
    }
}
