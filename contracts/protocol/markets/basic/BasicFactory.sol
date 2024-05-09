// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./BasicMarket.sol";
import "./library/MarketLib.sol";
import "../../../verifiers/IForeVerifiers.sol";
import "../../config/IProtocolConfig.sol";

contract BasicFactory is Ownable {
    using SafeERC20 for IERC20Burnable;

    /// @notice Init creatin code
    /// @dev Needed to calculate market address
    bytes32 public constant INIT_CODE_PAIR_HASH =
        keccak256(abi.encodePacked(type(BasicMarket).creationCode));

    /// @notice Prediction flat fee rate - 10%
    uint32 public predictionFlatFeeRate = 1000;

    /// @notice Market creation flat fee rate - 1%
    uint32 public marketCreationFlatFeeRate = 100;

    /// @notice Verification flat fee rate - 1%
    uint32 public verificationFlatFeeRate = 100;

    /// @notice Foundation flat fee rate - 18%
    uint32 public foundationFlatFeeRate = 1800;

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
    event SetMarketCreationFlatFeeRate(uint32 indexed feeRate);
    event SetVerificationFlatFeeRate(uint32 indexed feeRate);
    event SetFoundationFlatFeeRate(uint32 indexed feeRate);

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

        MarketLib.MarketCreationInitialData memory payload = MarketLib
            .MarketCreationInitialData(
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
                predictionFlatFeeRate,
                verificationFlatFeeRate,
                foundationFlatFeeRate
            );

        createdMarketContract.initialize(payload);
    }

    /**
     * @notice Sets the flat fee rate for prediction operations.
     * @dev Can only be called by the contract owner. Emits a SetPredictionFlatFeeRate event.
     * @param feeRate The new flat fee rate for predictions.
     */
    function setPredictionFlatFeeRate(uint32 feeRate) external onlyOwner {
        predictionFlatFeeRate = feeRate;
        emit SetPredictionFlatFeeRate(feeRate);
    }

    /**
     * @notice Sets the flat fee rate for market creation operations.
     * @dev Can only be called by the contract owner. Emits a SetMarketCreationFlatFeeRate event.
     * @param feeRate The new flat fee rate for market creation.
     */
    function setMarketCreationFlatFeeRate(uint32 feeRate) external onlyOwner {
        marketCreationFlatFeeRate = feeRate;
        emit SetMarketCreationFlatFeeRate(feeRate);
    }

    /**
     * @notice Sets the flat fee rate for verification operations.
     * @dev Can only be called by the contract owner. Emits a SetVerificationFlatFeeRate event.
     * @param feeRate The new flat fee rate for verifications.
     */
    function setVerificationFlatFeeRate(uint32 feeRate) external onlyOwner {
        verificationFlatFeeRate = feeRate;
        emit SetVerificationFlatFeeRate(feeRate);
    }

    /**
     * @notice Sets the flat fee rate for foundation-related operations.
     * @dev Can only be called by the contract owner. Emits a SetFoundationFlatFeeRate event.
     * @param feeRate The new flat fee rate for foundation operations.
     */
    function setFoundationFlatFeeRate(uint32 feeRate) external onlyOwner {
        foundationFlatFeeRate = feeRate;
        emit SetFoundationFlatFeeRate(feeRate);
    }
}
