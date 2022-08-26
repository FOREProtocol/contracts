// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./BasicMarket.sol";
import "../../../verifiers/IForeVerifiers.sol";
import "../../config/IProtocolConfig.sol";
import "../../IForeProtocol.sol";

contract BasicFactory{

    /// @notice Init creatin code
    /// @dev Needed to calculate market address
    bytes32 public constant INIT_CODE_PAIR_HASH =
        keccak256(abi.encodePacked(type(BasicMarket).creationCode));

    /// @notice Protocol Contract
    IForeProtocol public foreProtocol;

    /// @notice ForeToken
    IERC20Burnable public immutable foreToken;

    /// @notice Protocol Config
    IProtocolConfig public immutable config;

    /// @notice ForeVerifiers
    IForeVerifiers public immutable foreVerifiers;

    /// @param protocolAddress Protocol Contract address
    constructor(IForeProtocol protocolAddress){
        foreProtocol = protocolAddress;
        config = IProtocolConfig(protocolAddress.config());
        foreToken = IERC20Burnable(protocolAddress.foreToken());
        foreVerifiers = IForeVerifiers(protocolAddress.foreVerifiers());
    }

    /// @notice Creates Market
    /// @param marketHash market hash
    /// @param receiver market creator nft receiver
    /// @param amountA initial prediction for side A
    /// @param amountB initial prediction for side B
    /// @param endPredictionTimestamp End predictions unix timestamp
    /// @param startVerificationTimestamp Start Verification unix timestamp
    /// @return createdMarket Address of created market
    function createMarket(
        bytes32 marketHash,
        address receiver,
        uint256 amountA,
        uint256 amountB,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp
    ) external returns (address createdMarket) {
        if (endPredictionTimestamp > startVerificationTimestamp) {
            revert("ForeMarkets: Date error");
        }

        bytes memory bytecode = type(BasicMarket).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(marketHash));
        assembly {
            createdMarket := create2(
                0,
                add(bytecode, 32),
                mload(bytecode),
                salt
            )
            if iszero(extcodesize(createdMarket)) {
                revert(0, 0)
            }
        }

        uint256 amountSum = amountA + amountB;
        if (amountSum != 0) {
            foreToken.transferFrom(msg.sender, createdMarket, amountSum);
        }

        uint256 marketIdx = foreProtocol.createMarket(marketHash, receiver, createdMarket);

        BasicMarket(createdMarket).initialize(
            marketHash,
            receiver,
            amountA,
            amountB,
            endPredictionTimestamp,
            startVerificationTimestamp,
            uint64(marketIdx)
        );
    }
}
