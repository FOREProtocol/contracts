// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./GovernorInterfaces.sol";

/// @notice Supposed to be set as Governor moderator address
contract GovernorModerator {
    GovernorInterface public governor;
    address public moderator;

    constructor(address governorAddress, address moderatorAddress) {
        governor = GovernorInterface(governorAddress);
        moderator = moderatorAddress;
    }

    function isModerator(address account) public view returns (bool) {
        return account != address(0) && account == moderator;
    }

    function callQueue(uint proposalId) external {
        require(isModerator(msg.sender), "moderator only");
        governor.queue(proposalId);
    }
}
