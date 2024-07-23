// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";

error TokenAlreadyRegistered();
error TokenNotRegistered();
error InvalidToken();
error InvalidIncentiveRates();

/// @custom:security-contact security@foreprotocol.io
contract TokenIncentiveRegistry is
    Initializable,
    AccessManagedUpgradeable,
    UUPSUpgradeable
{
    struct TokenIncentives {
        /// @notice Prediction discount rate
        uint256 predictionDiscountRate;
        /// @notice Market creator discount rate
        uint256 marketCreatorDiscountRate;
        /// @notice Prediction discount rate
        uint256 verificationDiscountRate;
        /// @notice Foundation discount rate
        uint256 foundationDiscountRate;
        /// @notice Market creation fee
        uint256 marketCreationFee;
    }

    /**
     * @notice Stores a mapping of ERC-20 token addresses to their associated incentive structures.
     * @notice Each token address is linked to a TokenIncentives struct that details various discount
     * rates applicable for different interactions.
     */
    mapping(address => TokenIncentives) public tokenIncentives;

    /// EVENTS
    event TokenAdded(address indexed token, TokenIncentives incentives);
    event TokenRemoved(address indexed token);
    event SetIncentiveRates(address indexed token, TokenIncentives incentives);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract with an initial set of tokens and their associated incentive rates.
     * This is the setup function for upgradeable contracts, meant to be called once on deployment.
     * @param tokenAddresses An array of token addresses to be registered. Each address must be non-zero.
     * @param incentives An array of TokenIncentives structures corresponding to the addresses in `tokenAddresses`.
     * Each set of incentives must have at least one non-zero rate to be valid.
     * @dev This function reverts if a token address is zero or if the corresponding incentives are all zero.
     * It ensures that the contract is only initialized once due to the `initializer` modifier.
     */
    function initialize(
        address initialAuthority,
        address[] memory tokenAddresses,
        TokenIncentives[] memory incentives
    ) public initializer {
        __AccessManaged_init(initialAuthority);
        __UUPSUpgradeable_init();

        for (uint i = 0; i < tokenAddresses.length; i++) {
            if (tokenAddresses[i] == address(0)) {
                revert InvalidToken();
            }
            if (_isZeroIncentive(incentives[i])) {
                revert InvalidIncentiveRates();
            }
            tokenIncentives[tokenAddresses[i]] = incentives[i];
        }
    }

    /**
     * @notice Retrieves the incentive rates associated with a specific token.
     * @param tokenAddress The address of the token for which incentives are being queried.
     * @return TokenIncentives A struct containing the various discount rates applicable to the token.
     */
    function getTokenIncentives(
        address tokenAddress
    ) external view returns (uint256, uint256, uint256, uint256, uint256) {
        TokenIncentives memory incentives = tokenIncentives[tokenAddress];
        return (
            incentives.predictionDiscountRate,
            incentives.marketCreatorDiscountRate,
            incentives.verificationDiscountRate,
            incentives.foundationDiscountRate,
            incentives.marketCreationFee
        );
    }

    /**
     * @dev Checks if the token is considered enabled based on the presence of any non-zero incentives.
     * @param tokenAddress The address of the token to check.
     * @return bool Returns true if any of the incentives for the token are non-zero, false otherwise.
     */
    function isTokenEnabled(address tokenAddress) external view returns (bool) {
        return !_isZeroIncentive(tokenIncentives[tokenAddress]);
    }

    /**
     * @notice Adds a new token with its corresponding incentives to the registry.
     * @param tokenAddress The address of the token to add. Must not be the zero address.
     * @param incentives The incentive rates associated with the token. At least one rate must be non-zero.
     * @dev This function reverts if any of the incentive rates are zero, indicating no active incentives.
     * It updates the `tokenIncentives` mapping and emits a `TokenAdded` event upon successful addition.
     */
    function addToken(
        address tokenAddress,
        TokenIncentives memory incentives
    ) external restricted {
        if (tokenAddress == address(0)) {
            revert InvalidToken();
        }
        if (_isZeroIncentive(incentives)) {
            revert InvalidIncentiveRates();
        }
        if (!_isZeroIncentive(tokenIncentives[tokenAddress])) {
            revert TokenAlreadyRegistered();
        }

        tokenIncentives[tokenAddress] = incentives;
        emit TokenAdded(tokenAddress, incentives);
    }

    /**
     * @notice Removes a token from the registry.
     * @param tokenAddress The address of the token to be removed.
     * @dev This function deletes the token's entry from the `tokenIncentives` mapping.
     * It emits a `TokenRemoved` event upon successful removal.
     */
    function removeToken(address tokenAddress) external restricted {
        if (_isZeroIncentive(tokenIncentives[tokenAddress])) {
            revert TokenNotRegistered();
        }

        delete tokenIncentives[tokenAddress];
        emit TokenRemoved(tokenAddress);
    }

    /**
     * @notice Updates the incentives for a token already in the registry.
     * @param tokenAddress The address of the token whose incentives are to be updated.
     * @param newIncentives The new incentives to apply to the token.
     * @dev This function updates the `tokenIncentives` mapping with new incentives for the specified token.
     * It emits a `SetIncentiveRates` event upon successfully updating the incentives.
     */
    function setTokenIncentives(
        address tokenAddress,
        TokenIncentives memory newIncentives
    ) external restricted {
        if (_isZeroIncentive(newIncentives)) {
            revert InvalidIncentiveRates();
        }
        if (_isZeroIncentive(tokenIncentives[tokenAddress])) {
            revert TokenNotRegistered();
        }

        tokenIncentives[tokenAddress] = newIncentives;
        emit SetIncentiveRates(tokenAddress, newIncentives);
    }

    /**
     * @dev Determines if all incentive rates for a token are set to zero.
     * @param incentives The TokenIncentives struct containing the discount rates for a token.
     * @return bool Returns true if all discount rates are zero, indicating no incentives or a "disabled" state.
     */
    function _isZeroIncentive(
        TokenIncentives memory incentives
    ) internal pure returns (bool) {
        return
            incentives.predictionDiscountRate == 0 &&
            incentives.marketCreatorDiscountRate == 0 &&
            incentives.verificationDiscountRate == 0 &&
            incentives.foundationDiscountRate == 0 &&
            incentives.marketCreationFee == 0;
    }

    /// @notice Ensure only the owner can upgrade the contract
    function _authorizeUpgrade(address) internal override restricted {}
}
