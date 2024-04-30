// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

/**
 * @title Array Utilities
 * @dev Provides utility functions for array management.
 */
library ArrayUtils {
    /**
     * @notice Finds the index of the first zero element in the array.
     * @dev Returns the index of the first zero element, or -1 if all elements are non-zero.
     * @param array The array to search through.
     * @return The index of the first zero element as int8, or -1 if all elements are non-zero.
     */
    function findFirstZeroValueElement(
        uint256[] memory array
    ) internal pure returns (int8) {
        for (uint8 i = 0; i < array.length; ) {
            if (array[i] == 0) {
                return int8(i);
            }
            unchecked {
                i++;
            }
        }
        return -1;
    }

    /**
     * @notice Checks if an array contains any zero value elements.
     * @dev This function iterates through the array and uses the `findFirstZeroValueElement` helper function
     * to determine if there is any element with a value of zero. It returns true if a zero value element
     * is found, and false otherwise.
     * @param array The array of unsigned integers to be checked.
     * @return bool indicating whether the array contains a zero value element.
     */
    function isArrayHasZeroValueElement(
        uint256[] memory array
    ) internal pure returns (bool) {
        int8 firstZeroIndex = findFirstZeroValueElement(array);
        return firstZeroIndex != -1;
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
        for (uint8 i = 0; i < array.length; ) {
            if (value <= array[i]) {
                return true;
            }
            unchecked {
                i++;
            }
        }
        return false;
    }

    /**
     * @notice Calculates the sum of all elements in an array.
     * @dev Uses unchecked arithmetic for gas optimization.
     * @param array The array of uint256 values to sum.
     * @return total The total sum of the array elements.
     */
    function sum(uint256[] memory array) internal pure returns (uint256 total) {
        uint256 length = array.length;
        for (uint8 i = 0; i < length; ) {
            unchecked {
                total += array[i];
                i++;
            }
        }
    }

    /**
     * @notice Checks if more than two elements in the input array have the same value
     * @param array The array of uint256 elements to check
     * @return A boolean indicating if more than two elements have the same value
     */
    function hasDuplicates(
        uint256[] memory array
    ) internal pure returns (bool) {
        uint256 length = array.length;
        for (uint256 i = 0; i < length; ) {
            for (uint256 j = i + 1; j < length; ) {
                if (array[i] == array[j]) {
                    return true;
                }
                unchecked {
                    j++;
                }
            }
            unchecked {
                i++;
            }
        }
        return false;
    }

    /**
     * @notice Finds the index of the maximum element in an array.
     * @param array The array of unsigned integers to search through.
     * @return maxIndex The index of the maximum element found in the array.
     */
    function findMaxIndex(
        uint256[] memory array
    ) internal pure returns (uint8 maxIndex) {
        require(array.length > 0, "Array must not be empty");

        maxIndex = 0;
        uint256 max = array[0];
        for (uint8 i = 1; i < array.length; i++) {
            if (array[i] > max) {
                max = array[i];
                maxIndex = i;
            }
        }
    }
}
