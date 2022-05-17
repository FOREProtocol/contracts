// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./MarketConfig.sol";

contract ProtocolConfig is Ownable{
    MarketConfig public marketConfig;
    address public foundationWallet;
    address public revenueWallet;
    address public highGuard;
    address public marketplace;
    address immutable public foreToken; 
    address immutable public foreVerifiers;
    uint256 public verifierMintPrice;
    uint256 public marketCreationPrice;

    constructor(address foundationWalletP, address revenueWalletP, address highGuardP, address marketplaceP, address foreTokenP, address foreVerifiersP, uint256 verifierMintPriceP){
        _setConfig(1000 ether, 1000 ether, 1000 ether, 1800, 1800, 100, 100, 100, 50, 150);
        marketCreationPrice = 1000 ether;
        verifierMintPrice = verifierMintPriceP;
        foundationWallet = foundationWalletP;
        revenueWallet = revenueWalletP;
        highGuard = highGuardP;
        marketplace = marketplaceP;
        foreToken = foreTokenP;
        foreVerifiers = foreVerifiersP;
    }

    function _setConfig(
        uint256 creationPriceP,
        uint256 verifierMintPriceP,
        uint256 disputePriceP,
        uint256 disputePeriodP,
        uint256 verificationPeriodP,
        uint256 burnFeeP,
        uint256 foundationFeeP,
        uint256 revenueFeeP,
        uint256 marketCreatorFeeP,
        uint256 verificationFeeP
    ) internal {
        uint256 feesSum = burnFeeP + foundationFeeP + revenueFeeP + marketCreatorFeeP + verificationFeeP;
        uint256 maxPrice = 1000 ether;
        require(feesSum <= 500 && disputePriceP <= maxPrice && creationPriceP <= maxPrice && verifierMintPriceP <= maxPrice, "ForeFactory: Config limit");
        bytes memory configCreationCode = type(MarketConfig).creationCode;
        bytes memory encoded = abi.encodePacked(configCreationCode, abi.encode(disputePriceP, disputePeriodP, verificationPeriodP, burnFeeP, foundationFeeP, revenueFeeP,marketCreatorFeeP, verificationFeeP));
        bytes32 salt = keccak256(abi.encodePacked(true, address(marketConfig)));
        address cfg;
        assembly {
            cfg := create2(0, add(encoded, 0x20), mload(encoded), salt)
            if iszero(extcodesize(cfg)) {
                revert(0, 0)
            }
        }
        marketConfig = MarketConfig(cfg);
    }

    function setMarketConfig(        
        uint256 verifierMintPriceP,
        uint256 disputePriceP,
        uint256 creationPriceP,
        uint256 reportPeriodP,
        uint256 verificationPeriodP,
        uint256 burnFeeP,
        uint256 foundationFeeP,
        uint256 revenueFeeP,
        uint256 marketCreatorFeeP,
        uint256 verificationFeeP) external onlyOwner{
            _setConfig(verifierMintPriceP, disputePriceP, creationPriceP, reportPeriodP, verificationPeriodP, burnFeeP, foundationFeeP, revenueFeeP, marketCreatorFeeP, verificationFeeP);
    }

    function setFoundationWallet(address _newAddr) external onlyOwner{
        foundationWallet = _newAddr;
    }

    function setRevenueWallett(address _newAddr) external onlyOwner{
        revenueWallet = _newAddr;
    }

    function setHighGuarrd(address _newAddr) external onlyOwner{
        highGuard = _newAddr;
    }

    function setMarketplace(address _newAddr) external onlyOwner{
        marketplace = _newAddr;
    }

    function setVerifierMintPrice(uint256 _amount) external onlyOwner{
        require(_amount <= 1000 ether,"ProtocoConfig: Max price exceed");
        verifierMintPrice = _amount;
    }

    function setMarketCreationPrice(uint256 _amount) external onlyOwner{
        require(_amount <= 1000 ether,"ProtocoConfig: Max price exceed");
        marketCreationPrice = _amount;
    }
}