// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";

error InvalidAccount();

contract AccountWhitelist is
    Initializable,
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
        __AccessManaged_init(initialAuthority);
        __UUPSUpgradeable_init();

        for (uint i = 0; i < initialAccounts.length; i++) {
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
    ) external restricted {
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

    /// @notice Ensure only the owner can upgrade the contract
    function _authorizeUpgrade(address) internal override restricted {}
}
