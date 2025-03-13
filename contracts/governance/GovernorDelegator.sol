// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./GovernorInterfaces.sol";

contract GovernorDelegator is GovernorDelegatorInterface {
    bytes32 internal constant _IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(
        address timelock_,
        address comp_,
        address admin_,
        address implementation_,
        uint votingPeriod_,
        uint votingDelay_,
        uint proposalThreshold_
    ) {
        require(admin_ != address(0), "invalid admin address");

        admin = msg.sender;
        delegateTo(
            implementation_,
            abi.encodeWithSignature(
                "initialize(address,address,uint256,uint256,uint256)",
                timelock_,
                comp_,
                votingPeriod_,
                votingDelay_,
                proposalThreshold_
            )
        );
        admin = admin_;
        _setImplementation(implementation_);
    }

    /**
     * @notice Updates the implementation of the delegator (only callable by admin)
     * @param implementation_ The address of the new implementation for delegation
     */
    function _setImplementation(address implementation_) public {
        require(
            msg.sender == admin,
            "GovernorDelegator::_setImplementation: admin only"
        );
        require(
            implementation_ != address(0),
            "GovernorDelegator::_setImplementation: invalid implementation address"
        );

        emit NewImplementation(_getImplementation(), implementation_);

        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(_IMPLEMENTATION_SLOT, implementation_)
        }
    }

    /**
     * @notice Retrieves the current implementation contract address
     */
    function _getImplementation() public view returns (address implementation) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            implementation := sload(_IMPLEMENTATION_SLOT)
        }
    }

    /**
     * @notice Internal method to delegate execution to another contract
     * @dev It returns to the external caller whatever the implementation returns or forwards reverts
     * @param callee The contract to delegatecall
     * @param data The raw data to delegatecall
     */
    function delegateTo(address callee, bytes memory data) internal {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returnData) = callee.delegatecall(data);

        // solhint-disable-next-line no-inline-assembly
        assembly {
            if eq(success, 0) {
                revert(add(returnData, 0x20), returndatasize())
            }
        }

        require(
            returnData.length == 0 ||
                (returnData.length >= 32 &&
                    uint256(abi.decode(returnData, (uint256))) != 0),
            "GovernorDelegator::delegateTo: delegate call failed"
        );
    }

    /**
     * @notice Transfers contract funds (Only admin)
     */
    function _forwardFunds(address payable recipient, uint256 amount) external {
        require(
            msg.sender == admin,
            "GovernorDelegator::_forwardFunds: admin only"
        );
        require(
            address(this).balance >= amount,
            "GovernorDelegator::_forwardFunds: insufficient balance"
        );

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "GovernorDelegator::_forwardFunds: transfer failed");
    }

    /**
     * @dev Delegates execution to an implementation contract.
     * It returns to the external caller whatever the implementation returns
     * or forwards reverts.
     */
    // solhint-disable-next-line no-complex-fallback
    fallback() external payable {
        address impl = _getImplementation();
        require(
            impl != address(0),
            "GovernorDelegator::fallback: no implementation set"
        );

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = impl.delegatecall(msg.data);

        // solhint-disable-next-line no-inline-assembly
        assembly {
            let free_mem_ptr := mload(0x40)
            returndatacopy(free_mem_ptr, 0, returndatasize())

            switch success
            case 0 {
                revert(free_mem_ptr, returndatasize())
            }
            default {
                return(free_mem_ptr, returndatasize())
            }
        }
    }

    /**
     * @dev This is a fallback function that allows the contract to receive Ether.
     * It is called when the contract is sent Ether without any data.
     */
    receive() external payable {}
}
