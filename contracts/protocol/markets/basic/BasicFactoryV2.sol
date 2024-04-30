// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./BasicMarketV2.sol";
import "../../../verifiers/IForeVerifiers.sol";
import "../../config/IProtocolConfig.sol";
import "../../../token/ITokenIncentiveRegistry.sol";

contract BasicFactoryV2 is Ownable {
    using SafeERC20 for IERC20Burnable;

    /// @notice Init creatin code
    /// @dev Needed to calculate market address
    bytes32 public constant INIT_CODE_PAIR_HASH =
        keccak256(abi.encodePacked(type(BasicMarketV2).creationCode));

    /// @notice Prediction flat fee rate
    uint32 public predictionFlatFeeRate = 10;

    /// @notice Token registry
    address public immutable tokenRegistry;

    /// @notice Protocol Contract
    IForeProtocol public immutable foreProtocol;

    /// @notice ForeToken
    IERC20Burnable public immutable foreToken;

    /// @notice Protocol Config
    IProtocolConfig public immutable config;

    /// @notice ForeVerifiers
    IForeVerifiers public immutable foreVerifiers;

    /// @param protocolAddress Protocol Contract address
    constructor(IForeProtocol protocolAddress, address _tokenRegistry) {
        foreProtocol = protocolAddress;
        config = IProtocolConfig(protocolAddress.config());
        foreToken = IERC20Burnable(protocolAddress.foreToken());
        foreVerifiers = IForeVerifiers(protocolAddress.foreVerifiers());
        tokenRegistry = _tokenRegistry;
    }

    /// @notice Creates Market
    /// @param marketHash market hash
    /// @param receiver market creator nft receiver
    /// @param amounts Initial prediction amounts
    /// @param endPredictionTimestamp End predictions unix timestamp
    /// @param startVerificationTimestamp Start Verification unix timestamp
    /// @return createdMarket Address of created market
    function createMarket(
        bytes32 marketHash,
        address receiver,
        uint256[] memory amounts,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp
    ) external returns (address createdMarket) {
        if (endPredictionTimestamp > startVerificationTimestamp) {
            revert("BasicFactory: Date error");
        }

        BasicMarketV2 createdMarketContract = new BasicMarketV2{
            salt: marketHash
        }();

        createdMarket = address(createdMarketContract);

        uint256 creationFee = config.marketCreationPrice();
        if (creationFee != 0) {
            foreToken.burnFrom(msg.sender, creationFee);
        }

        uint256 amountSum = 0;
        if (amountSum != 0) {
            foreToken.safeTransferFrom(msg.sender, createdMarket, amountSum);
        }

        uint256 marketIdx = foreProtocol.createMarket(
            marketHash,
            msg.sender,
            receiver,
            createdMarket
        );

        createdMarketContract.initialize(
            marketHash,
            receiver,
            amounts,
            address(foreProtocol),
            tokenRegistry,
            owner(),
            endPredictionTimestamp,
            startVerificationTimestamp,
            uint64(marketIdx),
            predictionFlatFeeRate
        );
    }

    function setPredictionFlatFeeRate(uint32 feeRate) external onlyOwner {
        predictionFlatFeeRate = feeRate;
    }
}
