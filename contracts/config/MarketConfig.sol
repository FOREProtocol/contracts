// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

contract MarketConfig {

    /// @notice Opening dispute price (FORE)
    /// @dev Used in order to disincentive spam
    uint256 public immutable disputePrice;

    /// @notice Dispute period (in seconds)
    uint256 public immutable disputePeriod;

    /// @notice Verification period (in seconds)
    uint256 public immutable verificationPeriod;

    /// @notice Burn fee (1 = 0.01%)
    uint256 public immutable burnFee;

    /// @notice Foundation fee (1 = 0.01%)
    uint256 public immutable foundationFee;

    /// @notice Revenue fee (1 = 0.01%)
    uint256 public immutable revenueFee;

    /// @notice Market creator fee (1 = 0.01%)
    uint256 public immutable marketCreatorFee;

    /// @notice Verification fee (1 = 0.01%)
    uint256 public immutable verificationFee;

    constructor(
        uint256 disputePriceP,
        uint256 disputePeriodP,
        uint256 verificationPeriodP,
        uint256 burnFeeP,
        uint256 foundationFeeP,
        uint256 revenueFeeP,
        uint256 marketCreatorFeeP,
        uint256 verificationFeeP
    ) {
        disputePrice = disputePriceP;
        disputePeriod = disputePeriodP;
        verificationPeriod = verificationPeriodP;
        burnFee = burnFeeP;
        foundationFee = foundationFeeP;
        revenueFee = revenueFeeP;
        marketCreatorFee = marketCreatorFeeP;
        verificationFee = verificationFeeP;
    }

    /**
     * @notice Returns all config values
     */
    function config()
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (
            disputePrice,
            disputePeriod,
            verificationPeriod,
            burnFee,
            foundationFee,
            revenueFee,
            marketCreatorFee,
            verificationFee
        );
    }

    /**
     * @notice Returns sum of all fees (1 = 0.01%)
     */
    function feesSum() external view returns(uint256){
        return burnFee
            + foundationFee
            + revenueFee
            + marketCreatorFee
            + verificationFee;
    }
}
