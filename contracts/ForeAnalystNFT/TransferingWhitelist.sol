// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


abstract contract TransferingWhitelist is
    Ownable
{

    error TransferNotAllowed();


    event WhitelistActivityChanged(bool active);
    event WhitelistAccountChanged(address account, bool active);


    /// @notice Whitelist activity toggle
    bool private _whitelistFeatureActive;

    /// @notice Account whitelist
    mapping(address => bool) private _accountWhitelist;


    /**
     * @notice Returns activity of whitelist feature
     */
    function getWhitelistFeatureActive() public view returns (bool)
    {
        return _whitelistFeatureActive;
    }

    /**
     * @notice Changes activity of whitelist feature
     * @param active Activity
     */
    function setWhitelistFeatureActive(
        bool active
    ) external
        onlyOwner
    {
        _whitelistFeatureActive = active;

        emit WhitelistActivityChanged(active);
    }

    /**
     * @notice Returns whether account is whitelisted
     */
    function getAccountWhitelisted(
        address account
    ) public view returns (bool)
    {
        return _accountWhitelist[account];
    }

    /**
     * @notice Changes account whitelisting
     * @param account Account address
     * @param active Activity
     */
    function setAccountWhitelisted(
        address account,
        bool active
    ) external
        onlyOwner
    {
        _accountWhitelist[account] = active;

        emit WhitelistAccountChanged(account, active);
    }


    /**
     * @notice Adds account whitelist check
     * @dev Transfers are allowed only from whitelisted account or to whitelisted account
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual
    {
        if (_whitelistFeatureActive) {
            // allow transfering to or transfering from whitelisted address
            if (
                !_accountWhitelist[from]
                && !_accountWhitelist[to]
            ) {
                revert TransferNotAllowed();
            }
        }
    }

}
