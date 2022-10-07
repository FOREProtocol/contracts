// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./MarketConfig.sol";

contract ProtocolConfig is Ownable {
    event MarketConfigurationUpdated(MarketConfig marketConfig);
    event FoundationWalletChanged(address addr);
    event HighGuardChanged(address addr);
    event MarketplaceChanged(address addr);
    event VerifierMintPriceChanged(uint256 amount);
    event MarketCreationChanged(uint256 amount);
    event SetStatusForFactory(address indexed add, bool status);
    event TierChanged(uint256 indexed tierIndex, uint256 newMinVerifications, uint256 newMultiplier);

    struct Tier {
        uint256 minVerifications;
        uint256 multiplier; // 1x = 10000, 1,2x = 12000 etc
    }
    
    /// @notice tiers
    mapping(uint256 => Tier) internal _tiers;

    /// @notice Max fee (1 = 0.01%)
    uint256 public constant MAX_FEE = 500;

    /// @notice Max price (FORE)
    uint256 public constant MAX_PRICE = 1000 ether;

    /// @notice Current market configuration
    /// @dev Configuration for created market is immutable. New configuration will be used only in newly created markets
    MarketConfig public marketConfig;

    /// @notice Foundation account
    address public foundationWallet;

    /// @notice High guard account
    address public highGuard;

    /// @notice Marketplace contract address
    address public marketplace;

    /// @notice FORE token contract address
    address public immutable foreToken;

    /// @notice FORE verifiers NFT contract address
    address public immutable foreVerifiers;

    /// @notice Market creation price (FORE)
    uint256 public marketCreationPrice;

    /// @notice Minting verifiers NFT price (FORE)
    uint256 public verifierMintPrice;

    mapping(address => bool) public isFactoryWhitelisted;

    function addresses()
        external
        view
        returns (
            address,
            address,
            address,
            address,
            address,
            address
        )
    {
        return (
            address(marketConfig),
            foundationWallet,
            highGuard,
            marketplace,
            foreToken,
            foreVerifiers
        );
    }

    function roleAddresses()
        external
        view
        returns (
            address,
            address
        )
    {
        return (foundationWallet, highGuard);
    }

        /// @notice Returns tier info
    function getTier(uint256 tierIndex) external view returns(uint256, uint256){
        Tier memory t = _tiers[tierIndex];
        return (t.minVerifications, t.multiplier);
    }

    /// @notice Returns tiers info
    function getTiers() external view returns(Tier[] memory){
        bool foundAll = false;
        uint256 sum = 1;
        while(!foundAll){
            Tier memory t = _tiers[sum];
            if(t.minVerifications > 0){
                sum++;
            }
            else{
                foundAll=true;
            }
        }
        Tier[] memory tiers = new Tier[](sum);
        for(uint256 i=0;i<sum;i++){
            Tier memory t = _tiers[i];
            tiers[i] = t;
        }

        return tiers;
    }

    function setFactoryStatus(
        address[] memory factoryAddresses,
        bool[] memory statuses
    ) external onlyOwner {
        uint256 len = factoryAddresses.length;
        require(len == statuses.length, "ProtocoConfig: Len mismatch ");
        for (uint256 i = 0; i < len; i++) {
            isFactoryWhitelisted[factoryAddresses[i]] = statuses[i];
            emit SetStatusForFactory(factoryAddresses[i], statuses[i]);
        }
    }

    constructor(
        address foundationWalletP,
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
            150,
            50,
            200
        );

        foundationWallet = foundationWalletP;

        highGuard = highGuardP;

        marketplace = marketplaceP;
        foreToken = foreTokenP;
        foreVerifiers = foreVerifiersP;

        marketCreationPrice = marketCreationPriceP;
        verifierMintPrice = verifierMintPriceP;

        _tiers[0] = Tier(0, 10000);
        _tiers[1] = Tier(30, 11000);
        _tiers[2] = Tier(75, 11750);
        _tiers[3] = Tier(150, 12250);
    }

    /**
     * @dev Edits tier
     * @param tierIndex tier index
     * @param minVerifications minimum verifications required
     * @param multiplier multiplier
     */
    function editTier(uint256 tierIndex, uint256 minVerifications, uint256 multiplier) external onlyOwner{
        if(tierIndex>0){
            Tier memory prevTier = _tiers[tierIndex-1];
            Tier memory nextTier = _tiers[tierIndex+1];
            if(tierIndex == 0){
                require(multiplier > 0, "ProtocolConfig: 1st tier multiplier musst bu greater than zero");
            }
            if(minVerifications == 0){
                require(nextTier.minVerifications == 0, "ProtocolConfig: Cant disable non last element");
            }
            else{
                require(prevTier.minVerifications < minVerifications, "ProtocolConfig: Sort error");
            }
        }
        _tiers[tierIndex] = Tier(minVerifications, multiplier);
        emit TierChanged(tierIndex, minVerifications, multiplier);
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
        uint256 marketCreatorFeeP,
        uint256 verificationFeeP
    ) internal {
        uint256 feesSum = burnFeeP +
            foundationFeeP +
            marketCreatorFeeP +
            verificationFeeP;

        require(
            feesSum <= MAX_FEE &&
                disputePriceP <= MAX_PRICE &&
                creationPriceP <= MAX_PRICE &&
                verifierMintPriceP <= MAX_PRICE,
            "ForeFactory: Config limit"
        );

        MarketConfig createdMarketConfig = new MarketConfig(
            disputePriceP,
            disputePeriodP,
            verificationPeriodP,
            burnFeeP,
            foundationFeeP,
            marketCreatorFeeP,
            verificationFeeP
        );

        marketConfig = createdMarketConfig;

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
        uint256 marketCreatorFeeP,
        uint256 verificationFeeP
    ) external onlyOwner {
        _setConfig(
            creationPriceP,
            verifierMintPriceP,
            disputePriceP,
            reportPeriodP,
            verificationPeriodP,
            burnFeeP,
            foundationFeeP,
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
        require(_amount <= 1000 ether, "ProtocoConfig: Max price exceed");
        verifierMintPrice = _amount;
        emit VerifierMintPriceChanged(_amount);
    }

    /**
     * @notice Changes market creation price
     * @param _amount Price (FORE)
     */
    function setMarketCreationPrice(uint256 _amount) external onlyOwner {
        require(_amount <= 1000 ether, "ProtocoConfig: Max price exceed");
        marketCreationPrice = _amount;
        emit MarketCreationChanged(_amount);
    }
}
