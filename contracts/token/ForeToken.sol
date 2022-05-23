// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../IForeMarkets.sol";

contract ForeToken is
    ERC20,
    ERC20Burnable,
    Ownable
{

    error FactoryAlreadySet();

    event FactoryChanged(IForeMarkets addr);


    /// @notice Markets factory contract
    IForeMarkets internal _factory;

    constructor()
        ERC20("ForeToken", "FORE")
    {
        _mint(msg.sender, 1000000000 ether);
    }

    /**
     * @notice Returns market factory contract address
     */
    function factory() external view returns (address) {
        return address(_factory);
    }

    /**
     * @notice Changes factory contract
     * @param addr New contract
     */
    function setFactory(IForeMarkets addr)
        external
        onlyOwner
    {
        if (address(_factory) != address(0)) {
            revert FactoryAlreadySet();
        }

        _factory = addr;

        emit FactoryChanged(addr);
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
            address(_factory) != address(0)
            && _factory.isForeOperator(spender)
        ) {
            return;
        }

        return super._spendAllowance(owner, spender, amount);
    }
}
