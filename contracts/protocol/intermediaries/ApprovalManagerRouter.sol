// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import "../IForeProtocol.sol";

contract ApprovalManagerRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidToken();
    error InvalidSpender();
    error InvalidOperator();

    /// @notice Permit2 Contract
    IAllowanceTransfer public immutable permit2;

    /// @notice Protocol Contract
    IForeProtocol public immutable foreProtocol;

    /// @notice ForeToken
    IERC20 public immutable foreToken;

    constructor(
        IForeProtocol protocolAddress,
        IAllowanceTransfer permit2Address
    ) {
        foreProtocol = protocolAddress;
        foreToken = IERC20(protocolAddress.foreToken());
        permit2 = permit2Address;
    }

    modifier isValidOperator(address operator) {
        bool isValid = foreProtocol.isForeOperator(operator);
        if (!isValid) {
            revert InvalidOperator();
        }
        _;
    }

    /// @notice Permits and add new prediction via Router
    /// @param permitSingle Data signed over by the owner specifying the terms of approval
    /// @param signature The owner's signature over the permit data
    /// @param market Market address
    /// @param amount Amount of ForeToken
    /// @param side Predicition side (true - positive result, false - negative result)
    function permitPredict(
        IAllowanceTransfer.PermitSingle calldata permitSingle,
        bytes calldata signature,
        address market,
        uint160 amount,
        bool side
    ) external isValidOperator(market) nonReentrant {
        _permit(permitSingle, signature);
        _transferAndApprove(market, amount);

        IBasicMarket(market).predict(amount, side);
    }

    /// @notice Add new prediction via Router
    /// @param market Market address
    /// @param amount Amount of ForeToken
    /// @param side Predicition side (true - positive result, false - negative result)
    function predict(
        address market,
        uint160 amount,
        bool side
    ) external isValidOperator(market) nonReentrant {
        _transferAndApprove(market, amount);

        IBasicMarket(market).predict(amount, side);
    }

    /// @notice Permit a spender to a given amount of the owners token via Permit2
    /// @param permitSingle Data signed over by the owner specifying the terms of approval
    /// @param signature The owner's signature over the permit data
    function _permit(
        IAllowanceTransfer.PermitSingle calldata permitSingle,
        bytes calldata signature
    ) internal {
        if (permitSingle.details.token != address(foreToken)) {
            revert InvalidToken();
        }
        if (permitSingle.spender != address(this)) {
            revert InvalidSpender();
        }
        permit2.permit(msg.sender, permitSingle, signature);
    }

    /// @notice Transfer tokens from one address to another and subsequently approve the tokens to the spender
    /// @param spender The address of the spender
    /// @param amount The amount of the token to transfer
    function _transferAndApprove(address spender, uint160 amount) internal {
        permit2.transferFrom(
            msg.sender,
            address(this),
            amount,
            address(foreToken)
        );
        foreToken.safeApprove(spender, amount);
    }
}

interface IBasicMarket {
    function predict(uint256 amount, bool side) external;
}
