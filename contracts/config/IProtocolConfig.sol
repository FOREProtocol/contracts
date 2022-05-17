// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;


interface IProtocolConfig {
    function marketConfig() external view returns (address);

    function foreToken() external view returns (address);

    function foreVerifiers() external view returns (address);

    function foundationWallet() external view returns (address);

    function highGuard() external view returns (address);

    function marketplace() external view returns (address);

    function owner() external view returns (address);

    function renounceOwnership() external;

    function revenueWallet() external view returns (address);

    function verifierMintPrice() external view returns (uint256);

    function marketCreationPrice() external view returns (uint256);

    // function setFoundationWallet(address _newAddr) external;

    // function setHighGuarrd(address _newAddr) external;

    // function setMarketConfig(
    //     uint256 verifierMintPriceP,
    //     uint256 disputePriceP,
    //     uint256 creationPriceP,
    //     uint32 reportPeriodP,
    //     uint32 verificationPeriodP,
    //     uint16 burnFeeP,
    //     uint16 foundationFeeP,
    //     uint16 revenueFeeP,
    //     uint16 marketCreatorFeeP,
    //     uint16 verificationFeeP
    // ) external;

    // function setMarketplace(address _newAddr) external;

    // function setRevenueWallett(address _newAddr) external;

    // function setVerifierMintPrice(uint256 _amount) external;

    // function transferOwnership(address newOwner) external
}
