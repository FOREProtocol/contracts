// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./library/MarketLibV2.sol";
import "../../IForeProtocol.sol";
import "../../../verifiers/IForeVerifiers.sol";
import "../../config/IProtocolConfig.sol";
import "../../config/IMarketConfig.sol";
import "../../../token/ITokenIncentiveRegistry.sol";

contract BasicMarketV2 is ReentrancyGuard {
    using SafeERC20 for IERC20Burnable;

    using SafeERC20 for IERC20;

    /// @notice Market hash (ipfs hash without first 2 bytes)
    bytes32 public marketHash;

    /// @notice Prediction flat fee rate
    uint32 public predictionFlatFeeRate;

    /// @notice Market token id
    uint256 public marketId;

    /// @notice Factory
    address public immutable factory;

    /// @notice Fee receiver
    address public feeReceiver;

    /// @notice Protocol
    IForeProtocol public protocol;

    /// @notice Protocol config
    IProtocolConfig public protocolConfig;

    /// @notice Market config
    IMarketConfig public marketConfig;

    /// @notice Verifiers NFT
    IForeVerifiers public foreVerifiers;

    /// @notice Fore Token
    IERC20Burnable public foreToken;

    /// @notice Token Registry
    ITokenIncentiveRegistry public tokenRegistry;

    /// @notice Market info
    MarketLibV2.Market internal _market;

    /// @notice Predictions amount of address
    mapping(address => mapping(uint8 => uint256)) public predictions;

    /// @notice Is prediction reward withdrawn for address
    mapping(address => bool) public predictionWithdrawn;

    /// @notice Verification info for verificatioon id
    MarketLibV2.Verification[] public verifications;

    bytes32 public disputeMessage;

    /// EVENTS
    event MarketInitialized(uint256 marketId);
    event OpenDispute(address indexed creator);
    event CloseMarket(MarketLibV2.ResultType result);
    event Verify(
        address indexed verifier,
        uint256 power,
        uint256 verificationId,
        uint256 indexed tokenId,
        bool side
    );
    event WithdrawReward(
        address indexed receiver,
        uint256 indexed rewardType,
        uint256 amount
    );
    event Predict(address indexed sender, bool side, uint256 amount);

    /// @notice Verification array size
    function verificationHeight() external view returns (uint256) {
        return verifications.length;
    }

    constructor() {
        factory = msg.sender;
    }

    /// @notice Returns market info
    function marketInfo() external view returns (MarketLibV2.Market memory) {
        return _market;
    }

    /// @notice Initialization function
    /// @param mHash _market hash
    /// @param receiver _market creator nft receiver
    /// @param amounts Initial prediction amounts
    /// @param endPredictionTimestamp End Prediction Timestamp
    /// @param startVerificationTimestamp Start Verification Timestamp
    /// @param tokenId _market creator token id (ForeMarkets)
    /// @dev Possible to call only via the factory
    function initialize(
        bytes32 mHash,
        address receiver,
        uint256[] calldata amounts,
        address protocolAddress,
        address _tokenRegistry,
        address _feeReceiver,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp,
        uint64 tokenId,
        uint32 _predictionFlatFeeRate
    ) external {
        if (msg.sender != address(factory)) {
            revert("BasicMarket: Only Factory");
        }

        protocol = IForeProtocol(protocolAddress);
        protocolConfig = IProtocolConfig(protocol.config());
        marketConfig = IMarketConfig(protocolConfig.marketConfig());
        foreToken = IERC20Burnable(protocol.foreToken());
        foreVerifiers = IForeVerifiers(protocol.foreVerifiers());
        tokenRegistry = ITokenIncentiveRegistry(_tokenRegistry);

        marketHash = mHash;
        predictionFlatFeeRate = _predictionFlatFeeRate;
        feeReceiver = _feeReceiver;

        MarketLibV2.init(
            _market,
            predictions,
            receiver,
            amounts,
            endPredictionTimestamp,
            startVerificationTimestamp,
            tokenId
        );
        marketId = tokenId;
    }

    /// @notice Add new prediction
    /// @param amount Amount of ForeToken
    /// @param side Prediction side (true - positive result, false - negative result)
    /// @param token Alternative token
    function predict(uint256 amount, uint8 side, IERC20 token) external {
        if (!tokenRegistry.isTokenEnabled(address(token))) {
            revert("Basic Market: Token is not enabled");
        }
        uint256 predictionFee = _calculatePredictionFee(address(token), amount);
        token.safeTransferFrom(
            msg.sender,
            address(this),
            amount + predictionFee
        );
        token.safeTransfer(feeReceiver, predictionFee);
        MarketLibV2.predict(_market, predictions, amount, side, msg.sender);
    }

    /// @dev Calculates prediction fee - external
    /// @param token Token
    /// @param amount Prediction amount
    function calculatePredictionFee(
        address token,
        uint256 amount
    ) external view returns (uint256) {
        return _calculatePredictionFee(token, amount);
    }

    /// @dev Calculates prediction fee
    /// @param token Token
    /// @param amount Prediction amount
    function _calculatePredictionFee(
        address token,
        uint256 amount
    ) private view returns (uint256) {
        uint8 discountRate = tokenRegistry.getDiscountRate(token);
        uint256 baseFee = (amount * predictionFlatFeeRate) / 100;
        return baseFee - (baseFee * discountRate) / 100;
    }
}

interface IERC20Burnable is IERC20 {
    function burnFrom(address account, uint256 amount) external;

    function burn(uint256 amount) external;
}
