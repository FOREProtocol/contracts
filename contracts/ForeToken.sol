// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract ForeToken is ERC20, ERC20Burnable {
    constructor() ERC20("ForeToken", "FORE") {
        _mint(msg.sender, 1000000000 ether);
    }
}
