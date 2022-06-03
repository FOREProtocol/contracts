// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./IForeMarkets.sol";
import "./verifiers/IForeVerifiers.sol";
import "./config/IProtocolConfig.sol";
import "./config/IMarketConfig.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract ForeMarket
{

    event MarketInitialized(uint256 marketId);

    /// @notice Factory (ForeMarkets)
    IForeMarkets public factory;

    /// @notice Protocol config
    IProtocolConfig public protocolConfig;

    /// @notice Market config
    IMarketConfig public marketConfig;

    /// @notice Verifiers NFT
    IForeVerifiers public foreVerifiers;

    /// @notice Fore Token
    IERC20Burnable public foreToken;

    /// @notice Market closing types
    enum ResultType {
        NULL,
        AWON,
        BWON,
        DRAW
    }


    struct Market {
        /// @notice Market hash (ipfs hash without first 2 bytes)
        bytes32 marketHash;

        /// @notice Predctioons token pool for positive result
        uint256 sideA;

        /// @notice Predictions token pool for negative result
        uint256 sideB;

        /// @notice Verification power for positive result
        uint256 verifiedA;

        /// @notice Verification power for positive result
        uint256 verifiedB;

        /// @notice End predictions unix timestamp
        uint256 endPredictionTimestamp;

        /// @notice Start verifications unix timestamp
        uint256 startVerificationTimestamp;

        /// @notice Market creator token ID (ForeMarkets)
        uint256 marketTokenId;

        /// @notice Market result
        ResultType result;
    }

    /// @notice Market info
    Market public market;

    struct PrivilegeNft {
        /// @notice Address of staker
        address privilegeNftStaker;

        /// @notice Nft id (ForeVerifiers)
        uint256 privilegeNftId;

        /// @notice Is token staked?
        bool staked;

        /// @notice Has verification been done
        bool privilegeNftUsed;
    }

    /// @notice Privlege Nft info
    PrivilegeNft public privilegeNft;

    struct Dispute {
        /// @notice Dispute Creator address
        address disputeCreator;

        /// @notice Wrong result confirmed by HG
        bool confirmed;

        /// @notice Dispute solved by HG
        bool solved;
    }

    /// @notice Dispute info
    Dispute public dispute;

    /// @notice Positive result predictions amount of address
    mapping(address => uint256) public predictionsA;

    /// @notice Negative result predictions amount of address
    mapping(address => uint256) public predictionsB;

    /// @notice Is prediction reward withdrawn for address
    mapping(address => bool) public predictionWithdrawn;

    struct Verification {
        /// @notice Address of verifier
        address verifier;

        /// @notice Verficaton power
        uint256 power;

        /// @notice Token id used for verification
        uint256 tokenId;

        /// @notice Verification side (true - positive / false - negative)
        bool side;

        /// @notice Is reward + staked token withdrawn
        bool withdrawn;
    }
    /// @notice Verification info for verificatioon id
    Verification[] public verifications;

    /// @notice Verification array size
    function verificationHeight() external view returns (uint256) {
        return verifications.length;
    }

    event Predict(
        address indexed sender,
        bool side,
        uint256 amount
    );

    event Verify(
        address indexed verifier,
        uint256 power,
        uint256 verificationId,
        uint256 tokenId,
        bool side
    );

    event PrivilegeStake(
        address indexed staker,
        uint256 power,
        uint256 tokenId
    );

    event OpenDispute(
        address indexed creator
    );

    event CloseMarket(
        ResultType result
    );

    event WithdrawReward(
        address indexed receiver,
        uint256 indexed rewardType,
        uint256 amount
    );

    constructor() {
        factory = IForeMarkets(msg.sender);
    }

    /// @notice Initialization function
    /// @param mHash market hash
    /// @param receiver market creator nft receiver
    /// @param amountA initial prediction for side A
    /// @param amountB initial prediction for side B
    /// @param endPredictionTimestamp End Prediction Timestamp
    /// @param startVerificationTimestamp Start Verification Timestamp
    /// @param tokenId market creator token id (ForeMarkets)
    /// @dev Possible to call only via the factory
    function initialize(
        bytes32 mHash,
        address receiver,
        uint256 amountA,
        uint256 amountB,
        uint256 endPredictionTimestamp,
        uint256 startVerificationTimestamp,
        uint256 tokenId
    ) external {
        if (msg.sender != address(factory)) {
            revert("ForeMarket: FORBIDDEN");
        }

        protocolConfig = IProtocolConfig(factory.config());
        marketConfig = IMarketConfig(protocolConfig.marketConfig());
        foreToken = IERC20Burnable(factory.foreToken());
        foreVerifiers = IForeVerifiers(factory.foreVerifiers());

        if (amountA != 0) {
            _predict(amountA, true, receiver);
        }
        if (amountB != 0) {
            _predict(amountB, false, receiver);
        }

        market = Market(
            mHash,
            amountA,
            amountB,
            0,
            0,
            endPredictionTimestamp,
            startVerificationTimestamp,
            tokenId,
            ResultType.NULL
        );

        emit MarketInitialized(tokenId);
    }

    /// @notice Add new prediction
    /// @param amount Amount of ForeToken
    /// @param side Predicition side (true - positive result, false - negative result)
    function predict(
        uint256 amount,
        bool side
    ) external {
        Market memory m = market;

        if (block.timestamp >= m.endPredictionTimestamp) {
            revert("ForeMarket: Prediction is closed");
        }

        foreToken.transferFrom(msg.sender, address(this), amount);
        _predict(amount, side, msg.sender);
    }

    /// @dev Creetes new prediction
    function _predict(
        uint256 amount,
        bool side,
        address receiver
    ) internal {
        if (amount == 0) {
            revert("ForeMarket: Amount cant be zero");
        }

        if (side) {
            market.sideA += amount;
            predictionsA[receiver] += amount;
        } else {
            market.sideB += amount;
            predictionsB[receiver] += amount;
        }

        emit Predict(receiver, side, amount);
    }

    ///@notice Stakes nft token for the privilege of being a verifier
    ///@param tokenId ForeVerifiers nft id
    function stakeForPrivilege(uint256 tokenId) external {
        if (privilegeNft.staked) {
            revert("ForeMarket: Privilege nft exists");
        }
        if (block.timestamp > market.startVerificationTimestamp) {
            revert("ForeMarket: Verification started");
        }
        if (foreVerifiers.powerOf(tokenId) < protocolConfig.verifierMintPrice()) {
            revert("ForeMarket: Not enough power");
        }

        foreVerifiers.transferFrom(msg.sender, address(this), tokenId);
        uint256 power = foreVerifiers.powerOf(tokenId);
        market.verifiedA = power;
        market.verifiedB = power;
        privilegeNft = PrivilegeNft(msg.sender, tokenId, true, false);
    }

    /// @dev Checks if one side of the market is fully verified
    function _isVerified(Market memory m) private pure returns (bool result) {
        result = (m.sideA <= m.verifiedB || m.sideB <= m.verifiedA);
    }

    /// @dev Returns the maximum value(power) available for verification for side
    function _maxAmountToVerifyForSide(bool side, Market memory m)
        internal
        pure
        returns (uint256)
    {
        if (_isVerified(m)) {
            return 0;
        }

        if (side) {
            return m.sideB - m.verifiedA;
        }
        else {
            return m.sideA - m.verifiedB;
        }
    }

    /// @notice Returns the maximum value(power) available for verification
    /// @param side Marketd side (true - positive / false - negative);
    function maxAmountToVerifyForSide(bool side)
        external
        view
        returns (uint256)
    {
        Market memory m = market;
        return _maxAmountToVerifyForSide(side, m);
    }

    //TODO: Solve the problem with the possible blocking of voting by a user with privilege
    //TODO: Consider limiting punishment to power

    /// @notice Verifies the side with maximum available power
    /// @param tokenId ForeVerifiers token id
    /// @param side Marketd side (true - positive / false - negative);
    function verify(uint256 tokenId, bool side) external {
        Market memory m = market;

        if (block.timestamp < m.startVerificationTimestamp) {
            revert("ForeMarket: Is not opened");
        }

        uint256 verificationEndTime = m.startVerificationTimestamp + marketConfig.verificationPeriod();
        if (block.timestamp > verificationEndTime) {
            revert("ForeMarket: Is closed");
        }

        require(foreVerifiers.ownerOf(tokenId) == msg.sender, "ForeMarket: Incorrect owner");

        PrivilegeNft memory p = privilegeNft;
        uint256 power = foreVerifiers.powerOf(tokenId);

        if (p.staked && tokenId == p.privilegeNftId) {
            if (p.privilegeNftUsed) {
                revert("ForeMarket: Verify once");
            }

            privilegeNft.privilegeNftUsed = true;

            if (side) {
                market.verifiedB -= power;
            }
            else {
                market.verifiedA -= power;
            }
        } else {
            uint256 powerAvailable = _maxAmountToVerifyForSide(side, m);
            if (powerAvailable == 0) {
                revert("ForeMarket: Market is fully verified");
            }
            if (power > powerAvailable) {
                power = powerAvailable;
            }

            foreVerifiers.transferFrom(msg.sender, address(this), tokenId);

            if (side) {
                market.verifiedA += power;
            }
            else {
                market.verifiedB += power;
            }
        }

        uint256 verifyId = verifications.length;
        verifications.push(Verification(msg.sender, power, tokenId, side, false));

        emit Verify(msg.sender, verifyId, power, tokenId, side);
    }

    /// @notice Opens a dispute
    function openDispute() external {
        Market memory m = market;
        (
            uint256 disputePrice,
            uint256 disputePeriod,
            uint256 verificationPeriod,
            ,
            ,
            ,
            ,
        ) = marketConfig.config();

        if (m.result != ResultType.NULL) {
            revert("ForeMarket: Market is closed");
        }

        if (
            block.timestamp < m.startVerificationTimestamp + verificationPeriod
            && !_isVerified(m)
        ) {
            revert("ForeMarket: Dispute not opened");
        }

        if (
            block.timestamp >= m.startVerificationTimestamp + verificationPeriod + disputePeriod
        ) {
            revert("ForeMarket: Dispute is closed");
        }

        if (dispute.disputeCreator != address(0)) {
            revert("ForeMarket: Dispute exists");
        }

        foreToken.transferFrom(msg.sender, address(this), disputePrice);

        dispute = Dispute(msg.sender, false, false);
        emit OpenDispute(msg.sender);
    }

    ///@notice Resolves Dispute
    ///@dev Only HighGuard
    function resolveDispute(ResultType result) external {
        if (protocolConfig.highGuard() != msg.sender) {
            revert("ForeMarket: Only HG");
        }

        if (result == ResultType.NULL) {
            revert("ForeMarket: Result cant be null");
        }

        Dispute memory d = dispute;
        if (d.disputeCreator == address(0)) {
            revert("ForeMarket: Dispute not opened");
        }

        if (d.solved) {
            revert("ForeMarket: Already solved");
        }

        dispute.solved = true;
        Market memory m = market;

        if (_calculateMarketResult(m) != result) {
            dispute.confirmed = true;
            foreToken.transfer(d.disputeCreator, marketConfig.disputePrice());
        }
        else {
            foreToken.transfer(msg.sender, marketConfig.disputePrice());
        }

        _closeMarket(result, m, d);
    }

    ///@dev Closes the market
    ///@param result Market Result
    ///@param m Market Info
    ///@param d Dispute Info
    function _closeMarket(
        ResultType result,
        Market memory m,
        Dispute memory d
    ) private {
        market.result = result;

        uint256 fullMarketSize = m.sideA + m.sideB;
        uint256 toBurn = (fullMarketSize * marketConfig.burnFee()) / 10000;
        uint256 toVerifiers = (fullMarketSize * marketConfig.verificationFee()) / 10000;

        foreToken.transfer(
            protocolConfig.revenueWallet(),
            (fullMarketSize * marketConfig.revenueFee()) / 10000
        );
        foreToken.transfer(
            protocolConfig.foundationWallet(),
            (fullMarketSize * marketConfig.foundationFee()) / 10000
        );

        if (
            m.result == ResultType.DRAW
            && d.disputeCreator == address(0)
        ) {
            // simply draw without dispute
            foreToken.burn(toBurn);
        }
        else if (
            m.result == ResultType.DRAW
            && d.disputeCreator != address(0)
            && !d.confirmed
        ) {
            // draw with dispute rejected - result set to draw
            foreToken.burn(toBurn + toVerifiers/2);
            foreToken.transfer(
                protocolConfig.highGuard(),
                toVerifiers/2
            );
        }
        else if (
            m.result == ResultType.DRAW
            && d.confirmed
        ) {
            // draw with dispute confirmed - result set to draw
            foreToken.burn(toBurn);
            foreToken.transfer(
                protocolConfig.highGuard(),
                toVerifiers/2
            );
            foreToken.transfer(
                d.disputeCreator,
                toVerifiers/2
            );
        }
        else {
            // simple result
            foreToken.burn(toBurn);
        }

        emit CloseMarket(result);
    }


    ///@notice Closes market
    function closeMarket() external {
        Market memory m = market;
        if (m.result != ResultType.NULL) {
            revert("ForeMarket: Market is closed");
        }

        Dispute memory d = dispute;
        if (d.disputeCreator != address(0)) {
            revert("ForeMarket: Dispute exists");
        }

        uint256 disputePeriodEnds = m.startVerificationTimestamp +
            marketConfig.verificationPeriod() +
            marketConfig.disputePeriod();
        if (block.timestamp < disputePeriodEnds) {
            revert("ForeMarket: Only after dispute");
        }

        _closeMarket(_calculateMarketResult(m), m, d);
    }

    // function _getVerificationTimestamps(Market memory m) intenal returns (uint256, uint256){

    // }

    ///@dev Calculates Result for markeet
    ///@param m Market Info
    function _calculateMarketResult(Market memory m)
        private
        pure
        returns (ResultType)
    {
        if (m.verifiedA == m.verifiedB) {
            return ResultType.DRAW;
        }
        else if (m.verifiedA > m.verifiedB) {
            return ResultType.AWON;
        }
        else {
            return ResultType.BWON;
        }
    }

    ///@dev Returns prediction reward in ForeToken
    ///@param m Market Info
    ///@param predictor Predictior address
    function _calculatePredictionReward(address predictor, Market memory m)
        internal
        view
        returns (uint256 toWithdraw)
    {
        uint256 pA = predictionsA[predictor];
        uint256 pB = predictionsB[predictor];
        uint256 fullMarketSize = m.sideA + m.sideB;
        uint256 marketSubFee = fullMarketSize - (fullMarketSize * marketConfig.feesSum()) / 10000;
        if (m.result == ResultType.DRAW) {
            toWithdraw =
                (marketSubFee * (pA + pB)) /
                fullMarketSize;
        } else if (m.result == ResultType.AWON) {
            toWithdraw = (marketSubFee * pA) / m.sideA;
        } else if (m.result == ResultType.BWON) {
            toWithdraw = (marketSubFee * pB) / m.sideB;
        }
    }

    ///@notice Returns prediction reward in ForeToken
    ///@dev Returns full available amount to withdraw(Deposited fund + reward of winnings - Protocol fees)
    ///@param predictor Predictior address
    function calculatePredictionReward(address predictor) external view returns(uint256){
        Market memory m = market;
        return(_calculatePredictionReward(predictor, m));
    }

    ///@notice Withdraw prediction rewards
    ///@dev predictor Preictor Address
    function withdrawPredictionReward(address predictor) external {
        //TODO: Add auto market closing?
        Market memory m = market;

        if (m.result == ResultType.NULL) {
            revert("ForeMarket: Market not closed");
        }
        if (predictionWithdrawn[predictor]) {
            revert("ForeMarket: Already withrawn");
        }

        predictionWithdrawn[predictor] = true;

        uint256 toWithdraw = _calculatePredictionReward(predictor, m);
        if (toWithdraw == 0) {
            revert("ForeMarket: Nothing to withdraw");
        }

        foreToken.transfer(predictor, toWithdraw);

        emit WithdrawReward(predictor, 1, toWithdraw);
    }

    ///@notice Withdraw Verificator Reward
    ///@dev Verification id
    function withdrawVerificationReward(uint256 verificationId) external {
        //TODO: Add auto market closing?
        Market memory m = market;

        if (m.result == ResultType.NULL) {
            revert("ForeMarket: Market not closed");
        }

        Verification memory v = verifications[verificationId];

        if (v.withdrawn) {
            revert("ForeMarket: Already withdrawn");
        }

        verifications[verificationId].withdrawn = true;

        if (m.result == ResultType.DRAW) {
            // draw - withdraw verifier token
            foreVerifiers.transferFrom(
                address(this),
                v.verifier,
                v.tokenId
            );

            return;
        }

        PrivilegeNft memory p = privilegeNft;
        if (
            v.tokenId == p.privilegeNftId
            && !p.privilegeNftUsed
        ) {
            // apply penalty due to not used privilege NFT
            uint256 penalty = foreVerifiers.powerOf(p.privilegeNftId) / 10;
            foreVerifiers.decreasePower(p.privilegeNftId, penalty);
            foreToken.burnFrom(address(this), penalty);

            foreVerifiers.transferFrom(
                address(this),
                p.privilegeNftStaker,
                p.privilegeNftId
            );
            return;
        }

        uint256 verificatorsFees = (m.sideA + m.sideB)
            * marketConfig.verificationFee()
            / 10000;
        if (v.side == (m.result == ResultType.AWON)) {
            // verifier voted properly
            uint256 reward = (v.power * verificatorsFees) / (v.side ? m.verifiedA : m.verifiedB);
            foreVerifiers.increasePower(v.tokenId, reward);
            foreToken.transferFrom(
                address(this),
                address(foreVerifiers),
                reward
            );
            foreVerifiers.transferFrom(address(this), v.verifier, v.tokenId);
            emit WithdrawReward(v.verifier, 2, reward);
            return;
        } else {
            // verifier voted wrong
            uint256 power = foreVerifiers.powerOf(v.tokenId);
            if (dispute.confirmed) {
                foreVerifiers.decreasePower(v.tokenId, power);
                foreToken.transferFrom(
                    address(this),
                    dispute.disputeCreator,
                    power / 2
                );
                foreToken.transferFrom(
                    address(this),
                    protocolConfig.highGuard(),
                    power / 2
                );
            }
            foreVerifiers.burn(v.tokenId);
            return;
        }
    }

    ///@notice Withdraws Market Creators Reward
    function marketCreatorFeeWithdraw() external {
        Market memory m = market;

        if (m.result == ResultType.NULL) {
            revert("ForeMarket: Market Not closed");
        }

        factory.transferFrom(msg.sender, address(this), m.marketTokenId);
        factory.burn(m.marketTokenId);

        uint256 toWithdraw = (m.sideA + m.sideB)
            * marketConfig.marketCreatorFee()
            / 10000;
        foreToken.transfer(
            msg.sender,
            toWithdraw
        );

        emit WithdrawReward(msg.sender, 3, toWithdraw);
    }
}

interface IERC20Burnable is IERC20 {
    function burnFrom(address account, uint256 amount) external;

    function burn(uint256 amount) external;
}
