// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "../../IForeProtocol.sol";
import "../../../verifiers/IForeVerifiers.sol";
import "../../config/IProtocolConfig.sol";
import "../../config/IMarketConfig.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./library/MarketLib.sol";

contract BasicMarket
{

    /// @notice Market hash (ipfs hash without first 2 bytes)
    bytes32 public marketHash;

    /// @notice Market token id
    uint256 public marketId;

   /// @notice Protocol
    IForeProtocol public protocol;

    /// @notice Factory
    address public factory;

    /// @notice Protocol config
    IProtocolConfig public protocolConfig;

    /// @notice Market config
    IMarketConfig public marketConfig;

    /// @notice Verifiers NFT
    IForeVerifiers public foreVerifiers;

    /// @notice Fore Token
    IERC20Burnable public foreToken;

    /// @notice Market info
    MarketLib.Market internal _market;

    /// @notice Positive result predictions amount of address
    mapping(address => uint256) public predictionsA;

    /// @notice Negative result predictions amount of address
    mapping(address => uint256) public predictionsB;

    /// @notice Is prediction reward withdrawn for address
    mapping(address => bool) public predictionWithdrawn;

    /// @notice Verification info for verificatioon id
    MarketLib.Verification[] public verifications;

    bytes32 public disputeMessage;

    /// @notice Verification array size
    function verificationHeight() external view returns (uint256) {
        return verifications.length;
    }

    constructor() {
        factory = msg.sender;
    }

    /// @notice Returns market info
    function marketInfo() external view returns(MarketLib.Market memory){
        return _market;
    }

    /// @notice Initialization function
    /// @param mHash _market hash
    /// @param receiver _market creator nft receiver
    /// @param amountA initial prediction for side A
    /// @param amountB initial prediction for side B
    /// @param endPredictionTimestamp End Prediction Timestamp
    /// @param startVerificationTimestamp Start Verification Timestamp
    /// @param tokenId _market creator token id (ForeMarkets)
    /// @dev Possible to call only via the factory
    function initialize(
        bytes32 mHash,
        address receiver,
        uint256 amountA,
        uint256 amountB,
        address protocolAddress,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp,
        uint64 tokenId
    ) external {
        if (msg.sender != address(factory)) {
            revert("BasicMarket: Only Factory");
        }

        protocol = IForeProtocol(protocolAddress);
        protocolConfig = IProtocolConfig(protocol.config());
        marketConfig = IMarketConfig(protocolConfig.marketConfig());
        foreToken = IERC20Burnable(protocol.foreToken());
        foreVerifiers = IForeVerifiers(protocol.foreVerifiers());

        marketHash = mHash;
        MarketLib.init(
            _market,
            predictionsA,
            predictionsB,
            receiver,
            amountA,
            amountB,
            endPredictionTimestamp,
            startVerificationTimestamp,
            tokenId
        );
        marketId = tokenId;

    }

    /// @notice Add new prediction
    /// @param amount Amount of ForeToken
    /// @param side Predicition side (true - positive result, false - negative result)
    function predict(uint256 amount, bool side) external {
        foreToken.transferFrom(msg.sender, address(this), amount);
        MarketLib.predict(
            _market,
            predictionsA,
            predictionsB,
            amount,
            side,
            msg.sender
        );
    }

    ///@notice Stakes nft token for the privilege of being a verifier
    ///@param tokenId ForeVerifiers nft id
    function stakeForPrivilege(uint64 tokenId) external {
        if(!marketConfig.isPrivilegeVerifierEnabled()){
            revert("BasicMarket: Privilege disabled");
        }
        foreVerifiers.transferFrom(msg.sender, address(this), tokenId);
        MarketLib.stakeForPrivilege(
            _market,
            msg.sender,
            foreVerifiers.powerOf(tokenId),
            protocolConfig.verifierMintPrice(),
            tokenId
        );
    }

    ///@notice Doing new verification
    ///@param tokenId vNFT token id
    ///@param side side of verification
    function verify(uint256 tokenId, bool side) external {
        if(
            foreVerifiers.ownerOf(tokenId)!= msg.sender){
            revert ("BasicMarket: Incorrect owner");
        }

        (uint256 verificationPeriod, uint256 disputePeriod) = marketConfig
            .periods();

        foreVerifiers.transferFrom(msg.sender, address(this), tokenId);

        MarketLib.verify(
            _market,
            verifications,
            msg.sender,
            verificationPeriod,
            disputePeriod,
            foreVerifiers.powerOf(tokenId),
            tokenId,
            side
        );
    }

    /// @notice Doing verification for privilege staked vNFT
    /// @param side Side of verification
    function privilegeVerify(bool side) external {
        MarketLib.privilegeVerify(
            _market,
            verifications,
            marketConfig.verificationPeriod(),
            msg.sender,
            foreVerifiers.powerOf(_market.privilegeNftId),
            side
        );
    }

    /// @notice Opens dispute
    function openDispute(bytes32 messageHash) external {
        (
            uint256 disputePrice,
            uint256 disputePeriod,
            uint256 verificationPeriod,
            ,
            ,
            ,
            ,
        ) = marketConfig.config();
        foreToken.transferFrom(msg.sender, address(this), disputePrice);
        disputeMessage = messageHash;
        MarketLib.openDispute(
            _market,
            disputePeriod,
            verificationPeriod,
            msg.sender
        );
    }

    ///@notice Resolves Dispute
    ///@param result Dipsute result type
    ///@dev Only HighGuard
    function resolveDispute(MarketLib.ResultType result) external {
        address highGuard = protocolConfig.highGuard();
        address receiver = MarketLib.resolveDispute(
            _market,
            result,
            highGuard,
            msg.sender
        );
        foreToken.transfer(receiver, marketConfig.disputePrice());
        _closeMarket(result);
    }


    ///@dev Closes market
    ///@param result Market close result type
    ///Is not best optimized becouse of deep stack
    function _closeMarket(MarketLib.ResultType result) private {
        (uint256 burnFee, uint256 foundationFee, , ) = marketConfig.fees();
        (
            uint256 toBurn,
            uint256 toFoundation,
            uint256 toHighGuard,
            uint256 toDisputeCreator,
            address disputeCreator
        ) = MarketLib.closeMarket(
                _market,
                burnFee,
                marketConfig.verificationFee(),
                foundationFee,
                result
            );
        if (toBurn != 0) {
            foreToken.burn(toBurn);
        }
        if (toFoundation != 0) {
            foreToken.transfer(protocolConfig.foundationWallet(), toFoundation);
        }
        if (toHighGuard != 0) {
            foreToken.transfer(protocolConfig.highGuard(), toHighGuard);
        }
        if (toDisputeCreator != 0) {
            foreToken.transfer(disputeCreator, toDisputeCreator);
        }
    }

    ///@notice Closes _market
    function closeMarket() external {
        MarketLib.Market memory m = _market;
        (uint256 verificationPeriod, uint256 disputePeriod) = marketConfig
            .periods();
        MarketLib.beforeClosingCheck(m, verificationPeriod, disputePeriod);
        _closeMarket(MarketLib.calculateMarketResult(m));
    }

    ///@notice Returns prediction reward in ForeToken
    ///@dev Returns full available amount to withdraw(Deposited fund + reward of winnings - Protocol fees)
    ///@param predictor Predictior address
    ///@return 0 Amount to withdraw
    function calculatePredictionReward(address predictor)
        external
        view
        returns (uint256)
    {
        if(predictionWithdrawn[predictor]) return(0);
        MarketLib.Market memory m = _market;
        return (
            MarketLib.calculatePredictionReward(
                m,
                predictionsA[predictor],
                predictionsB[predictor],
                marketConfig.feesSum()
            )
        );
    }

    ///@notice Withdraw prediction rewards
    ///@dev predictor Predictor Address
    ///@param predictor Predictor address
    function withdrawPredictionReward(address predictor) external {
        MarketLib.Market memory m = _market;
        uint256 toWithdraw = MarketLib.withdrawPredictionReward(
            m,
            marketConfig.feesSum(),
            predictionWithdrawn,
            predictionsA[predictor],
            predictionsB[predictor],
            predictor
        );
        foreToken.transfer(predictor, toWithdraw);
    }

    ///@notice Withdrawss Verification Reward
    ///@param verificationId Id of verification
    function withdrawVerificationReward(uint256 verificationId) external {
        MarketLib.Market memory m = _market;
        MarketLib.Verification memory v = verifications[verificationId];
        uint256 power = foreVerifiers.powerOf(
            verifications[verificationId].tokenId
        );
        (
            uint256 toVerifier,
            uint256 toDisputeCreator,
            uint256 toHighGuard,
            bool vNftBurn
        ) = MarketLib.withdrawVerificationReward(
                m,
                v,
                power,
                marketConfig.verificationFee()
            );
        verifications[verificationId].withdrawn = true;
        if (toVerifier != 0) {
            foreVerifiers.increasePower(v.tokenId, toVerifier);
            foreToken.transferFrom(
                address(this),
                address(foreVerifiers),
                toVerifier
            );
        }
        if (toDisputeCreator != 0) {
            foreToken.transferFrom(
                address(this),
                m.disputeCreator,
                toDisputeCreator
            );
            foreToken.transferFrom(
                address(this),
                protocolConfig.highGuard(),
                toHighGuard
            );
            foreToken.burn(power - toDisputeCreator - toHighGuard);
        }

        if (vNftBurn) {
            foreVerifiers.burn(v.tokenId);
        } else {
            foreVerifiers.transferFrom(address(this), v.verifier, v.tokenId);
        }
    }

    ///@notice Manually Extend Verification Time
    function extendVerificationTime() external{
        (uint256 verificationPeriod, uint256 disputePeriod) = marketConfig
            .periods();
        MarketLib.extendVerificationTime(_market, verificationPeriod, disputePeriod);
    }

    ///@notice Withdraw unsuded privilegeNFT
    function withdrarwUnusedPrivilegeNFT() external{
        MarketLib.Market memory m = _market;
        if (m.result == MarketLib.ResultType.NULL) {
            revert ("MarketIsNotClosedYet");
        }

        if (m.privilegeNftStaker == address(0)) {
            revert ("PrivilegeNftNotExist");
        }
        uint256 fee = foreVerifiers.powerOf(m.privilegeNftId) / 10;
        foreVerifiers.decreasePower(
            m.privilegeNftId,
            fee
        );
        foreToken.burnFrom(address(foreVerifiers), fee);
        foreVerifiers.transferFrom(address(this), m.privilegeNftStaker, m.privilegeNftId);
    }

    ///@notice Withdraw Market Creators Reward
    function marketCreatorFeeWithdraw() external {
        MarketLib.Market memory m = _market;
        uint256 tokenId = marketId;

        require(protocol.ownerOf(tokenId)==msg.sender,"BasicMarket: Only Market Creator");

        if (m.result == MarketLib.ResultType.NULL) {
            revert ("MarketIsNotClosedYet");
        }

        protocol.burn(tokenId);

        uint256 toWithdraw = ((m.sideA + m.sideB) *
            marketConfig.marketCreatorFee()) / 10000;
        foreToken.transfer(msg.sender, toWithdraw);

        emit MarketLib.WithdrawReward(msg.sender, 3, toWithdraw);
    }
}

interface IERC20Burnable is IERC20 {
    function burnFrom(address account, uint256 amount) external;
    function burn(uint256 amount) external;
}
