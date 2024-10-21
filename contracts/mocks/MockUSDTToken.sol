// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "openzeppelin-v4/contracts/token/ERC20/ERC20.sol";

/// @custom:security-contact security@foreprotocol.io
contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "MUSDT") {
        _mint(msg.sender, 1000000000 * 10 ** decimals());
    }
}
