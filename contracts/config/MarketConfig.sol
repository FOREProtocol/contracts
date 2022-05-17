// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

contract MarketConfig{
    uint256 public immutable disputePrice;
    uint256 public immutable disputePeriod;
    uint256 public immutable verificationPeriod;
    uint256 public immutable burnFee;
    uint256 public immutable foundationFee;
    uint256 public immutable revenueFee;
    uint256 public immutable marketCreatorFee;
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

    function feesSum() external view returns(uint256){
        return(burnFee + foundationFee + revenueFee + marketCreatorFee + verificationFee);
    }
}
