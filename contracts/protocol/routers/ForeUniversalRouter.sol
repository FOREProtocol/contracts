// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import "../IForeProtocol.sol";

error InvalidToken();
error InvalidSpender();
error InvalidOperator();
error InvalidTarget();
error InvalidSelector();
error InvalidMsgSender();
error CallFunctionFailed();

/// @custom:security-contact security@foreprotocol.io
contract ForeUniversalRouter is
    Initializable,
    PausableUpgradeable,
    AccessManagedUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    /// @notice Permit2 Contract
    IAllowanceTransfer public permit2;

    /// @notice Protocol Contract
    IForeProtocol public foreProtocol;

    /// @notice tokens
    mapping(address => bool) public tokens;

    /// @notice Allowed functions
    mapping(bytes4 => bool) private allowedFunctions;

    /// EVENTS
    event PermitUsed(
        address indexed owner,
        address indexed spender,
        address indexed token,
        uint256 amount
    );
    event CallFunction(
        address indexed target,
        bytes data,
        address token,
        uint160 amount
    );
    event ManagedToken(address indexed token, bool indexed shouldAdd);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract
     * @param protocolAddress The address of the ForeProtocol contract to be used by this contract.
     * @param permit2Address The address of the Permit2 contract for handling allowances.
     * @param tokenAddresses An array of token addresses to be marked as valid tokens within the contract
     */
    function initialize(
        address initialAuthority,
        IForeProtocol protocolAddress,
        IAllowanceTransfer permit2Address,
        address[] memory tokenAddresses
    ) public initializer {
        __Pausable_init();
        __AccessManaged_init(initialAuthority);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        foreProtocol = protocolAddress;
        permit2 = permit2Address;

        for (uint i = 0; i < tokenAddresses.length; i++) {
            if (tokenAddresses[i] == address(0)) {
                revert InvalidToken();
            }
            tokens[tokenAddresses[i]] = true;
        }

        allowedFunctions[
            bytes4(keccak256("predictFor(address,uint256,uint8)"))
        ] = true;
        allowedFunctions[
            bytes4(keccak256("openDisputeFor(address,bytes32)"))
        ] = true;
        allowedFunctions[
            bytes4(
                keccak256(
                    "createMarket(bytes32,address,uint256[],uint64,uint64,address)"
                )
            )
        ] = true;
    }

    /**
     * @notice Verify the validity of a function call based on the target address, operator status, and function selector.
     * @param target The address that is being targeted for the function call
     * @param data The calldata containing the function selector and parameters
     */
    modifier verifyFunction(address target, bytes calldata data) {
        if (target == address(0)) {
            revert InvalidOperator();
        }
        bool isValid = foreProtocol.isForeOperator(target);
        if (!isValid) {
            revert InvalidOperator();
        }

        bytes4 selector;
        assembly {
            selector := calldataload(data.offset)
        }

        if (!allowedFunctions[selector]) {
            revert InvalidSelector();
        }

        /// @notice We need to check if the address is the actual `msg.sender` so that no one
        ///         can create unauthorized predictions for any user
        if (
            selector == bytes4(keccak256("predictFor(address,uint256,uint8)"))
        ) {
            (address extractedAddress, , ) = abi.decode(
                data[4:], // Skips the selector
                (address, uint256, uint8)
            );
            if (extractedAddress != msg.sender) {
                revert InvalidMsgSender();
            }
        }
        if (selector == bytes4(keccak256("openDisputeFor(address,bytes32)"))) {
            (address extractedAddress, ) = abi.decode(
                data[4:], // Skips the selector
                (address, bytes32)
            );
            if (extractedAddress != msg.sender) {
                revert InvalidMsgSender();
            }
        }
        _;
    }

    /**
     * @notice Call one of the allowed functions on a target FORE operated contract.
     * @param target The address of the contract to call.
     * @param data The calldata of the function to call, including the function signature and parameters.
     * @param token The token to be used
     * @param amount The amount of token will be used
     * @return success Indicates whether the call was successful.
     * @return result The returned data from the function call.
     */
    function callFunction(
        address target,
        bytes calldata data,
        address token,
        uint160 amount
    )
        external
        payable
        verifyFunction(target, data)
        whenNotPaused
        nonReentrant
        returns (bool success, bytes memory result)
    {
        _transferAndApprove(target, amount, token);

        (success, result) = target.call(data);
        if (!success) {
            revert CallFunctionFailed();
        }

        emit CallFunction(target, data, token, amount);
    }

    /**
     * @notice Permits and call any function on a target FORE operated contract.
     * @param permitSingle Data signed over by the owner specifying the terms of approval
     * @param signature The owner's signature over the permit data
     * @param target The address of the contract to call.
     * @param data The calldata of the function to call, including the function signature and parameters.
     * @param token The token to be used
     * @param amount The amount of token will be used
     * @return success Indicates whether the call was successful.
     * @return result The returned data from the function call.
     */
    function permitCallFunction(
        IAllowanceTransfer.PermitSingle calldata permitSingle,
        bytes calldata signature,
        address target,
        bytes calldata data,
        address token,
        uint160 amount
    )
        external
        payable
        verifyFunction(target, data)
        whenNotPaused
        nonReentrant
        returns (bool success, bytes memory result)
    {
        _permit(permitSingle, signature);
        _transferAndApprove(target, amount, token);

        (success, result) = target.call(data);
        if (!success) {
            revert CallFunctionFailed();
        }

        emit CallFunction(target, data, token, amount);
    }

    /**
     * @notice Permit (external function)
     * @param permitSingle Data signed over by the owner specifying the terms of approval
     * @param signature The owner's signature over the permit data
     */
    function permit(
        IAllowanceTransfer.PermitSingle calldata permitSingle,
        bytes calldata signature
    ) external whenNotPaused {
        _permit(permitSingle, signature);
    }

    /**
     * @notice Adds or removes a token from the supported tokens list.
     * @dev The address provided must be a valid contract address.
     * @param token The address of the token contract.
     * @param shouldAdd Boolean flag indicating whether to add (true) or remove (false) the token.
     */
    function manageTokens(address token, bool shouldAdd) external restricted {
        if (token == address(0)) {
            revert InvalidToken();
        }
        tokens[token] = shouldAdd;

        emit ManagedToken(token, shouldAdd);
    }

    /**
     * @notice Adds or removes a new function selector to the allowed list.
     * @dev Can be restricted to only the contract owner or a specific role.
     * @param selector The function selector to allow.
     * @param shouldAdd Boolean flag indicating whether to add (true) or remove (false) the selector.
     */
    function manageAllowedFunctions(
        bytes4 selector,
        bool shouldAdd
    ) external restricted {
        allowedFunctions[selector] = shouldAdd;
    }

    /**
     * @notice Pauses the contract, preventing the execution of functions with the whenNotPaused modifier.
     * @dev Only the owner can call this function.
     */
    function pause() external restricted {
        _pause();
    }

    /**
     * @notice Unpauses the contract, allowing the execution of functions with the whenNotPaused modifier.
     * @dev Only the owner can call this function.
     */
    function unpause() external restricted {
        _unpause();
    }

    /**
     * @notice Permit a spender to a given amount of the owners token via Permit2
     * @param permitSingle Data signed over by the owner specifying the terms of approval
     * @param signature The owner's signature over the permit data
     */
    function _permit(
        IAllowanceTransfer.PermitSingle calldata permitSingle,
        bytes calldata signature
    ) internal {
        if (!tokens[permitSingle.details.token]) {
            revert InvalidToken();
        }
        if (permitSingle.spender != address(this)) {
            revert InvalidSpender();
        }

        permit2.permit(msg.sender, permitSingle, signature);

        emit PermitUsed(
            msg.sender,
            permitSingle.spender,
            permitSingle.details.token,
            permitSingle.details.amount
        );
    }

    /**
     * @notice Transfer tokens from one address to another and subsequently approve the tokens to the spender
     * @param spender The address of the spender
     * @param amount The amount of the token to transfer
     * @param token The token to be use as approval
     */
    function _transferAndApprove(
        address spender,
        uint160 amount,
        address token
    ) internal {
        permit2.transferFrom(msg.sender, address(this), amount, address(token));
        IERC20(token).forceApprove(spender, amount);
    }

    /// @notice Ensure only the owner can upgrade the contract
    function _authorizeUpgrade(address) internal override restricted {}
}
