// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

error TokenAlreadyRegistered();
error TokenNotRegistered();
error InvalidToken();
error InvalidDiscountRate();

contract TokenIncentiveRegistry is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    struct TokenData {
        /// @notice Token address
        address tokenAddress;
        /// @notice Token discount rate
        uint8 discountRate;
    }

    /// @notice List of discounts
    mapping(address => uint8) public discountRateRegistry;

    /// EVENTS
    event TokenAdded(address indexed token, uint8 discountRate);
    event TokenRemoved(address indexed token, uint256 timestamp);
    event SetDiscountRate(address indexed token, uint256 indexed discount);

    /// Initializer
    function initialize(TokenData[] memory tokens) public initializer {
        __Ownable_init();
        for (uint i = 0; i < tokens.length; i++) {
            address tokenAddress = tokens[i].tokenAddress;
            uint8 discountRate = tokens[i].discountRate;

            if (tokenAddress == address(0)) {
                revert InvalidToken();
            }
            if (discountRate == 0) {
                revert InvalidDiscountRate();
            }
            discountRateRegistry[tokenAddress] = discountRate;
        }
    }

    /// @notice Returns the discount rate of the token
    /// @param token Address of the token
    /// @return Discount rate
    function getDiscountRate(address token) external view returns (uint8) {
        return discountRateRegistry[token];
    }

    /// @notice Checks if token is added in the registry
    /// @param token Address of the token
    /// @return boolean
    function isTokenEnabled(address token) external view returns (bool) {
        return discountRateRegistry[token] != 0;
    }

    /// @notice Adds a token to the registry and sets the discount rate
    /// @param token Address of the token
    /// @param discountRate Discount rate
    function addToken(address token, uint8 discountRate) external onlyOwner {
        if (token == address(0)) {
            revert InvalidToken();
        }
        if (discountRateRegistry[token] != 0) {
            revert TokenAlreadyRegistered();
        }
        if (discountRate == 0) {
            revert InvalidDiscountRate();
        }
        discountRateRegistry[token] = discountRate;

        emit TokenAdded(token, discountRate);
    }

    /// @notice Sets token discount rate
    /// @param token Address of the token
    /// @param discountRate Discount rate
    function setDiscountRate(
        address token,
        uint8 discountRate
    ) external onlyOwner {
        if (discountRateRegistry[token] == 0) {
            revert TokenNotRegistered();
        }
        if (discountRate == 0) {
            revert InvalidDiscountRate();
        }
        discountRateRegistry[token] = discountRate;

        emit SetDiscountRate(token, discountRate);
    }

    /// @notice Disables token from the mapping
    /// @param token Address of the token
    function removeToken(address token) external onlyOwner {
        if (discountRateRegistry[token] == 0) {
            revert TokenNotRegistered();
        }
        discountRateRegistry[token] = 0;

        emit TokenRemoved(token, block.timestamp);
    }

    /// @notice Ensure only the owner can upgrade the contract
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
