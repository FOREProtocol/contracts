// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./BasicMarket.sol";
import "../../../verifiers/IForeVerifiers.sol";
import "../../config/IProtocolConfig.sol";
import "../../../token/ITokenIncentiveRegistry.sol";

contract BasicFactory is Ownable {
    using SafeERC20 for IERC20Burnable;

    /// @notice Init creatin code
    /// @dev Needed to calculate market address
    bytes32 public constant INIT_CODE_PAIR_HASH =
        keccak256(abi.encodePacked(type(BasicMarket).creationCode));

    /// @notice Prediction flat fee rate
    uint32 public predictionFlatFeeRate = 10;

    /// @notice Token registry
    address public immutable tokenRegistry;

    /// @notice Protocol Contract
    IForeProtocol public immutable foreProtocol;

    /// @notice ForeToken
    IERC20Burnable public immutable foreToken;

    /// @notice Protocol Config
    IProtocolConfig public immutable config;

    /// @notice ForeVerifiers
    IForeVerifiers public immutable foreVerifiers;

    /// EVENTS
    event SetPredictionFlatFeeRate(uint32 indexed feeRate);

    /// @param protocolAddress Protocol Contract address
    constructor(IForeProtocol protocolAddress, address _tokenRegistry) {
        foreProtocol = protocolAddress;
        config = IProtocolConfig(protocolAddress.config());
        foreToken = IERC20Burnable(protocolAddress.foreToken());
        foreVerifiers = IForeVerifiers(protocolAddress.foreVerifiers());
        tokenRegistry = _tokenRegistry;
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
            revert("BasicFactory: Date error");
        }

        BasicMarket createdMarketContract = new BasicMarket{salt: marketHash}();

        createdMarket = address(createdMarketContract);

        uint256 creationFee = config.marketCreationPrice();
        if (creationFee != 0) {
            foreToken.burnFrom(msg.sender, creationFee);
        }

        uint256 amountSum = amountA + amountB;
        if (amountSum != 0) {
            foreToken.safeTransferFrom(msg.sender, createdMarket, amountSum);
        }

        uint256 marketIdx = foreProtocol.createMarket(
            marketHash,
            msg.sender,
            receiver,
            createdMarket
        );

        createdMarketContract.initialize(
            marketHash,
            receiver,
            amountA,
            amountB,
            address(foreProtocol),
            tokenRegistry,
            owner(),
            endPredictionTimestamp,
            startVerificationTimestamp,
            uint64(marketIdx),
            predictionFlatFeeRate
        );
    }

    function setPredictionFlatFeeRate(uint32 feeRate) external onlyOwner {
        predictionFlatFeeRate = feeRate;

        emit SetPredictionFlatFeeRate(feeRate);
    }
}
