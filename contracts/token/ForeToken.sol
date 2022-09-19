// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../protocol/IForeProtocol.sol";

contract ForeToken is
    ERC20,
    ERC20Burnable,
    Ownable
{

    error ProtocolAlreadySet();

    event ProtocolChanged(IForeProtocol addr);


    /// @notice Protocol contract
    IForeProtocol public protocol;

    constructor()
        ERC20("ForeToken", "FORE")
    {
        _mint(msg.sender, 1000000000 ether);
    }

    /**
     * @notice Changes protocol contract
     * @param addr New contract
     */
    function setProtocol(IForeProtocol addr)
        external
        onlyOwner
    {
        if (address(protocol) != address(0)) {
            revert ProtocolAlreadySet();
        }

        protocol = addr;

        emit ProtocolChanged(addr);
    }

    /**
     * @inheritdoc ERC20
     * @dev It is always allowed for Fore operator
     */
    function _spendAllowance(
        address owner,
        address spender,
        uint256 amount
    ) internal override {
        if (
            address(protocol) != address(0)
            && protocol.isForeOperator(spender)
        ) {
            return;
        }

        return super._spendAllowance(owner, spender, amount);
    }
}
