// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./library/MarketLib.sol";
import "../../IForeProtocol.sol";
import "../../../verifiers/IForeVerifiers.sol";
import "../../config/IProtocolConfig.sol";
import "../../config/IMarketConfig.sol";
import "../../../token/ITokenIncentiveRegistry.sol";

contract BasicMarket is ReentrancyGuard {
    using SafeERC20 for IERC20Burnable;

    using SafeERC20 for IERC20;

    /// @notice Market hash (ipfs hash without first 2 bytes)
    bytes32 public marketHash;

    /// @notice Market token id
    uint256 public marketId;

    /// @notice Prediction flat fee rate
    uint32 public predictionFlatFeeRate;

    /// @notice Verification flat fee rate
    uint32 public verificationFlatFeeRate;

    /// @notice Foundation flat fee rate
    uint32 public foundationFlatFeeRate;

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
    MarketLib.Market internal _market;

    /// @notice Positive result predictions amount of address
    mapping(address => uint256) public predictionsA;

    /// @notice Negative result predictions amount of address
    mapping(address => uint256) public predictionsB;

    /// @notice Is prediction reward withdrawn for address
    mapping(address => bool) public predictionWithdrawn;

    /// @notice Verification info for verificatioon id
    MarketLib.Verification[] public verifications;

    bytes32 public disputeMessage;

    uint256 constant DIVIDER = 10000;

    ///EVENTS
    event MarketInitialized(uint256 marketId);
    event OpenDispute(address indexed creator);
    event CloseMarket(MarketLib.ResultType result);
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
    function marketInfo() external view returns (MarketLib.Market memory) {
        return _market;
    }

    /// @notice Initialization function
    /// @param payload Market initial payload data
    /// @dev Possible to call only via the factory
    function initialize(
        MarketLib.MarketCreationInitialData calldata payload
    ) external {
        if (msg.sender != address(factory)) {
            revert("BasicMarket: Only Factory");
        }
        protocol = IForeProtocol(payload.protocolAddress);
        protocolConfig = IProtocolConfig(protocol.config());
        marketConfig = IMarketConfig(protocolConfig.marketConfig());
        foreToken = IERC20Burnable(protocol.foreToken());
        foreVerifiers = IForeVerifiers(protocol.foreVerifiers());
        tokenRegistry = ITokenIncentiveRegistry(payload.tokenRegistry);

        marketHash = payload.mHash;

        predictionFlatFeeRate = payload.predictionFlatFeeRate;
        verificationFlatFeeRate = payload.verificationFlatFeeRate;
        foundationFlatFeeRate = payload.foundationFlatFeeRate;
        feeReceiver = payload.feeReceiver;

        MarketLib.init(
            _market,
            predictionsA,
            predictionsB,
            payload.receiver,
            payload.amountA,
            payload.amountB,
            payload.endPredictionTimestamp,
            payload.startVerificationTimestamp,
            payload.tokenId
        );

        marketId = payload.tokenId;
    }

    /// @notice Add new prediction
    /// @param amount Amount of ForeToken
    /// @param side Prediction side (true - positive result, false - negative result)
    /// @param token Alternative token
    function predict(uint256 amount, bool side, IERC20 token) external {
        if (!tokenRegistry.isTokenEnabled(address(token))) {
            revert("Basic Market: Token is not enabled");
        }
        uint256 predictionFee = _calculatePredictionFee(address(token), amount);
        token.safeTransferFrom(msg.sender, address(this), amount);
        token.safeTransfer(feeReceiver, predictionFee);

        MarketLib.predict(
            _market,
            predictionsA,
            predictionsB,
            amount - predictionFee,
            side,
            msg.sender
        );
    }

    /// @notice Doing new verification
    /// @param tokenId vNFT token id
    /// @param side side of verification
    function verify(uint256 tokenId, bool side) external nonReentrant {
        if (foreVerifiers.ownerOf(tokenId) != msg.sender) {
            revert("BasicMarket: Incorrect owner");
        }

        MarketLib.Market memory m = _market;

        if (
            (m.sideA == 0 || m.sideB == 0) &&
            m.endPredictionTimestamp < block.timestamp
        ) {
            _closeMarket(MarketLib.ResultType.INVALID);
            return;
        }

        (, uint256 verificationPeriod) = marketConfig.periods();

        foreVerifiers.transferFrom(msg.sender, address(this), tokenId);

        uint256 multipliedPower = foreVerifiers.multipliedPowerOf(tokenId);

        MarketLib.verify(
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
    function openDispute(bytes32 messageHash) external {
        MarketLib.Market memory m = _market;
        (
            uint256 disputePrice,
            uint256 disputePeriod,
            uint256 verificationPeriod,
            ,
            ,
            ,

        ) = marketConfig.config();
        if (
            MarketLib.calculateMarketResult(m) ==
            MarketLib.ResultType.INVALID &&
            (m.startVerificationTimestamp + verificationPeriod <
                block.timestamp)
        ) {
            _closeMarket(MarketLib.ResultType.INVALID);
            return;
        }
        foreToken.safeTransferFrom(msg.sender, address(this), disputePrice);
        disputeMessage = messageHash;
        MarketLib.openDispute(
            _market,
            disputePeriod,
            verificationPeriod,
            msg.sender
        );
    }

    /// @notice Resolves Dispute
    /// @param result Dipsute result type
    /// @dev Only HighGuard
    function resolveDispute(MarketLib.ResultType result) external {
        address highGuard = protocolConfig.highGuard();
        address receiver = MarketLib.resolveDispute(
            _market,
            result,
            highGuard,
            msg.sender
        );
        foreToken.safeTransfer(receiver, marketConfig.disputePrice());
        _closeMarket(result);
    }

    /// @dev Closes market
    /// @param result Market close result type
    /// @dev Is not best optimized becouse of deep stack
    function _closeMarket(MarketLib.ResultType result) private {
        (
            uint256 burnFee,
            uint256 foundationFee,
            ,
            uint256 verificationFee
        ) = marketConfig.fees();
        (
            uint256 toBurn,
            uint256 toFoundation,
            uint256 toHighGuard,
            uint256 toDisputeCreator,
            address disputeCreator
        ) = MarketLib.closeMarket(
                _market,
                burnFee,
                verificationFee,
                foundationFee,
                result
            );

        if (result != MarketLib.ResultType.INVALID) {
            MarketLib.Market memory m = _market;
            uint256 verificatorsFees = ((m.sideA + m.sideB) * verificationFee) /
                10000;
            if (
                ((m.verifiedA == 0) && (result == MarketLib.ResultType.AWON)) ||
                ((m.verifiedB == 0) && (result == MarketLib.ResultType.BWON))
            ) {
                toBurn += verificatorsFees;
            }
            if (toBurn != 0) {
                foreToken.burn(toBurn);
            }
            if (toFoundation != 0) {
                foreToken.safeTransfer(
                    protocolConfig.foundationWallet(),
                    toFoundation
                );
            }
            if (toHighGuard != 0) {
                foreToken.safeTransfer(protocolConfig.highGuard(), toHighGuard);
            }
            if (toDisputeCreator != 0) {
                foreToken.safeTransfer(disputeCreator, toDisputeCreator);
            }
        }
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
        (uint8 predictionDiscountRate, , , ) = tokenRegistry.getTokenIncentives(
            token
        );
        uint256 baseFee = (amount * predictionFlatFeeRate) / DIVIDER;
        return baseFee - (baseFee * predictionDiscountRate) / DIVIDER;
    }

    /// @notice Closes _market
    function closeMarket() external {
        MarketLib.Market memory m = _market;
        (uint256 disputePeriod, uint256 verificationPeriod) = marketConfig
            .periods();
        bool isInvalid = MarketLib.beforeClosingCheck(
            m,
            verificationPeriod,
            disputePeriod
        );
        if (isInvalid) {
            _closeMarket(MarketLib.ResultType.INVALID);
            return;
        }
        _closeMarket(MarketLib.calculateMarketResult(m));
    }

    /// @notice Returns prediction reward in ForeToken
    /// @dev Returns full available amount to withdraw(Deposited fund + reward of winnings - Protocol fees)
    /// @param predictor Predictior address
    /// @return 0 Amount to withdraw
    function calculatePredictionReward(
        address predictor
    ) external view returns (uint256) {
        if (predictionWithdrawn[predictor]) return (0);
        MarketLib.Market memory m = _market;
        return (
            MarketLib.calculatePredictionReward(
                m,
                predictionsA[predictor],
                predictionsB[predictor],
                marketConfig.feesSum()
            )
        );
    }

    /// @notice Withdraw prediction rewards
    /// @dev predictor Predictor Address
    /// @param predictor Predictor address
    function withdrawPredictionReward(address predictor) external {
        MarketLib.Market memory m = _market;
        uint256 toWithdraw = MarketLib.withdrawPredictionReward(
            m,
            marketConfig.feesSum(),
            predictionWithdrawn,
            predictionsA[predictor],
            predictionsB[predictor],
            predictor
        );
        uint256 ownBalance = foreToken.balanceOf(address(this));
        if (toWithdraw > ownBalance) {
            toWithdraw = ownBalance;
        }
        foreToken.safeTransfer(predictor, toWithdraw);
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
        MarketLib.Market memory m = _market;
        MarketLib.Verification memory v = verifications[verificationId];
        uint256 power = foreVerifiers.powerOf(
            verifications[verificationId].tokenId
        );
        (toVerifier, toDisputeCreator, toHighGuard, vNftBurn) = MarketLib
            .calculateVerificationReward(
                m,
                v,
                power,
                marketConfig.verificationFee()
            );
    }

    /// @notice Withdrawss Verification Reward
    /// @param verificationId Id of verification
    /// @param withdrawAsTokens If true witdraws tokens, false - withraws power
    function withdrawVerificationReward(
        uint256 verificationId,
        bool withdrawAsTokens
    ) external nonReentrant {
        MarketLib.Market memory m = _market;
        MarketLib.Verification memory v = verifications[verificationId];

        require(
            msg.sender == v.verifier ||
                msg.sender == protocolConfig.highGuard(),
            "BasicMarket: Only Verifier or HighGuard"
        );

        uint256 power = foreVerifiers.powerOf(
            verifications[verificationId].tokenId
        );
        (
            uint256 toVerifier,
            uint256 toDisputeCreator,
            uint256 toHighGuard,
            bool vNftBurn
        ) = MarketLib.withdrawVerificationReward(
                m,
                v,
                power,
                marketConfig.verificationFee()
            );
        verifications[verificationId].withdrawn = true;
        if (toVerifier != 0) {
            uint256 ownBalance = foreToken.balanceOf(address(this));
            if (toVerifier > ownBalance) {
                toVerifier = ownBalance;
            }
            if (withdrawAsTokens) {
                foreToken.safeTransfer(v.verifier, toVerifier);
                foreVerifiers.increaseValidation(v.tokenId);
            } else {
                foreVerifiers.increasePower(v.tokenId, toVerifier, true);
                foreToken.safeTransfer(address(foreVerifiers), toVerifier);
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
        MarketLib.Market memory m = _market;
        uint256 tokenId = marketId;

        require(
            protocol.ownerOf(tokenId) == msg.sender,
            "BasicMarket: Only Market Creator"
        );

        if (m.result == MarketLib.ResultType.NULL) {
            revert("MarketIsNotClosedYet");
        }

        if (m.result == MarketLib.ResultType.INVALID) {
            revert("OnlyForValidMarkets");
        }

        protocol.burn(tokenId);

        uint256 toWithdraw = ((m.sideA + m.sideB) *
            marketConfig.marketCreatorFee()) / 10000;
        uint256 ownBalance = foreToken.balanceOf(address(this));
        if (toWithdraw > ownBalance) {
            toWithdraw = ownBalance;
        }
        foreToken.safeTransfer(msg.sender, toWithdraw);

        emit WithdrawReward(msg.sender, 3, toWithdraw);
    }
}

interface IERC20Burnable is IERC20 {
    function burnFrom(address account, uint256 amount) external;

    function burn(uint256 amount) external;
}
