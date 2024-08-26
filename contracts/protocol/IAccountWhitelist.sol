// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IAccountWhitelist {
    function isAccountWhitelisted(address acount) external view returns (bool);
}
