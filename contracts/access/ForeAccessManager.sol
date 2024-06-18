// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts-v5/access/manager/AccessManager.sol";

/// @custom:security-contact security@foreprotocol.io
contract ForeAccessManager is AccessManager {
    constructor(address initialAdmin) AccessManager(initialAdmin) {}
}
