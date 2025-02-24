// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./GovernorInterfaces.sol";

// Timelock == admin of the protocol contracts
contract Timelock is TimelockInterface {
    // admin of this contract == Governor
    event NewAdmin(address indexed newAdmin);
    event NewPendingAdmin(address indexed newPendingAdmin);
    event NewDelay(uint indexed newDelay);
    event CancelTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint value,
        string signature,
        bytes data,
        uint eta
    );
    event ExecuteTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint value,
        string signature,
        bytes data,
        uint eta
    );
    event QueueTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint value,
        string signature,
        bytes data,
        uint eta
    );

    uint public constant GRACE_PERIOD = 14 days;
    uint public constant MINIMUM_DELAY = 2 days;
    uint public constant MAXIMUM_DELAY = 30 days;

    address public admin;
    address public pendingAdmin;
    uint public delay;

    mapping(bytes32 => bool) public queuedTransactions;

    constructor(address admin_, uint delay_) {
        require(
            delay_ >= MINIMUM_DELAY,
            "Timelock::constructor: Delay must exceed minimum delay"
        );
        require(
            delay_ <= MAXIMUM_DELAY,
            "Timelock::constructor: Delay must not exceed maximum delay"
        );
        require(
            admin_ != address(0),
            "Timelock::constructor: Admin cannot be zero address"
        );

        admin = admin_;
        delay = delay_;
    }

    function _setDelay(uint newDelay) public {
        require(
            msg.sender == admin || msg.sender == address(this),
            "Timelock::_setDelay: Call must come from admin or Timelock"
        );
        require(
            newDelay >= MINIMUM_DELAY,
            "Timelock::_setDelay: Delay must exceed minimum delay"
        );
        require(
            newDelay <= MAXIMUM_DELAY,
            "Timelock::_setDelay: Delay must not exceed maximum delay"
        );
        delay = newDelay;

        emit NewDelay(delay);
    }

    function _acceptAdminOf(address addr) external {
        require(
            msg.sender == admin,
            "Timelock::setPendingAdmin: Call must come from admin"
        );
        AcceptAdminInterface(addr)._acceptAdmin();
    }

    function _acceptAdmin() external {
        require(
            msg.sender == pendingAdmin,
            "Timelock::acceptAdmin: Call must come from pendingAdmin"
        );
        admin = msg.sender;
        pendingAdmin = address(0);

        emit NewAdmin(admin);
        emit NewPendingAdmin(pendingAdmin);
    }

    function _setPendingAdmin(address newPendingAdmin) external {
        require(
            msg.sender == admin || msg.sender == address(this),
            "Timelock::setPendingAdmin: Call must come from admin or Timelock"
        );
        require(
            newPendingAdmin != address(0),
            "Timelock::setPendingAdmin: Admin cannot be zero address"
        );
        pendingAdmin = newPendingAdmin;

        emit NewPendingAdmin(pendingAdmin);
    }

    function queueTransaction(
        address target,
        uint value,
        string memory signature,
        bytes memory data,
        uint eta
    ) public returns (bytes32) {
        require(
            msg.sender == admin,
            "Timelock::queueTransaction: Call must come from admin"
        );
        require(
            eta >= getBlockTimestamp() + delay,
            "Timelock::queueTransaction: Estimated execution block must satisfy delay"
        );

        bytes32 txHash = keccak256(
            abi.encode(target, value, signature, data, eta)
        );
        queuedTransactions[txHash] = true;

        emit QueueTransaction(txHash, target, value, signature, data, eta);
        return txHash;
    }

    function cancelTransaction(
        address target,
        uint value,
        string memory signature,
        bytes memory data,
        uint eta
    ) public {
        require(
            msg.sender == admin,
            "Timelock::cancelTransaction: Call must come from admin"
        );

        bytes32 txHash = keccak256(
            abi.encode(target, value, signature, data, eta)
        );
        queuedTransactions[txHash] = false;

        emit CancelTransaction(txHash, target, value, signature, data, eta);
    }

    function executeTransaction(
        address target,
        uint value,
        string memory signature,
        bytes memory data,
        uint eta
    ) public payable returns (bytes memory) {
        require(
            msg.sender == admin,
            "Timelock::executeTransaction: Call must come from admin"
        );

        bytes32 txHash = keccak256(
            abi.encode(target, value, signature, data, eta)
        );
        require(
            queuedTransactions[txHash],
            "Timelock::executeTransaction: Transaction hasn't been queued"
        );
        require(
            getBlockTimestamp() >= eta,
            "Timelock::executeTransaction: Transaction hasn't surpassed time lock"
        );
        require(
            getBlockTimestamp() <= eta + GRACE_PERIOD,
            "Timelock::executeTransaction: Transaction is stale"
        );
        require(
            value == msg.value,
            "Timelock::executeTransaction: Transaction ETH value mismatch"
        );

        queuedTransactions[txHash] = false;

        bytes memory callData;

        if (bytes(signature).length == 0) {
            callData = data;
        } else {
            callData = abi.encodePacked(
                bytes4(keccak256(bytes(signature))),
                data
            );
        }

        // solium-disable-next-line security/no-call-value
        (bool success, bytes memory returnData) = target.call{value: value}(
            callData
        );
        require(
            success,
            "Timelock::executeTransaction: Transaction execution reverted"
        );

        emit ExecuteTransaction(txHash, target, value, signature, data, eta);

        return returnData;
    }

    function getBlockTimestamp() public view virtual returns (uint) {
        // solium-disable-next-line security/no-block-members
        return block.timestamp;
    }
}
