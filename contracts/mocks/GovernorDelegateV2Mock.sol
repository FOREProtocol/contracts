// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../governance/GovernorDelegate.sol";

contract GovernorDelegateV2Mock is GovernorDelegate {
    int public foo;

    function getFoo() external view returns (int) {
        return foo;
    }

    function setFoo(int _foo) external {
        foo = _foo;
    }
}
