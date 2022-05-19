// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../IForeMarkets.sol";

contract ForeToken is ERC20, ERC20Burnable, Ownable {
    IForeMarkets internal _factory;

    constructor() ERC20("ForeToken", "Fore") {
        _mint(msg.sender, 1000000000 ether);
    }

    function factory() external view returns (address) {
        return address(_factory);
    }

    function setFactory(IForeMarkets factoryAddress) external onlyOwner {
        require(address(_factory) == address(0), "Already set");
        _factory = factoryAddress;
    }

    function _spendAllowance(
        address owner,
        address spender,
        uint256 amount
    ) internal override {
        if (
            address(_factory) != address(0) &&
             _factory.isForeOperator(spender)
        ) {
            return;
        }

        return super._spendAllowance(owner, spender, amount);
    }
}
