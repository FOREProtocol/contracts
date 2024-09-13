// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./library/MarketLibV2.sol";
import "./library/ArrayUtils.sol";
import "../../IForeProtocol.sol";
import "../../../verifiers/IForeVerifiers.sol";
import "../../config/IProtocolConfig.sol";
import "../../config/IMarketConfig.sol";
import "../../../token/ITokenIncentiveRegistry.sol";

/// @custom:security-contact security@foreprotocol.io
contract BasicMarketV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct MarketCreationInitialData {
        /// @notice Market hash
        bytes32 mHash;
        /// @notice Market creator nft receiver
        address receiver;
        /// @notice Initial prediction for all sides
        uint256[] amounts;
        /// @notice FORE protocol address
        address protocolAddress;
        /// @notice Token registry address
        address tokenRegistry;
        /// @notice Fee receiver address
        address feeReceiver;
        /// @notice Currency token address
        address token;
        /// @notice Universal router
        address router;
        /// @notice End prediction Timestamp
        uint64 endPredictionTimestamp;
        /// @notice Start verification Timestamp
        uint64 startVerificationTimestamp;
        /// @notice Market token Id
        uint64 tokenId;
        /// @notice Prediction flat fee rate
        uint32 predictionFlatFeeRate;
        /// @notice Market creator flat fee rate
        uint32 marketCreatorFlatFeeRate;
        /// @notice Verification flat fee rate
        uint32 verificationFlatFeeRate;
        /// @notice Foundation flat fee rate
        uint32 foundationFlatFeeRate;
    }

    /// @notice Market hash (ipfs hash without first 2 bytes)
    bytes32 public marketHash;

    /// @notice Market token id
    uint256 public marketId;

    /// @notice Prediction flat fee rate
    uint32 public predictionFlatFeeRate;

    /// @notice Prediction flat fee rate
    uint32 public marketCreatorFlatFeeRate;

    /// @notice Verification flat fee rate
    uint32 public verificationFlatFeeRate;

    /// @notice Foundation flat fee rate
    uint32 public foundationFlatFeeRate;

    /// @notice Factory
    address public immutable factory;

    /// @notice Fee receiver
    address public feeReceiver;

    /// @notice FORE Universal router
    address public router;

    /// @notice Protocol
    IForeProtocol public protocol;

    /// @notice Protocol config
    IProtocolConfig public protocolConfig;

    /// @notice Market config
    IMarketConfig public marketConfig;

    /// @notice Verifiers NFT
    IForeVerifiers public foreVerifiers;

    /// @notice Fore Token
    IERC20 public foreToken;

    /// @notice Currency Token
    IERC20 public token;

    /// @notice Token Registry
    ITokenIncentiveRegistry public tokenRegistry;

    /// @notice Market info
    MarketLibV2.Market internal _market;

    /// @notice Predictions (address => side => amount)
    mapping(address => mapping(uint8 => uint256)) predictions;

    /// @notice Total predictions
    mapping(address => uint256) totalPredictions;

    /// @notice Is prediction reward withdrawn for address
    mapping(address => bool) public predictionWithdrawn;

    /// @notice Prediction fees sent by every address
    mapping(address => uint256) public predictionFeesSpent;

    /// @notice Verification info for verificatioon id
    MarketLibV2.Verification[] public verifications;

    bytes32 public disputeMessage;

    uint256 constant DIVIDER = 10000;

    /// EVENTS
    event WithdrawReward(
        address indexed receiver,
        uint256 indexed rewardType,
        uint256 amount
    );

    constructor() {
        factory = msg.sender;
    }

    modifier onlyRouter() {
        if (msg.sender != router) {
            revert("OnlyAuthorizedRouter");
        }
        _;
    }

    /// @notice Verification array size
    function verificationHeight() external view returns (uint256) {
        return verifications.length;
    }

    /// @notice Returns market info
    function marketInfo() external view returns (MarketLibV2.Market memory) {
        return _market;
    }

    /// @notice Returns prediction amount
    function getPredictionAmountBySide(
        address predictor,
        uint8 side
    ) external view returns (uint256) {
        return predictions[predictor][side];
    }

    /// @notice Initialization function
    /// @param payload Market initial payload data
    /// @dev Possible to call only via the factory
    function initialize(MarketCreationInitialData calldata payload) external {
        if (msg.sender != address(factory)) {
            revert("BasicMarket: Only Factory");
        }
        protocol = IForeProtocol(payload.protocolAddress);
        protocolConfig = IProtocolConfig(protocol.config());
        marketConfig = IMarketConfig(protocolConfig.marketConfig());
        foreToken = IERC20(protocol.foreToken());
        token = IERC20(payload.token);
        foreVerifiers = IForeVerifiers(protocol.foreVerifiers());
        tokenRegistry = ITokenIncentiveRegistry(payload.tokenRegistry);
        router = payload.router;
        marketHash = payload.mHash;

        predictionFlatFeeRate = payload.predictionFlatFeeRate;
        marketCreatorFlatFeeRate = payload.marketCreatorFlatFeeRate;
        verificationFlatFeeRate = payload.verificationFlatFeeRate;
        foundationFlatFeeRate = payload.foundationFlatFeeRate;
        feeReceiver = payload.feeReceiver;

        MarketLibV2.init(
            _market,
            predictions,
            totalPredictions,
            payload.receiver,
            payload.amounts,
            payload.endPredictionTimestamp,
            payload.startVerificationTimestamp,
            payload.tokenId
        );

        marketId = payload.tokenId;
    }

    /// @notice Add new prediction
    /// @param amount Amount of ForeToken
    /// @param side Prediction side (index of the sides array)
    function predict(uint256 amount, uint8 side) external {
        _predict(msg.sender, amount, side);
    }

    /// @notice Add new prediction for account
    /// @param predictor Predictor
    /// @param amount Amount of token
    /// @param side Prediction side (index of the sides array)
    function predictFor(
        address predictor,
        uint256 amount,
        uint8 side
    ) external onlyRouter {
        _predict(predictor, amount, side);
    }

    /// @notice Add new prediction
    /// @param predictor Predictor
    /// @param amount Amount of token
    /// @param side Prediction side (index of the sides array)
    function _predict(address predictor, uint256 amount, uint8 side) internal {
        if (!tokenRegistry.isTokenEnabled(address(token))) {
            revert("Basic Market: Token is not enabled");
        }
        uint256 predictionFee = (amount * _calculatePredictionFeeRate()) /
            DIVIDER;

        predictionFeesSpent[predictor] += predictionFee;

        token.safeTransferFrom(msg.sender, address(this), amount);
        token.safeTransfer(feeReceiver, predictionFee);

        MarketLibV2.predict(
            _market,
            predictions,
            totalPredictions,
            amount - predictionFee,
            side,
            predictor
        );
    }

    /// @notice Doing new verification
    /// @param tokenId vNFT token id
    /// @param side side of verification
    function verify(uint256 tokenId, uint8 side) external nonReentrant {
        if (foreVerifiers.ownerOf(tokenId) != msg.sender) {
            revert("BasicMarket: Incorrect owner");
        }

        MarketLibV2.Market memory m = _market;

        if (
            ArrayUtils.isArrayHasZeroValueElement(m.sides) &&
            m.endPredictionTimestamp < block.timestamp
        ) {
            _closeMarket(MarketLibV2.ResultType.INVALID);
            return;
        }

        (, uint256 verificationPeriod) = marketConfig.periods();

        foreVerifiers.transferFrom(msg.sender, address(this), tokenId);

        uint256 multipliedPower = foreVerifiers.multipliedPowerOf(tokenId);

        MarketLibV2.verify(
            _market,
            verifications,
            msg.sender,
            verificationPeriod,
            multipliedPower,
            tokenId,
            side
        );
    }

    /// @notice Opens dispute
    /// @param messageHash Message Hash
    function openDispute(bytes32 messageHash) external {
        _openDispute(msg.sender, messageHash);
    }

    /// @notice Opens dispute for account
    /// @param creator Dispute creator
    /// @param messageHash Message Hash
    function openDisputeFor(
        address creator,
        bytes32 messageHash
    ) external onlyRouter {
        _openDispute(creator, messageHash);
    }

    /// @notice Opens dispute
    /// @param creator Creator address
    /// @param messageHash Message Hash
    function _openDispute(address creator, bytes32 messageHash) internal {
        MarketLibV2.Market memory m = _market;
        (
            uint256 disputePrice,
            uint256 disputePeriod,
            uint256 verificationPeriod,
            ,
            ,
            ,

        ) = marketConfig.config();

        MarketLibV2.ResultType result = MarketLibV2.calculateMarketResult(m);
        bool isDisputeStarted = block.timestamp >=
            m.startVerificationTimestamp + verificationPeriod;

        if (result == MarketLibV2.ResultType.INVALID && isDisputeStarted) {
            _closeMarket(MarketLibV2.ResultType.INVALID);
            return;
        }
        token.safeTransferFrom(msg.sender, address(this), disputePrice);
        disputeMessage = messageHash;
        MarketLibV2.openDispute(
            _market,
            disputePeriod,
            verificationPeriod,
            creator
        );
    }

    /// @notice Resolves Dispute
    /// @param result Dipsute result type
    /// @dev Only HighGuard
    function resolveDispute(
        MarketLibV2.ResultType result,
        uint8 winnerSideIndex
    ) external {
        address highGuard = protocolConfig.highGuard();
        address receiver = MarketLibV2.resolveDispute(
            _market,
            result,
            winnerSideIndex,
            highGuard,
            msg.sender
        );
        token.safeTransfer(receiver, marketConfig.disputePrice());
        _closeMarket(result);
    }

    /// @notice Closes _market
    function closeMarket() external {
        MarketLibV2.Market memory m = _market;
        (uint256 disputePeriod, uint256 verificationPeriod) = marketConfig
            .periods();
        bool isInvalid = MarketLibV2.beforeClosingCheck(
            m,
            verificationPeriod,
            disputePeriod
        );
        if (isInvalid) {
            _closeMarket(MarketLibV2.ResultType.INVALID);
            return;
        }
        _closeMarket(MarketLibV2.calculateMarketResult(m));
    }

    /// @notice Returns prediction reward in ForeToken
    /// @dev Returns full available amount to withdraw(Deposited fund + reward of winnings - Protocol fees)
    /// @param predictor Predictior address
    /// @return 0 Amount to withdraw
    function calculatePredictionReward(
        address predictor
    ) external view returns (uint256) {
        if (predictionWithdrawn[predictor]) {
            return 0;
        }
        MarketLibV2.Market memory m = _market;
        uint256 feesSum = _calculateFeesSum();
        return (
            MarketLibV2.calculatePredictionReward(
                m,
                predictions[predictor],
                totalPredictions[predictor],
                feesSum
            )
        );
    }

    /// @notice Withdraw prediction rewards
    /// @dev predictor Predictor Address
    /// @param predictor Predictor address
    function withdrawPredictionReward(address predictor) external {
        MarketLibV2.Market memory m = _market;
        uint256 feesSum = _calculateFeesSum();
        uint256 toWithdraw = MarketLibV2.withdrawPredictionReward(
            m,
            feesSum,
            predictionWithdrawn,
            predictions[predictor],
            totalPredictions[predictor],
            predictionFeesSpent[predictor],
            predictor
        );
        uint256 ownBalance = token.balanceOf(address(this));
        if (toWithdraw > ownBalance) {
            toWithdraw = ownBalance;
        }
        token.safeTransfer(predictor, toWithdraw);
    }

    /// @notice Calculates Verification Reward
    /// @param verificationId Id of Verification
    function calculateVerificationReward(
        uint256 verificationId
    )
        external
        view
        returns (
            uint256 toVerifier,
            uint256 toDisputeCreator,
            uint256 toHighGuard,
            bool vNftBurn
        )
    {
        MarketLibV2.Market memory m = _market;
        MarketLibV2.Verification memory v = verifications[verificationId];
        uint256 power = foreVerifiers.powerOf(
            verifications[verificationId].tokenId
        );
        uint256 verificationFee = _calculateVerificationFeeRate();

        (toVerifier, toDisputeCreator, toHighGuard, vNftBurn) = MarketLibV2
            .calculateVerificationReward(m, v, power, verificationFee);
    }

    /// @notice Withdrawss Verification Reward
    /// @param verificationId Id of verification
    /// @param withdrawAsTokens If true witdraws tokens, false - withraws power
    function withdrawVerificationReward(
        uint256 verificationId,
        bool withdrawAsTokens
    ) external nonReentrant {
        MarketLibV2.Market memory m = _market;
        MarketLibV2.Verification memory v = verifications[verificationId];

        require(
            msg.sender == v.verifier ||
                msg.sender == protocolConfig.highGuard(),
            "BasicMarket: Only Verifier or HighGuard"
        );

        uint256 power = foreVerifiers.powerOf(
            verifications[verificationId].tokenId
        );
        uint256 verificationFee = _calculateVerificationFeeRate();
        (
            uint256 toVerifier,
            uint256 toDisputeCreator,
            uint256 toHighGuard,
            bool vNftBurn
        ) = MarketLibV2.withdrawVerificationReward(
                m,
                v,
                power,
                verificationFee
            );

        verifications[verificationId].withdrawn = true;

        if (toVerifier != 0) {
            uint256 ownBalance = token.balanceOf(address(this));
            if (toVerifier > ownBalance) {
                toVerifier = ownBalance;
            }
            if (withdrawAsTokens) {
                token.safeTransfer(v.verifier, toVerifier);
                foreVerifiers.increaseValidation(v.tokenId);
            } else {
                if (address(token) != address(foreToken)) {
                    revert("OnlyForFOREDenominatedMarkets");
                }
                foreVerifiers.increasePower(v.tokenId, toVerifier, true);
                token.safeTransfer(address(foreVerifiers), toVerifier);
            }
        }
        if (toDisputeCreator != 0) {
            foreVerifiers.marketTransfer(m.disputeCreator, toDisputeCreator);
            foreVerifiers.marketTransfer(
                protocolConfig.highGuard(),
                toHighGuard
            );
        }
        if (vNftBurn) {
            foreVerifiers.marketBurn(power - toDisputeCreator - toHighGuard);
            foreVerifiers.burn(v.tokenId);
        } else {
            foreVerifiers.transferFrom(address(this), v.verifier, v.tokenId);
        }
    }

    /// @notice Withdraw Market Creators Reward
    function marketCreatorFeeWithdraw() external {
        MarketLibV2.Market memory m = _market;
        uint256 tokenId = marketId;

        require(
            protocol.ownerOf(tokenId) == msg.sender,
            "BasicMarket: Only Market Creator"
        );

        if (m.result == MarketLibV2.ResultType.NULL) {
            revert("MarketIsNotClosedYet");
        }

        if (m.result == MarketLibV2.ResultType.INVALID) {
            revert("OnlyForValidMarkets");
        }

        protocol.burn(tokenId);

        uint256 toWithdraw = ((m.totalMarketSize) *
            _calculateMarketCreatorFeeRate()) / DIVIDER;
        uint256 ownBalance = token.balanceOf(address(this));
        if (toWithdraw > ownBalance) {
            toWithdraw = ownBalance;
        }
        token.safeTransfer(msg.sender, toWithdraw);

        emit WithdrawReward(msg.sender, 3, toWithdraw);
    }

    /// @dev Closes market
    /// @param result Market close result type
    /// @dev Is not best optimized becouse of deep stack
    function _closeMarket(MarketLibV2.ResultType result) private {
        (uint256 burnFee, , , ) = marketConfig.fees();
        uint256 foundationFee = _calculateFoundationFeeRate();
        uint256 verificationFee = _calculateVerificationFeeRate();
        (
            uint256 toBurn,
            uint256 toFoundation,
            uint256 toHighGuard,
            uint256 toDisputeCreator,
            address disputeCreator
        ) = MarketLibV2.closeMarket(
                _market,
                burnFee,
                verificationFee,
                foundationFee,
                result
            );

        if (result != MarketLibV2.ResultType.INVALID) {
            MarketLibV2.Market memory m = _market;
            uint256 verificatorsFees = (m.totalMarketSize * verificationFee) /
                DIVIDER;

            if (
                m.verifications[m.winnerSideIndex] == 0 &&
                result == MarketLibV2.ResultType.WON
            ) {
                toBurn += verificatorsFees;
            }
            if (toBurn != 0 && address(token) == address(foreToken)) {
                token.safeTransfer(
                    address(0x000000000000000000000000000000000000dEaD),
                    toBurn
                );
            }
            if (toFoundation != 0) {
                token.safeTransfer(
                    protocolConfig.foundationWallet(),
                    toFoundation
                );
            }
            if (toHighGuard != 0) {
                token.safeTransfer(protocolConfig.highGuard(), toHighGuard);
            }
            if (toDisputeCreator != 0) {
                token.safeTransfer(disputeCreator, toDisputeCreator);
            }
        }
    }

    /// @notice Calculates the prediction fee rate
    /// @return The calculated fee rate
    function _calculatePredictionFeeRate() private view returns (uint256) {
        (uint256 discountRate, , , , ) = tokenRegistry.getTokenIncentives(
            address(token)
        );
        uint256 totalFee = (predictionFlatFeeRate * discountRate) / DIVIDER;
        return predictionFlatFeeRate - totalFee;
    }

    /// @notice Calculates the verification fee rate
    /// @return The calculated fee rate
    function _calculateVerificationFeeRate() private view returns (uint256) {
        (, , uint256 discountRate, , ) = tokenRegistry.getTokenIncentives(
            address(token)
        );
        uint256 totalFee = (verificationFlatFeeRate * discountRate) / DIVIDER;
        return verificationFlatFeeRate - totalFee;
    }

    /// @notice Calculates the foundation fee rate
    /// @return The calculated fee rate
    function _calculateFoundationFeeRate() private view returns (uint256) {
        (, , , uint256 discountRate, ) = tokenRegistry.getTokenIncentives(
            address(token)
        );
        uint256 totalFee = (foundationFlatFeeRate * discountRate) / DIVIDER;
        return foundationFlatFeeRate - totalFee;
    }

    /// @notice Calculates the market creator fee rate
    /// @return The calculated fee rate
    function _calculateMarketCreatorFeeRate() private view returns (uint256) {
        (, uint256 discountRate, , , ) = tokenRegistry.getTokenIncentives(
            address(token)
        );
        uint256 totalFee = (marketCreatorFlatFeeRate * discountRate) / DIVIDER;
        return marketCreatorFlatFeeRate - totalFee;
    }

    function _calculateFeesSum() private view returns (uint256) {
        (uint256 burnFee, , , ) = marketConfig.fees();
        return
            burnFee +
            _calculateFoundationFeeRate() +
            _calculateMarketCreatorFeeRate() +
            _calculateVerificationFeeRate();
    }
}
