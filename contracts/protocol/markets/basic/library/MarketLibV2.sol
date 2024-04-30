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
        uint256[] verificationPowers;
        /// @notice Dispute Creator address
        address disputeCreator;
        /// @notice market size
        uint256 totalMarketSize;
        /// @notice End predictions unix timestamp
        uint64 endPredictionTimestamp;
        /// @notice Start verifications unix timestamp
        uint64 startVerificationTimestamp;
        /// @notice Market result
        ResultType result;
        /// @notice Wrong result confirmed by HG
        bool confirmed;
        /// @notice Dispute solved by HG
        bool solved;
    }

    uint256 constant DIVIDER = 10000;

    /// @notice initiates market
    /// @param market Market storage
    /// @param predictions Storage of predictions
    /// @param receiver Init prediction(s) creator
    /// @param amounts Init size of sides
    /// @param endPredictionTimestamp End Prediction Unix Timestamp
    /// @param startVerificationTimestamp Start Verification Unix Timestamp
    /// @param tokenId mNFT token id
    function init(
        Market storage market,
        mapping(address => mapping(uint8 => uint256)) storage predictions,
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
        market.verificationPowers = new uint256[](amounts.length);
        market.endPredictionTimestamp = endPredictionTimestamp;
        market.startVerificationTimestamp = startVerificationTimestamp;

        int8 side = ArrayUtils.findNonZeroIndex(amounts);
        if (side != -1) {
            _predict(
                market,
                predictions,
                amounts[uint8(side)],
                uint8(side),
                receiver
            );
        }

        emit MarketInitialized(tokenId);
    }

    /// @notice Add new prediction
    /// @param market Market storage
    /// @param predictions Storage of predictions
    /// @param amount Amount of ForeToken
    /// @param side Predicition side (true - positive result, false - negative result)
    /// @param receiver Prediction creator
    function predict(
        Market storage market,
        mapping(address => mapping(uint8 => uint256)) storage predictions,
        uint256 amount,
        uint8 side,
        address receiver
    ) external {
        _predict(market, predictions, amount, side, receiver);
    }

    /// @dev Add new prediction
    /// @param market Market storage
    /// @param predictions Storage of predictions
    /// @param amount Amount of ForeToken
    /// @param side Prediction side
    /// @param receiver Prediction creator
    function _predict(
        Market storage market,
        mapping(address => mapping(uint8 => uint256)) storage predictions,
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

        market.verificationPowers[side] += power;

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
        MarketLib.Market memory _market = market;
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

    /// FUNCTIONS
    /// @dev Checks if one side of the market verifies more than the total market size
    /// @param market Market info
    /// @return 0 true if verified
    function _isVerified(Market memory market) internal pure returns (bool) {
        bool hasSufficientPower = ArrayUtils.containsValueGreaterThanOrEqual(
            market.verificationPowers,
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
        return market.totalMarketSize - market.verificationPowers[side];
    }
}
