// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
// solhint-disable immutable-vars-naming
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/manager/AccessManaged.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "./categorical/library/ArrayUtils.sol";
import "./categorical/library/MarketLibV2.sol";
import "./categorical/IBasicMarketV2.sol";
import "./basic/IBasicMarket.sol";
import "../config/IProtocolConfig.sol";
import "../../verifiers/IForeVerifiers.sol";
import "../../token/ITokenIncentiveRegistry.sol";
import "../IAccountWhitelist.sol";
import "../IForeProtocol.sol";

error InvalidAuthority();
error UnauthorizedCall();
error InvalidCall();

/// @custom:security-contact security@foreprotocol.io
contract BeaconFactory is Pausable, AccessManaged {
    using SafeERC20 for IERC20;

    address public immutable CLASSIC_MARKET_BEACON;

    address public immutable CATEGORICAL_MARKET_BEACON;

    /// @notice Maximum sides allowed
    uint32 public constant MAX_SIDES = 10;

    /// @notice Prediction flat fee rate - 0%
    uint32 public predictionFlatFeeRate = 0;

    /// @notice Market creator flat fee rate - 1%
    uint32 public marketCreatorFlatFeeRate = 100;

    /// @notice Verification flat fee rate - 2%
    uint32 public verificationFlatFeeRate = 200;

    /// @notice Foundation flat fee rate - 6.5%
    uint32 public foundationFlatFeeRate = 650;

    /// @notice Fee receiver
    address public feeReceiver;

    /// @notice Universal router
    address public router;

    /// @notice Token registry
    ITokenIncentiveRegistry public immutable tokenRegistry;

    /// @notice Protocol Contract
    IForeProtocol public immutable foreProtocol;

    /// @notice Account whitelist
    IAccountWhitelist public immutable accountWhitelist;

    /// @notice ForeToken
    IERC20 public immutable foreToken;

    /// @notice Protocol Config
    IProtocolConfig public immutable config;

    /// @notice ForeVerifiers
    IForeVerifiers public immutable foreVerifiers;

    uint256 private constant DIVIDER = 10000;

    /// EVENTS
    event SetPredictionFlatFeeRate(uint32 indexed feeRate);
    event SetMarketCreatorFlatFeeRate(uint32 indexed feeRate);
    event SetVerificationFlatFeeRate(uint32 indexed feeRate);
    event SetFoundationFlatFeeRate(uint32 indexed feeRate);

    /// @param _initialAuthority Initial authority
    /// @param protocolAddress Protocol Contract address
    /// @param _tokenRegistry Token registry
    /// @param _accountWhitelist Account whitelist contract address
    /// @param _feeReceiver Fee receiver address
    /// @param _router Router address
    constructor(
        address _initialAuthority,
        address _categoricalMarketBeacon,
        address _classicMarketBeacon,
        IForeProtocol protocolAddress,
        ITokenIncentiveRegistry _tokenRegistry,
        IAccountWhitelist _accountWhitelist,
        address _feeReceiver,
        address _router
    ) AccessManaged(_initialAuthority) {
        if (_initialAuthority == address(0)) {
            revert InvalidAuthority();
        }

        CATEGORICAL_MARKET_BEACON = _categoricalMarketBeacon;
        CLASSIC_MARKET_BEACON = _classicMarketBeacon;
        foreProtocol = protocolAddress;
        config = IProtocolConfig(protocolAddress.config());
        foreToken = IERC20(protocolAddress.foreToken());
        foreVerifiers = IForeVerifiers(protocolAddress.foreVerifiers());
        tokenRegistry = _tokenRegistry;
        accountWhitelist = _accountWhitelist;
        feeReceiver = _feeReceiver;
        router = _router;
    }

    modifier onlyRouter() {
        if (msg.sender != router) {
            revert UnauthorizedCall();
        }
        _;
    }

    /**
     * @notice Creates a market with specified creator
     * @param marketHash market hash
     * @param receiver market creator nft receiver
     * @param amounts initial predictions for all sides
     * @param endPredictionTimestamp End predictions unix timestamp
     * @param startVerificationTimestamp Start Verification unix timestamp
     * @param token Alternative token
     * @return createdMarket Address of created market
     **/
    function createCategoricalMarket(
        bytes32 marketHash,
        address receiver,
        uint256[] calldata amounts,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp,
        IERC20 token
    ) external whenNotPaused returns (address) {
        return
            _createCategoricalMarket(
                marketHash,
                msg.sender,
                receiver,
                amounts,
                endPredictionTimestamp,
                startVerificationTimestamp,
                token
            );
    }

    /**
     * @notice Creates a market with specified creator
     * @param marketHash market hash
     * @param creator creator
     * @param receiver market creator nft receiver
     * @param amounts initial predictions for all sides
     * @param endPredictionTimestamp End predictions unix timestamp
     * @param startVerificationTimestamp Start Verification unix timestamp
     * @param token Alternative token
     * @return createdMarket Address of created market
     **/
    function createCategoricalMarket(
        bytes32 marketHash,
        address creator,
        address receiver,
        uint256[] calldata amounts,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp,
        IERC20 token
    ) external onlyRouter whenNotPaused returns (address) {
        return
            _createCategoricalMarket(
                marketHash,
                creator,
                receiver,
                amounts,
                endPredictionTimestamp,
                startVerificationTimestamp,
                token
            );
    }

    /**
     * @notice Creates a market (internal)
     * @param marketHash market hash
     * @param creator creator
     * @param receiver market creator nft receiver
     * @param amounts initial predictions for all sides
     * @param endPredictionTimestamp End predictions unix timestamp
     * @param startVerificationTimestamp Start Verification unix timestamp
     * @param token Alternative token
     * @return createdMarket Address of created market
     **/
    function _createCategoricalMarket(
        bytes32 marketHash,
        address creator,
        address receiver,
        uint256[] calldata amounts,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp,
        IERC20 token
    ) internal returns (address createdMarket) {
        if (endPredictionTimestamp > startVerificationTimestamp) {
            revert InvalidCall();
        }
        if (!tokenRegistry.isTokenEnabled(address(token))) {
            revert InvalidCall();
        }
        if (amounts.length > MAX_SIDES) {
            revert InvalidCall();
        }

        bytes memory bytecode = _getMarketBytecode(CATEGORICAL_MARKET_BEACON);
        if (
            Create2
                .computeAddress(marketHash, keccak256(bytecode))
                .code
                .length > 0
        ) {
            revert InvalidCall();
        }
        createdMarket = Create2.deploy(0, marketHash, bytecode);

        uint256 creationFee = 0;
        uint256 amountSum = ArrayUtils.sum(amounts);

        if (!accountWhitelist.isAccountWhitelisted(creator)) {
            (, , , , creationFee, ) = tokenRegistry.getTokenIncentives(
                address(token)
            );
        }
        if (creationFee > 0) {
            if (address(token) == address(foreToken)) {
                token.safeTransferFrom(
                    msg.sender,
                    address(0x000000000000000000000000000000000000dEaD),
                    creationFee
                );
            } else {
                token.safeTransferFrom(msg.sender, feeReceiver, creationFee);
            }
        }
        if (amountSum != 0) {
            token.safeTransferFrom(msg.sender, createdMarket, amountSum);
        }

        uint256 marketIdx = foreProtocol.createMarket(
            marketHash,
            creator,
            receiver,
            createdMarket
        );
        MarketLibV2.MarketCreationInitialData memory payload = MarketLibV2
            .MarketCreationInitialData(
                marketHash,
                receiver,
                amounts,
                address(foreProtocol),
                address(tokenRegistry),
                feeReceiver,
                address(token),
                router,
                endPredictionTimestamp,
                startVerificationTimestamp,
                uint64(marketIdx),
                predictionFlatFeeRate,
                marketCreatorFlatFeeRate,
                verificationFlatFeeRate,
                foundationFlatFeeRate
            );

        IBasicMarketV2(createdMarket).initialize(payload);
    }

    /// @notice Creates Market
    /// @param marketHash market hash
    /// @param receiver market creator nft receiver
    /// @param amountA initial prediction for side A
    /// @param amountB initial prediction for side B
    /// @param endPredictionTimestamp End predictions unix timestamp
    /// @param startVerificationTimestamp Start Verification unix timestamp
    /// @return createdMarket Address of created market
    function createClassicMarket(
        bytes32 marketHash,
        address receiver,
        uint256 amountA,
        uint256 amountB,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp
    ) external whenNotPaused returns (address createdMarket) {
        return
            _createClassicMarket(
                marketHash,
                receiver,
                msg.sender,
                amountA,
                amountB,
                endPredictionTimestamp,
                startVerificationTimestamp
            );
    }

    /// @notice Creates a market with specified creator
    /// @param marketHash market hash
    /// @param creator market creator
    /// @param receiver market creator nft receiver
    /// @param amountA initial prediction for side A
    /// @param amountB initial prediction for side B
    /// @param endPredictionTimestamp End predictions unix timestamp
    /// @param startVerificationTimestamp Start Verification unix timestamp
    /// @return createdMarket Address of created market
    function createClassicMarket(
        bytes32 marketHash,
        address receiver,
        address creator,
        uint256 amountA,
        uint256 amountB,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp
    ) external onlyRouter whenNotPaused returns (address createdMarket) {
        return
            _createClassicMarket(
                marketHash,
                receiver,
                creator,
                amountA,
                amountB,
                endPredictionTimestamp,
                startVerificationTimestamp
            );
    }

    /// @notice Creates Market (Internal function)
    /// @param marketHash market hash
    /// @param receiver market creator nft receiver
    /// @param amountA initial prediction for side A
    /// @param amountB initial prediction for side B
    /// @param endPredictionTimestamp End predictions unix timestamp
    /// @param startVerificationTimestamp Start Verification unix timestamp
    /// @return createdMarket Address of created market
    function _createClassicMarket(
        bytes32 marketHash,
        address receiver,
        address creator,
        uint256 amountA,
        uint256 amountB,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp
    ) internal returns (address createdMarket) {
        if (endPredictionTimestamp > startVerificationTimestamp) {
            revert InvalidCall();
        }

        bytes memory bytecode = _getMarketBytecode(CLASSIC_MARKET_BEACON);
        if (
            Create2
                .computeAddress(marketHash, keccak256(bytecode))
                .code
                .length > 0
        ) {
            revert InvalidCall();
        }
        createdMarket = Create2.deploy(0, marketHash, bytecode);

        uint256 creationFee = config.marketCreationPrice();

        if (creationFee != 0) {
            foreToken.safeTransferFrom(
                msg.sender,
                address(0x000000000000000000000000000000000000dEaD),
                creationFee
            );
        }

        uint256 amountSum = amountA + amountB;
        if (amountSum != 0) {
            foreToken.safeTransferFrom(msg.sender, createdMarket, amountSum);
        }

        uint256 marketIdx = foreProtocol.createMarket(
            marketHash,
            creator,
            receiver,
            createdMarket
        );

        MarketLib.MarketCreationInitialData memory payload = MarketLib
            .MarketCreationInitialData(
                marketHash,
                receiver,
                amountA,
                amountB,
                address(foreProtocol),
                endPredictionTimestamp,
                startVerificationTimestamp,
                uint64(marketIdx)
            );

        IBasicMarket(createdMarket).initialize(payload);
    }

    function _getMarketBytecode(
        address impl
    ) internal pure returns (bytes memory) {
        bytes memory bytecode = type(BeaconProxy).creationCode;
        return abi.encodePacked(bytecode, abi.encode(impl, ""));
    }

    /**
     * @notice Sets the flat fee rate for prediction operations
     * @dev Can only be called by the contract owner. Emits a SetPredictionFlatFeeRate event
     * @param feeRate The new flat fee rate for predictions
     */
    function setPredictionFlatFeeRate(uint32 feeRate) external restricted {
        predictionFlatFeeRate = feeRate;
        emit SetPredictionFlatFeeRate(feeRate);
    }

    /**
     * @notice Sets the flat fee rate for market creation operations
     * @dev Can only be called by the contract owner. Emits a SetMarketCreatorFlatFeeRate event
     * @param feeRate The new flat fee rate for market creator
     */
    function setMarketCreatorFlatFeeRate(uint32 feeRate) external restricted {
        marketCreatorFlatFeeRate = feeRate;
        emit SetMarketCreatorFlatFeeRate(feeRate);
    }

    /**
     * @notice Sets the flat fee rate for verification operations
     * @dev Can only be called by the contract owner. Emits a SetVerificationFlatFeeRate event
     * @param feeRate The new flat fee rate for verifications
     */
    function setVerificationFlatFeeRate(uint32 feeRate) external restricted {
        verificationFlatFeeRate = feeRate;
        emit SetVerificationFlatFeeRate(feeRate);
    }

    /**
     * @notice Sets the flat fee rate for foundation-related operations
     * @dev Can only be called by the contract owner. Emits a SetFoundationFlatFeeRate event
     * @param feeRate The new flat fee rate for foundation operations
     */
    function setFoundationFlatFeeRate(uint32 feeRate) external restricted {
        foundationFlatFeeRate = feeRate;
        emit SetFoundationFlatFeeRate(feeRate);
    }

    /**
     * @notice Pauses the contract, preventing the execution of functions with the whenNotPaused modifier.
     * @dev Only the sentinel can call this function.
     */
    function pause() external restricted {
        _pause();
    }

    /**
     * @notice Unpauses the contract, allowing the execution of functions with the whenNotPaused modifier.
     * @dev Only the sentinel can call this function.
     */
    function unpause() external restricted {
        _unpause();
    }
}
