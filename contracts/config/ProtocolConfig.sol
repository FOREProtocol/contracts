// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./MarketConfig.sol";

contract ProtocolConfig is
    Ownable
{

    event MarketConfigurationUpdated(MarketConfig marketConfig);
    event FoundationWalletChanged(address addr);
    event RevenueWalletChanged(address addr);
    event HighGuardChanged(address addr);
    event MarketplaceChanged(address addr);
    event VerifierMintPriceChanged(uint256 amount);
    event MarketCreationChanged(uint256 amount);


    /// @notice Max fee (1 = 0.01%)
    uint public constant MAX_FEE = 500;

    /// @notice Max price (FORE)
    uint public constant MAX_PRICE = 1000 ether;


    /// @notice Current market configuration
    /// @dev Configuration for created market is immutable. New configuration will be used only in newly created markets
    MarketConfig public marketConfig;

    /// @notice Foundation account
    address public foundationWallet;

    /// @notice Revenue account
    address public revenueWallet;

    /// @notice High guard account
    address public highGuard;

    /// @notice Marketplace contract address
    address public marketplace;

    /// @notice FORE token contract address
    address immutable public foreToken;

    /// @notice FORE verifiers NFT contract address
    address immutable public foreVerifiers;

    /// @notice Market creation price (FORE)
    uint256 public marketCreationPrice;

    /// @notice Minting verifiers NFT price (FORE)
    uint256 public verifierMintPrice;

    function addresses() external view returns(address, address, address, address, address, address, address){
        return(address(marketConfig), foundationWallet, revenueWallet, highGuard, marketplace, foreToken, foreVerifiers);
    }

    function roleAddresses() external view returns(address, address, address){
        return(foundationWallet, revenueWallet, highGuard);
    }


    constructor(
        address foundationWalletP,
        address revenueWalletP,
        address highGuardP,
        address marketplaceP,
        address foreTokenP,
        address foreVerifiersP,
        uint256 marketCreationPriceP,
        uint256 verifierMintPriceP
    ) {
        _setConfig(
            1000 ether,
            1000 ether,
            1000 ether,
            1800,
            1800,
            100,
            100,
            100,
            50,
            150
        );

        foundationWallet = foundationWalletP;
        revenueWallet = revenueWalletP;

        highGuard = highGuardP;

        marketplace = marketplaceP;
        foreToken = foreTokenP;
        foreVerifiers = foreVerifiersP;

        marketCreationPrice = marketCreationPriceP;
        verifierMintPrice = verifierMintPriceP;
    }

    /**
     * @dev Updates current configuration
     */
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
        uint256 feesSum = burnFeeP
            + foundationFeeP
            + revenueFeeP
            + marketCreatorFeeP
            + verificationFeeP;

        require(
            feesSum <= MAX_FEE
                && disputePriceP <= MAX_PRICE
                && creationPriceP <= MAX_PRICE
                && verifierMintPriceP <= MAX_PRICE
            ,
            "ForeFactory: Config limit"
        );

        // deploy MarketConfig contract
        bytes memory configCreationCode = type(MarketConfig).creationCode;
        bytes memory encoded = abi.encodePacked(
            configCreationCode,
            abi.encode(
                disputePriceP,
                disputePeriodP,
                verificationPeriodP,
                burnFeeP,
                foundationFeeP,
                revenueFeeP,
                marketCreatorFeeP,
                verificationFeeP
            )
        );

        bytes32 salt = keccak256(abi.encodePacked(true, address(marketConfig)));
        address cfg;
        assembly {
            cfg := create2(0, add(encoded, 0x20), mload(encoded), salt)
            if iszero(extcodesize(cfg)) {
                revert(0, 0)
            }
        }

        marketConfig = MarketConfig(cfg);

        emit MarketConfigurationUpdated(marketConfig);
    }


    /**
     * @notice Updates current configuration
     */
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
        uint256 verificationFeeP
    )
        external
        onlyOwner
    {
        _setConfig(
            verifierMintPriceP,
            disputePriceP,
            creationPriceP,
            reportPeriodP,
            verificationPeriodP,
            burnFeeP,
            foundationFeeP,
            revenueFeeP,
            marketCreatorFeeP,
            verificationFeeP
        );
    }

    /**
     * @notice Changes foundation account
     * @param _newAddr New address
     */
    function setFoundationWallet(address _newAddr) external onlyOwner {
        foundationWallet = _newAddr;
        emit FoundationWalletChanged(_newAddr);
    }

    /**
     * @notice Changes revenue account
     * @param _newAddr New address
     */
    function setRevenueWallet(address _newAddr) external onlyOwner {
        revenueWallet = _newAddr;
        emit RevenueWalletChanged(_newAddr);
    }

    /**
     * @notice Changes high guard account
     * @param _newAddr New address
     */
    function setHighGuard(address _newAddr) external onlyOwner {
        highGuard = _newAddr;
        emit HighGuardChanged(_newAddr);
    }

    /**
     * @notice Changes marketplace contract address
     * @param _newAddr New address
     */
    function setMarketplace(address _newAddr) external onlyOwner {
        marketplace = _newAddr;
        emit MarketplaceChanged(_newAddr);
    }

    /**
     * @notice Changes verifier mint price
     * @param _amount Price (FORE)
     */
    function setVerifierMintPrice(uint256 _amount) external onlyOwner {
        require(
            _amount <= 1000 ether,
            "ProtocoConfig: Max price exceed"
        );
        verifierMintPrice = _amount;
        emit VerifierMintPriceChanged(_amount);
    }

    /**
     * @notice Changes market creation price
     * @param _amount Price (FORE)
     */
    function setMarketCreationPrice(uint256 _amount) external onlyOwner {
        require(
            _amount <= 1000 ether,
            "ProtocoConfig: Max price exceed"
        );
        marketCreationPrice = _amount;
        emit MarketCreationChanged(_amount);
    }

}
