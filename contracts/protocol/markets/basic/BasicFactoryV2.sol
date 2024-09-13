// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessManaged} from "@openzeppelin/contracts/access/manager/AccessManaged.sol";
import "./BasicMarketV2.sol";
import "./library/ArrayUtils.sol";
import "../../config/IProtocolConfig.sol";
import "../../../verifiers/IForeVerifiers.sol";
import "../../../token/ITokenIncentiveRegistry.sol";
import "../../IAccountWhitelist.sol";

/// @custom:security-contact security@foreprotocol.io
contract BasicFactoryV2 is Pausable, AccessManaged {
    using SafeERC20 for IERC20;

    using SafeERC20 for IERC20;

    /// @notice Init creatin code
    /// @dev Needed to calculate market address
    bytes32 public constant INIT_CODE_PAIR_HASH =
        keccak256(abi.encodePacked(type(BasicMarketV2).creationCode));

    /// @notice Maximum sides allowed
    uint32 constant MAX_SIDES = 10;

    /// @notice Prediction flat fee rate - 10%
    uint32 public predictionFlatFeeRate = 1000;

    /// @notice Market creator flat fee rate - 1%
    uint32 public marketCreatorFlatFeeRate = 100;

    /// @notice Verification flat fee rate - 1%
    uint32 public verificationFlatFeeRate = 100;

    /// @notice Foundation flat fee rate - 18%
    uint32 public foundationFlatFeeRate = 1800;

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

    uint256 constant DIVIDER = 10000;

    /// EVENTS
    event SetPredictionFlatFeeRate(uint32 indexed feeRate);
    event SetMarketCreatorFlatFeeRate(uint32 indexed feeRate);
    event SetVerificationFlatFeeRate(uint32 indexed feeRate);
    event SetFoundationFlatFeeRate(uint32 indexed feeRate);

    /// @param _initialAuthority Initial authority
    /// @param protocolAddress Protocol Contract address
    /// @param _accountWhitelist Account whitelist contract address
    /// @param _feeReceiver Fee receiver address
    /// @param _router Router address
    constructor(
        address _initialAuthority,
        IForeProtocol protocolAddress,
        ITokenIncentiveRegistry _tokenRegistry,
        IAccountWhitelist _accountWhitelist,
        address _feeReceiver,
        address _router
    ) AccessManaged(_initialAuthority) {
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
            revert("OnlyAuthorizedRouter");
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
    function createMarket(
        bytes32 marketHash,
        address receiver,
        uint256[] calldata amounts,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp,
        IERC20 token
    ) external whenNotPaused returns (address) {
        return
            _createMarket(
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
    function createMarketWithCreator(
        bytes32 marketHash,
        address creator,
        address receiver,
        uint256[] calldata amounts,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp,
        IERC20 token
    ) external onlyRouter whenNotPaused returns (address) {
        return
            _createMarket(
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
    function _createMarket(
        bytes32 marketHash,
        address creator,
        address receiver,
        uint256[] calldata amounts,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp,
        IERC20 token
    ) internal returns (address createdMarket) {
        if (endPredictionTimestamp > startVerificationTimestamp) {
            revert("Basic Factory: Date error");
        }
        if (!tokenRegistry.isTokenEnabled(address(token))) {
            revert("Basic Factory: Token is not enabled");
        }
        if (amounts.length > MAX_SIDES) {
            revert("Basic Factory: Maximum sides reached");
        }

        BasicMarketV2 createdMarketContract = new BasicMarketV2{
            salt: marketHash
        }();
        createdMarket = address(createdMarketContract);

        uint256 creationFee = 0;
        uint256 amountSum = ArrayUtils.sum(amounts);

        if (!accountWhitelist.isAccountWhitelisted(creator)) {
            (, , , , creationFee) = tokenRegistry.getTokenIncentives(
                address(token)
            );
        }
        if (creationFee > 0 && address(token) == address(foreToken)) {
            token.safeTransferFrom(
                msg.sender,
                address(0x000000000000000000000000000000000000dEaD),
                creationFee
            );
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
        BasicMarketV2.MarketCreationInitialData memory payload = BasicMarketV2
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

        createdMarketContract.initialize(payload);
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
