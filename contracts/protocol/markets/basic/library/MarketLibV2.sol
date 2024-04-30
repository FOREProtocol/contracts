// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./ArrayUtils.sol";

library MarketLibV2 {
    /// EVENTS
    event MarketInitialized(uint256 marketId);
    event OpenDispute(address indexed creator);
    event CloseMarket(MarketLibV2.ResultType result);
    event Verify(
        address indexed verifier,
        uint256 power,
        uint256 verificationId,
        uint256 indexed tokenId,
        uint8 side
    );
    event WithdrawReward(
        address indexed receiver,
        uint256 indexed rewardType,
        uint256 amount
    );
    event Predict(address indexed sender, uint8 side, uint256 amount);

    // STRUCTS
    /// @notice Market closing types
    enum ResultType {
        NULL,
        NULL2,
        WON,
        DRAW,
        INVALID
    }

    struct Verification {
        /// @notice Address of verifier
        address verifier;
        /// @notice Verficaton power
        uint256 power;
        /// @notice Token id used for verification
        uint256 tokenId;
        /// @notice Verification index side
        uint8 side;
        /// @notice Is reward + staked token withdrawn
        bool withdrawn;
    }

    struct Market {
        /// @notice Predictions token pool
        uint256[] sides;
        /// @notice Verification powers
        uint256[] verifications;
        /// @notice Dispute Creator address
        address disputeCreator;
        /// @notice market size
        uint256 totalMarketSize;
        /// @notice total verifications amount
        uint256 totalVerificationsAmount;
        /// @notice End predictions unix timestamp
        uint64 endPredictionTimestamp;
        /// @notice Start verifications unix timestamp
        uint64 startVerificationTimestamp;
        /// @notice Market result
        ResultType result;
        /// @notice Winnder side index
        uint8 winnerSideIndex;
        /// @notice Wrong result confirmed by HG
        bool confirmed;
        /// @notice Dispute solved by HG
        bool solved;
    }

    uint256 constant DIVIDER = 10000;

    /// FUNCTIONS
    /// @dev Checks if one side of the market verifies more than the total market size
    /// @param market Market info
    /// @return 0 true if verified
    function _isVerified(Market memory market) internal pure returns (bool) {
        bool hasSufficientPower = ArrayUtils.containsValueGreaterThanOrEqual(
            market.verifications,
            market.totalMarketSize
        );
        return market.totalMarketSize > 0 && hasSufficientPower;
    }

    /// @notice Checks if one side of the market is fully verified
    /// @param market Market info
    /// @return 0 true if verified
    function isVerified(Market memory market) external pure returns (bool) {
        return _isVerified(market);
    }

    /// @notice Returns the maximum value(power) available for verification for side
    /// @param market Market info
    /// @param side Side of market (true/false)
    /// @return 0 Maximum amount to verify for side
    function maxAmountToVerifyForSide(
        Market memory market,
        uint8 side
    ) external pure returns (uint256) {
        return (_maxAmountToVerifyForSide(market, side));
    }

    /// @dev Returns the maximum value(power) available for verification for side
    /// @param market Market info
    /// @param side Side of market (true/false)
    /// @return 0 Maximum amount to verify for side
    function _maxAmountToVerifyForSide(
        Market memory market,
        uint8 side
    ) internal pure returns (uint256) {
        if (_isVerified(market)) {
            return 0;
        }
        return market.totalMarketSize - market.verifications[side];
    }

    /// @dev Returns prediction reward in ForeToken
    /// @param m Market Info
    /// @param predictions Predictions contribution for all sides
    /// @param totalPredictions Total predictions amount
    /// @param feesSum Sum of all fees im perc
    /// @return toWithdraw amount to withdraw
    function calculatePredictionReward(
        Market memory m,
        mapping(uint8 => uint256) storage predictions,
        uint256 totalPredictions,
        uint256 feesSum
    ) internal view returns (uint256) {
        if (m.result == ResultType.INVALID) {
            return totalPredictions;
        }
        uint256 _marketSubFee = m.totalMarketSize -
            (m.totalMarketSize * feesSum) /
            DIVIDER;
        if (m.result == MarketLibV2.ResultType.DRAW) {
            return (_marketSubFee * totalPredictions) / m.totalMarketSize;
        }
        if (m.result == MarketLibV2.ResultType.WON) {
            return
                (_marketSubFee * predictions[m.winnerSideIndex]) /
                m.sides[m.winnerSideIndex];
        }
        return 0;
    }

    /// @notice Calculates Result for market
    /// @param m Market Info
    /// @return 0 Type of result
    function calculateMarketResult(
        Market memory m
    ) external pure returns (ResultType) {
        return _calculateMarketResult(m);
    }

    /// @dev Calculates Result for market
    /// @notice We have to optimized because of multiple loop functions
    /// @param m Market Info
    /// @return 0 Type of result
    function _calculateMarketResult(
        Market memory m
    ) internal pure returns (ResultType) {
        if (
            ArrayUtils.isArrayHasZeroValueElement(m.sides) ||
            m.totalVerificationsAmount == 0
        ) {
            return ResultType.INVALID;
        }
        if (ArrayUtils.hasDuplicates(m.verifications)) {
            return ResultType.DRAW;
        }

        return ResultType.WON;
    }

    /// @notice initiates market
    /// @param market Market storage
    /// @param predictions Storage of predictions
    /// @param totalPredictions Storage of total amount of predictions
    /// @param receiver Init prediction(s) creator
    /// @param amounts Init size of sides
    /// @param endPredictionTimestamp End Prediction Unix Timestamp
    /// @param startVerificationTimestamp Start Verification Unix Timestamp
    /// @param tokenId mNFT token id
    function init(
        Market storage market,
        mapping(address => mapping(uint8 => uint256)) storage predictions,
        mapping(address => uint256) storage totalPredictions,
        address receiver,
        uint256[] calldata amounts,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp,
        uint256 tokenId
    ) external {
        if (block.timestamp >= endPredictionTimestamp) {
            revert("PredictionPeriodIsAlreadyClosed");
        }
        market.sides = new uint256[](amounts.length);
        market.verifications = new uint256[](amounts.length);
        market.endPredictionTimestamp = endPredictionTimestamp;
        market.startVerificationTimestamp = startVerificationTimestamp;

        for (uint8 side = 0; side < amounts.length; ) {
            if (amounts[side] != 0) {
                _predict(
                    market,
                    predictions,
                    totalPredictions,
                    amounts[side],
                    side,
                    receiver
                );
            }
            unchecked {
                side++;
            }
        }
        emit MarketInitialized(tokenId);
    }

    /// @notice Add new prediction
    /// @param market Market storage
    /// @param predictions Storage of predictions
    /// @param totalPredictions Storage of total amount of predictions
    /// @param amount Amount of ForeToken
    /// @param side Predicition side (true - positive result, false - negative result)
    /// @param receiver Prediction creator
    function predict(
        Market storage market,
        mapping(address => mapping(uint8 => uint256)) storage predictions,
        mapping(address => uint256) storage totalPredictions,
        uint256 amount,
        uint8 side,
        address receiver
    ) external {
        _predict(market, predictions, totalPredictions, amount, side, receiver);
    }

    /// @dev Add new prediction
    /// @param market Market storage
    /// @param predictions Storage of predictions
    /// @param totalPredictions Storage of predictions total amount
    /// @param amount Amount of ForeToken
    /// @param side Prediction side
    /// @param receiver Prediction creator
    function _predict(
        Market storage market,
        mapping(address => mapping(uint8 => uint256)) storage predictions,
        mapping(address => uint256) storage totalPredictions,
        uint256 amount,
        uint8 side,
        address receiver
    ) internal {
        if (amount == 0) {
            revert("AmountCantBeZero");
        }
        if (block.timestamp >= market.endPredictionTimestamp) {
            revert("PredictionPeriodIsAlreadyClosed");
        }
        market.sides[side] += amount;
        market.totalMarketSize += amount;
        predictions[receiver][side] += amount;
        totalPredictions[receiver] += amount;

        emit Predict(receiver, side, amount);
    }

    /// @dev Verifies the side with maximum available power
    /// @param market Market storage
    /// @param verifications Verifications array storage
    /// @param verifier Verification creator
    /// @param verificationPeriod Verification Period is sec
    /// @param power Power of vNFT
    /// @param tokenId vNFT token id
    /// @param side Market index side
    function _verify(
        Market storage market,
        Verification[] storage verifications,
        address verifier,
        uint256 verificationPeriod,
        uint256 power,
        uint256 tokenId,
        uint8 side
    ) internal {
        MarketLibV2.Market memory _market = market;
        if (block.timestamp < _market.startVerificationTimestamp) {
            revert("VerificationHasNotStartedYet");
        }
        uint256 verificationEndTime = _market.startVerificationTimestamp +
            verificationPeriod;
        if (block.timestamp > verificationEndTime) {
            revert("VerificationAlreadyClosed");
        }

        market.verifications[side] += power;
        market.totalVerificationsAmount += power;

        uint256 verifyId = verifications.length;
        verifications.push(Verification(verifier, power, tokenId, side, false));

        emit Verify(verifier, power, verifyId, tokenId, side);
    }

    /// @notice Verifies the side with maximum available power
    /// @param market Market storage
    /// @param verifications Verifications array storage
    /// @param verifier Verification creator
    /// @param verificationPeriod Verification Period is sec
    /// @param power Power of vNFT
    /// @param tokenId vNFT token id
    /// @param side Marketd side (true - positive / false - negative);
    function verify(
        Market storage market,
        Verification[] storage verifications,
        address verifier,
        uint256 verificationPeriod,
        uint256 power,
        uint256 tokenId,
        uint8 side
    ) external {
        MarketLibV2.Market memory _market = market;
        uint256 powerAvailable = _maxAmountToVerifyForSide(_market, side);
        if (powerAvailable == 0) {
            revert("MarketIsFullyVerified");
        }
        if (power > powerAvailable) {
            power = powerAvailable;
        }
        _verify(
            market,
            verifications,
            verifier,
            verificationPeriod,
            power,
            tokenId,
            side
        );
    }

    /// @notice Opens a dispute
    /// @param market Market storage
    /// @param disputePeriod Dispute period in seconds
    /// @param verificationPeriod Verification Period in seconds
    /// @param creator Dispute creator
    function openDispute(
        Market storage market,
        uint256 disputePeriod,
        uint256 verificationPeriod,
        address creator
    ) external {
        Market memory m = market;

        bool isDisputeStarted = ((block.timestamp >=
            m.startVerificationTimestamp + verificationPeriod) ||
            _isVerified(m));

        if (!isDisputeStarted) {
            revert("DisputePeriodIsNotStartedYet");
        }
        if (m.result == ResultType.INVALID) {
            revert("MarketClosedWithInvalidStatus");
        }

        if (
            block.timestamp >=
            m.startVerificationTimestamp + verificationPeriod + disputePeriod
        ) {
            revert("DisputePeriodIsEnded");
        }
        if (m.disputeCreator != address(0)) {
            revert("DisputeAlreadyExists");
        }

        market.disputeCreator = creator;
        emit OpenDispute(creator);
    }

    /// @notice Resolves a dispute
    /// @param market Market storage
    /// @param result Result type
    /// @param highGuard High Guard address
    /// @param requester Function rerquester address
    /// @return receiverAddress Address receives dispute creration tokens
    function resolveDispute(
        Market storage market,
        MarketLibV2.ResultType result,
        uint8 winnerSideIndex,
        address highGuard,
        address requester
    ) external returns (address receiverAddress) {
        if (highGuard != requester) {
            revert("HighGuardOnly");
        }
        if (result == MarketLibV2.ResultType.NULL) {
            revert("ResultCantBeNull");
        }
        if (result == MarketLibV2.ResultType.INVALID) {
            revert("ResultCantBeInvalid");
        }
        MarketLibV2.Market memory m = market;
        if (m.disputeCreator == address(0)) {
            revert("DisputePeriodIsNotStartedYet");
        }

        if (m.solved) {
            revert("DisputeAlreadySolved");
        }

        market.solved = true;

        if (
            _calculateMarketResult(m) != result ||
            market.winnerSideIndex != winnerSideIndex
        ) {
            market.confirmed = true;
            if (result == ResultType.WON) {
                market.winnerSideIndex = winnerSideIndex;
            }
            return (m.disputeCreator);
        } else {
            return (requester);
        }
    }

    /// @notice Resolves a dispute
    /// @param market Market storage
    /// @param burnFee Burn fee
    /// @param verificationFee Verification Fee
    /// @param foundationFee Foundation Fee
    /// @param result Result type
    /// @return toBurn Token to burn
    /// @return toFoundation Token to foundation
    /// @return toHighGuard Token to HG
    /// @return toDisputeCreator Token to dispute creator
    /// @return disputeCreator Dispute creator address
    function closeMarket(
        Market storage market,
        uint256 burnFee,
        uint256 verificationFee,
        uint256 foundationFee,
        MarketLibV2.ResultType result
    )
        external
        returns (
            uint256 toBurn,
            uint256 toFoundation,
            uint256 toHighGuard,
            uint256 toDisputeCreator,
            address disputeCreator
        )
    {
        Market memory m = market;
        if (m.result != ResultType.NULL) {
            revert("MarketIsClosed");
        }

        market.result = result;
        m.result = result;

        if (m.result == ResultType.WON && !m.confirmed) {
            uint8 winnerSideIndex = ArrayUtils.findMaxIndex(m.verifications);
            market.winnerSideIndex = winnerSideIndex;
        }
        emit CloseMarket(m.result);

        if (m.result == MarketLibV2.ResultType.INVALID) {
            return (0, 0, 0, 0, m.disputeCreator);
        }

        toBurn = (m.totalMarketSize * burnFee) / DIVIDER;
        uint256 toVerifiers = (m.totalMarketSize * verificationFee) / DIVIDER;
        toFoundation = (m.totalMarketSize * foundationFee) / DIVIDER;

        if (
            m.result == MarketLibV2.ResultType.DRAW &&
            m.disputeCreator != address(0) &&
            !m.confirmed
        ) {
            // draw with dispute rejected - result set to draw
            toBurn += toVerifiers / 2;
            toHighGuard = toVerifiers / 2;
        } else if (m.result == MarketLibV2.ResultType.DRAW && m.confirmed) {
            // dispute confirmed - result set to draw
            toHighGuard = toVerifiers / 2;
            toDisputeCreator = toVerifiers - toHighGuard;
            disputeCreator = m.disputeCreator;
        } else if (
            m.result == MarketLibV2.ResultType.DRAW &&
            m.disputeCreator == address(0)
        ) {
            // draw with no dispute
            toBurn += toVerifiers;
        }
    }

    /// @notice Check market status before closing
    /// @param m Market info
    /// @param verificationPeriod Verification Period
    /// @param disputePeriod Dispute Period
    /// @return Is invalid market
    function beforeClosingCheck(
        Market memory m,
        uint256 verificationPeriod,
        uint256 disputePeriod
    ) external view returns (bool) {
        if (
            ArrayUtils.isArrayHasZeroValueElement(m.sides) &&
            block.timestamp > m.endPredictionTimestamp
        ) {
            return true;
        }

        uint256 verificationPeriodEnds = m.startVerificationTimestamp +
            verificationPeriod;
        if (
            block.timestamp > verificationPeriodEnds &&
            m.totalVerificationsAmount == 0
        ) {
            return true;
        }

        if (m.disputeCreator != address(0)) {
            revert("DisputeNotSolvedYet");
        }

        uint256 disputePeriodEnds = m.startVerificationTimestamp +
            verificationPeriod +
            disputePeriod;
        if (block.timestamp < disputePeriodEnds) {
            revert("DisputePeriodIsNotEndedYet");
        }

        return false;
    }

    /// @notice Withdraws Prediction Reward
    /// @param m Market info
    /// @param feesSum Sum of all fees
    /// @param predictionWithdrawn Storage of withdraw statuses
    /// @param predictions Predictions
    /// @param predictor Predictor address
    /// @return 0 Amount to withdraw(transfer)
    function withdrawPredictionReward(
        Market memory m,
        uint256 feesSum,
        mapping(address => bool) storage predictionWithdrawn,
        mapping(uint8 => uint256) storage predictions,
        uint256 totalPredictions,
        address predictor
    ) external returns (uint256) {
        if (m.result == MarketLibV2.ResultType.NULL) {
            revert("MarketIsNotClosedYet");
        }
        if (predictionWithdrawn[predictor]) {
            revert("AlreadyWithdrawn");
        }

        predictionWithdrawn[predictor] = true;

        uint256 toWithdraw = calculatePredictionReward(
            m,
            predictions,
            totalPredictions,
            feesSum
        );
        if (toWithdraw == 0) {
            revert("NothingToWithdraw");
        }

        emit WithdrawReward(predictor, 1, toWithdraw);

        return toWithdraw;
    }

    /// @notice Calculates Verification Reward
    /// @param m Market info
    /// @param v Verification info
    /// @param power Power of vNFT used for verification
    /// @param verificationFee Verification Fee
    /// @return toVerifier Amount of tokens for verifier
    /// @return toDisputeCreator Amount of tokens for dispute creator
    /// @return toHighGuard Amount of tokens for HG
    /// @return vPenalty If penalty need to be applied
    function calculateVerificationReward(
        Market memory m,
        Verification memory v,
        uint256 power,
        uint256 verificationFee
    )
        public
        pure
        returns (
            uint256 toVerifier,
            uint256 toDisputeCreator,
            uint256 toHighGuard,
            bool vPenalty
        )
    {
        if (
            m.result == MarketLibV2.ResultType.DRAW ||
            m.result == MarketLibV2.ResultType.INVALID ||
            m.result == MarketLibV2.ResultType.NULL ||
            v.withdrawn
        ) {
            // draw - withdraw verifier token
            return (0, 0, 0, false);
        }

        uint256 verificatorsFees = (m.totalMarketSize * verificationFee) /
            DIVIDER;

        if (
            v.side == m.winnerSideIndex &&
            m.result == MarketLibV2.ResultType.WON
        ) {
            // verifier voted properly
            uint256 reward = (v.power * verificatorsFees) /
                m.verifications[v.side];
            return (reward, 0, 0, false);
        } else {
            // verifier voted wrong
            if (m.confirmed) {
                toDisputeCreator = power / 2;
                toHighGuard = power - toDisputeCreator;
            }
            return (0, toDisputeCreator, toHighGuard, true);
        }
    }

    /// @notice Withdraws Verification Reward
    /// @param m Market info
    /// @param v Verification info
    /// @param power Power of vNFT used for verification
    /// @param verificationFee Verification Fee
    /// @return toVerifier Amount of tokens for verifier
    /// @return toDisputeCreator Amount of tokens for dispute creator
    /// @return toHighGuard Amount of tokens for HG
    /// @return vPenalty If penalty need to be applied
    function withdrawVerificationReward(
        Market memory m,
        Verification memory v,
        uint256 power,
        uint256 verificationFee
    )
        external
        returns (
            uint256 toVerifier,
            uint256 toDisputeCreator,
            uint256 toHighGuard,
            bool vPenalty
        )
    {
        if (m.result == MarketLibV2.ResultType.NULL) {
            revert("MarketIsNotClosedYet");
        }
        if (v.withdrawn) {
            revert("AlreadyWithdrawn");
        }
        (
            toVerifier,
            toDisputeCreator,
            toHighGuard,
            vPenalty
        ) = calculateVerificationReward(m, v, power, verificationFee);

        if (toVerifier != 0) {
            emit WithdrawReward(v.verifier, 2, toVerifier);
        }
    }
}
