// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

error InvalidAccount();

contract AccountWhitelist is
    Initializable,
    PausableUpgradeable,
    AccessManagedUpgradeable,
    UUPSUpgradeable
{
    mapping(address => bool) public accounts;

    /// EVENTS
    event ManagedWhitelist(
        address indexed account,
        bool indexed shouldWhitelist
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract
     * @param initialAuthority The address that will be granted initial authority for access control
     */
    function initialize(
        address initialAuthority,
        address[] memory initialAccounts
    ) public initializer {
        if (initialAuthority == address(0)) {
            revert InvalidAccount();
        }
        __Pausable_init();
        __AccessManaged_init(initialAuthority);
        __UUPSUpgradeable_init();

        uint256 length = initialAccounts.length;
        for (uint256 i = 0; i < length; i++) {
            if (initialAccounts[i] == address(0)) {
                revert InvalidAccount();
            }
            accounts[initialAccounts[i]] = true;
        }
    }

    /**
     * @notice Manages the whitelist status of an account.
     * @param account The address of the account to be added or removed from the whitelist.
     * @param shouldWhitelist A boolean indicating whether the account should be whitelisted or not.
     */
    function manageWhitelist(
        address account,
        bool shouldWhitelist
    ) external whenNotPaused restricted {
        if (account == address(0)) {
            revert InvalidAccount();
        }
        accounts[account] = shouldWhitelist;
        emit ManagedWhitelist(account, shouldWhitelist);
    }

    /**
     * @notice Checks if an account is whitelisted.
     * @param account The address of the account to check.
     * @return A boolean indicating if the account is whitelisted.
     */
    function isAccountWhitelisted(
        address account
    ) external view returns (bool) {
        return accounts[account];
    }

    /**
     * @notice Pauses the contract, preventing the execution of functions with the whenNotPaused modifier.
     * @dev Only the authorized account can call this function
     */
    function pause() external restricted {
        _pause();
    }

    /**
     * @notice Unpauses the contract, allowing the execution of functions with the whenNotPaused modifier.
     * @dev Only the authorized account can call this function
     */
    function unpause() external restricted {
        _unpause();
    }

    /// @notice Ensure only the owner can upgrade the contract
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address) internal override restricted {}
}
