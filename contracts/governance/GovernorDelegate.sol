// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./GovernorInterfaces.sol";

contract GovernorDelegate is GovernorInterface {
    using SafeERC20 for IERC20;

    modifier adminOnly() {
        if (msg.sender != admin) {
            revert GovernorDelegate__AdminOnly();
        }
        _;
    }

    /**
     * @notice Used to initialize the contract during delegator constructor
     * @param timelock_ The address of the Timelock
     * @param fore_ The address of the Fore token
     * @param votingPeriod_ The initial voting period, in seconds
     * @param votingDelay_ The initial voting delay, in seconds
     * @param proposalThreshold_ The initial proposal threshold
     */
    function initialize(
        address timelock_,
        address fore_,
        uint32 votingPeriod_,
        uint32 votingDelay_,
        uint256 proposalThreshold_
    ) external override adminOnly {
        if (address(timelock) != address(0)) {
            revert GovernorDelegate__AlreadyInitialized();
        }
        if (admin == address(0)) {
            revert GovernorDelegate__InvalidInitializationParameters();
        }
        if (timelock_ == address(0)) {
            revert GovernorDelegate__InvalidInitializationParameters();
        }
        if (address(timelock_).code.length == 0) {
            revert GovernorDelegate__InvalidInitializationParameters();
        }

        if (fore_ == address(0)) {
            revert GovernorDelegate__InvalidInitializationParameters();
        }
        if (
            votingPeriod_ < MIN_VOTING_PERIOD ||
            votingPeriod_ > MAX_VOTING_PERIOD
        ) {
            revert GovernorDelegate__InvalidInitializationParameters();
        }
        if (
            votingDelay_ < MIN_VOTING_DELAY || votingDelay_ > MAX_VOTING_DELAY
        ) {
            revert GovernorDelegate__InvalidInitializationParameters();
        }
        if (
            proposalThreshold_ < MIN_PROPOSAL_THRESHOLD ||
            proposalThreshold_ > MAX_PROPOSAL_THRESHOLD
        ) {
            revert GovernorDelegate__InvalidInitializationParameters();
        }
        if (fore_.code.length == 0) {
            revert GovernorDelegate__InvalidInitializationParameters();
        }
        ForeToken = IERC20(fore_);
        if (ForeToken.totalSupply() >= 2 ** 200) {
            revert GovernorDelegate__InvalidInitializationParameters();
        }

        timelock = TimelockInterface(timelock_);
        votingPeriod = votingPeriod_;
        votingDelay = votingDelay_;
        proposalThreshold = proposalThreshold_;
        _notEntered = true;

        _tiers[0] = Tier(weeks13, 1700, 1000);
        _tiers[1] = Tier(weeks26, 1800, 2100);
        _tiers[2] = Tier(weeks52, 1900, 4500);
        _tiers[3] = Tier(weeks104, 2000, 10000);

        emit GovernorInitialized(
            votingDelay_,
            votingPeriod_,
            proposalThreshold_
        );
    }

    /**
     * @notice Admin function to launch Fore Rewards Campaign, starting from now
     * @param endsAtTimestamp Fore Rewards Campaign end time
     * @param ForeRewardsAmount Total Fore amount to be distributed
     */
    function startForeRewardsCampaign(
        uint256 endsAtTimestamp,
        uint256 ForeRewardsAmount
    ) external override nonReentrant adminOnly {
        if (endsAtTimestamp >= 100000000000) {
            revert GovernorDelegate__InvalidArgument();
        }
        if (endsAtTimestamp <= getBlockTimestamp()) {
            revert GovernorDelegate__InvalidArgument();
        }
        if (ForeRewardsAmount == 0) {
            revert GovernorDelegate__InvalidArgument();
        }
        if (getBlockTimestamp() < ForeRewardsCampaignEndsAtTimestamp) {
            revert GovernorDelegate__InvalidArgument();
        }
        if (ForeRewardsAmountLeft > ForeRewardsAmount) {
            revert GovernorDelegate__InvalidArgument();
        }
        uint256 rewardsAmount = ForeRewardsAmount - ForeRewardsAmountLeft;
        if (rewardsAmount == 0) {
            revert GovernorDelegate__InvalidArgument();
        }
        if (ForeToken.allowance(msg.sender, address(this)) < rewardsAmount) {
            revert GovernorDelegate__InsufficientBalance();
        }
        if (ForeToken.balanceOf(msg.sender) < rewardsAmount) {
            revert GovernorDelegate__InsufficientBalance();
        }
        ForeToken.safeTransferFrom(msg.sender, address(this), rewardsAmount);

        ForeRewardsAmountLeft = ForeRewardsAmount;
        ForeRewardsCampaignEndsAtTimestamp = endsAtTimestamp;
        emit ForeRewardCampaignStarted(
            getBlockTimestamp(),
            endsAtTimestamp,
            ForeRewardsAmount
        );
    }

    /// @notice Calculate Fore Reward for a given account
    function calculateForeReward(
        address account
    ) public view override returns (uint256) {
        return
            totalVotedDuringForeRewardsCampaignLeft == 0
                ? 0
                : (votedDuringForeRewardsCampaign[account] *
                    ForeRewardsAmountLeft) /
                    totalVotedDuringForeRewardsCampaignLeft;
    }

    /// @notice Withdraw Fore Reward when campaign has ended
    function withdrawForeReward() external override nonReentrant {
        require(
            getBlockTimestamp() >= ForeRewardsCampaignEndsAtTimestamp &&
                ForeRewardsCampaignEndsAtTimestamp > 0,
            "Governor::withdrawForeReward: campaign not ended"
        );

        uint256 amount = calculateForeReward(msg.sender);
        require(
            amount > 0,
            "Governor::withdrawForeReward: nothing to withdraw"
        );
        assert(amount <= ForeRewardsAmountLeft);

        totalVotedDuringForeRewardsCampaignLeft -= votedDuringForeRewardsCampaign[
            msg.sender
        ];
        votedDuringForeRewardsCampaign[msg.sender] = 0;
        ForeRewardsAmountLeft -= amount;

        require(
            ForeToken.balanceOf(address(this)) >= amount,
            "GovernorDelegate::withdrawForeReward: insufficient balance"
        );
        ForeToken.safeTransfer(msg.sender, amount);

        emit ForeRewardWithdrawal(msg.sender, amount);
    }

    /**
     * @notice Lock Fore tokens on this contract for votes or update existing stake
     * @param addForeAmount Fore amount to be transferred. Can be 0 when updating existing stakePeriodLen only, without changing the amount
     * @param newStakePeriodLenSecs Stake period length in seconds. Use 0 when updating existing stake without changing existing stakePeriodLen
     */
    function stakeForeForVotes(
        uint256 addForeAmount,
        uint256 newStakePeriodLenSecs
    ) external override nonReentrant {
        if (addForeAmount == 0) {
            revert GovernorDelegate__InvalidArgument();
        }
        ForeStake memory foreStake = getNewStakeData(
            msg.sender,
            addForeAmount,
            newStakePeriodLenSecs
        );
        ForeStakes[msg.sender] = foreStake;

        if (foreStake.ForeAmount == 0) {
            revert GovernorDelegate__InvalidArgument();
        }
        if (ForeToken.allowance(msg.sender, address(this)) < addForeAmount) {
            revert GovernorDelegate__InsufficientBalance();
        }
        if (ForeToken.balanceOf(msg.sender) < addForeAmount) {
            revert GovernorDelegate__InsufficientBalance();
        }
        ForeToken.safeTransferFrom(msg.sender, address(this), addForeAmount);

        uint8 tierIndex = getRewardTierIndexFromStakeLength(
            foreStake.endsAtTimestamp - foreStake.startsAtTimestamp
        );
        uint256 votes = getVotes(msg.sender);
        _writeCheckpoint(msg.sender, votes);

        emit NewForeStake(
            msg.sender,
            tierIndex,
            addForeAmount,
            foreStake.ForeAmount,
            foreStake.startsAtTimestamp,
            foreStake.endsAtTimestamp
        );
    }

    /// @notice Withdraw staked Fore tokens when stake period ends
    function withdrawForeStake() external override nonReentrant {
        ForeStake memory foreStake = ForeStakes[msg.sender];

        if (foreStake.ForeAmount == 0) {
            revert GovernorDelegate__NothingToWithdraw();
        }
        uint256 amount = foreStake.ForeAmount;

        // Early withdrawal
        if (getBlockTimestamp() < foreStake.endsAtTimestamp) {
            Tier memory tier = getRewardTierFromStakeLength(
                foreStake.endsAtTimestamp - foreStake.startsAtTimestamp
            );
            uint256 toBurn = (amount * tier.earlyWithdrawalSlashPercentage) /
                DIVIDER;
            amount = amount - toBurn;
            ForeToken.safeTransfer(
                address(0x000000000000000000000000000000000000dEaD),
                toBurn
            );
        }

        foreStake.ForeAmount = 0;
        foreStake.startsAtTimestamp = 0;
        foreStake.endsAtTimestamp = 0;
        _writeCheckpoint(msg.sender, 0);

        if (ForeToken.balanceOf(address(this)) < amount) {
            revert GovernorDelegate__InsufficientBalance();
        }
        ForeToken.safeTransfer(msg.sender, amount);

        emit ForeWithdrawal(msg.sender, amount);
    }

    /// @notice Get current number of votes for a given account
    function getVotes(address account) public view override returns (uint256) {
        return getHypotheticalVotes(account, 0, 0);
    }

    function getNewStakeData(
        address account,
        uint256 addForeAmount,
        uint256 newStakePeriodLenSecs
    ) internal view returns (ForeStake memory result) {
        if (newStakePeriodLenSecs >= 100000000) {
            revert GovernorDelegate__InvalidArgument();
        }
        if (addForeAmount > MAX_STAKE_AMOUNT) {
            revert GovernorDelegate__InvalidArgument();
        }

        if (account != address(0) && ForeStakes[account].ForeAmount > 0) {
            result.startsAtTimestamp = ForeStakes[account].startsAtTimestamp;
            result.ForeAmount = ForeStakes[account].ForeAmount + addForeAmount;

            if (newStakePeriodLenSecs > 0) {
                result.endsAtTimestamp =
                    result.startsAtTimestamp +
                    newStakePeriodLenSecs;
                if (
                    result.endsAtTimestamp < ForeStakes[account].endsAtTimestamp
                ) {
                    revert GovernorDelegate__InvalidArgument();
                }
            } else {
                result.endsAtTimestamp = ForeStakes[account].endsAtTimestamp;
            }
        } else {
            if (newStakePeriodLenSecs == 0 || addForeAmount == 0) {
                return ForeStake(0, 0, 0); // no previous stake and no new votes
            }
            if (newStakePeriodLenSecs < _tiers[0].lockedWeeks) {
                revert GovernorDelegate__InvalidArgument();
            }

            result.startsAtTimestamp = getBlockTimestamp();
            result.endsAtTimestamp =
                result.startsAtTimestamp +
                newStakePeriodLenSecs;
            result.ForeAmount = addForeAmount;
        }

        return result;
    }

    function getRewardTierFromStakeLength(
        uint256 stakeLength
    ) internal view returns (Tier memory) {
        uint8 tierIndex = getRewardTierIndexFromStakeLength(stakeLength);
        return _tiers[tierIndex];
    }

    function getRewardTierIndexFromStakeLength(
        uint256 stakeLength
    ) internal view returns (uint8) {
        if (stakeLength < _tiers[0].lockedWeeks) {
            revert GovernorDelegate__StakeLengthTooLow();
        }
        for (uint8 i = 3; i >= 0; --i) {
            if (stakeLength >= _tiers[i].lockedWeeks) {
                return i;
            }
        }
        return 0;
    }

    /**
     * @notice Get hypothetical number of votes for a given account after existing stake update
     * @param account The account to determine number of votes for. Can be 0x0
     * @param addForeAmount New stake amount. Can be 0 when updating existing stakePeriodLen only, without changing the amount
     * @param newStakePeriodLenSecs New stake period length in seconds. Use 0 when updating existing stake without changing existing stakePeriodLen
     */
    function getHypotheticalVotes(
        address account,
        uint256 addForeAmount,
        uint256 newStakePeriodLenSecs
    ) public view override returns (uint256 votes) {
        ForeStake memory newStake = getNewStakeData(
            account,
            addForeAmount,
            newStakePeriodLenSecs
        );

        if (getBlockTimestamp() >= newStake.endsAtTimestamp) {
            return 0; // stake expired
        }

        Tier memory tier = getRewardTierFromStakeLength(
            newStake.endsAtTimestamp - newStake.startsAtTimestamp
        );

        votes = (newStake.ForeAmount * tier.votingPowerCoefficient) / DIVIDER;
    }

    /**
     * @notice Function used to propose a new proposal. Sender must have delegates above the proposal threshold
     * @param targets Target addresses for proposal calls
     * @param values Eth values for proposal calls
     * @param signatures Function signatures for proposal calls
     * @param calldatas Calldatas for proposal calls
     * @param description String description of the proposal
     * @return Proposal id of new proposal
     */
    function propose(
        address[] memory targets,
        uint256[] memory values,
        string[] memory signatures,
        bytes[] memory calldatas,
        string memory title,
        string memory description
    ) external override nonReentrant returns (uint256) {
        if (
            getBlockTimestamp() - ForeStakes[msg.sender].startsAtTimestamp <
            MIN_HOLD_PERIOD
        ) {
            revert GovernorDelegate__HoldingPeriodNotMet();
        }
        if (
            getPriorVotes(msg.sender, block.number) < proposalThreshold &&
            !isWhitelisted(msg.sender)
        ) {
            revert GovernorDelegate__InvalidArgument();
        }

        uint256 length = targets.length;
        if (
            length != values.length ||
            length != signatures.length ||
            length != calldatas.length
        ) {
            revert GovernorDelegate__InvalidArgument();
        }
        if (length == 0) {
            revert GovernorDelegate__InvalidArgument();
        }
        if (length > proposalMaxOperations) {
            revert GovernorDelegate__InvalidArgument();
        }
        if (latestProposalIds[msg.sender] != 0) {
            ProposalState proposersLatestProposalState = state(
                latestProposalIds[msg.sender]
            );
            if (
                proposersLatestProposalState == ProposalState.Active ||
                proposersLatestProposalState == ProposalState.Pending
            ) {
                revert GovernorDelegate__InvalidState();
            }
        }
        if (
            proposalHashExists[
                keccak256(abi.encode(targets, values, calldatas))
            ]
        ) {
            revert GovernorDelegate__DuplicateProposal();
        }

        uint256 startTime = getBlockTimestamp() + votingDelay;
        uint256 endTime = startTime + votingPeriod;

        proposalCount++;
        Proposal storage newProposal = proposals[proposalCount];

        // This should never happen but add a check in case
        if (newProposal.id != 0) {
            revert GovernorDelegate__IDCollision();
        }
        newProposal.id = proposalCount;
        newProposal.proposer = msg.sender;
        newProposal.eta = 0;
        newProposal.targets = targets;
        newProposal.values = values;
        newProposal.signatures = signatures;
        newProposal.calldatas = calldatas;
        newProposal.startTime = startTime;
        newProposal.endTime = endTime;
        newProposal.forVotes = 0;
        newProposal.againstVotes = 0;
        newProposal.canceled = false;
        newProposal.executed = false;
        newProposal.voteStartBlock = block.number;

        latestProposalIds[newProposal.proposer] = newProposal.id;

        emit ProposalCreated(
            newProposal.id,
            msg.sender,
            targets,
            values,
            signatures,
            calldatas,
            startTime,
            endTime,
            title,
            description
        );
        return newProposal.id;
    }

    /**
     * @notice Queues a proposal of state succeeded. Can be called by the moderator only.
     * @param proposalId The id of the proposal to queue
     */
    function queue(uint256 proposalId) external override {
        require(msg.sender == moderator, "Governor::queue: moderator only");

        if (state(proposalId) == ProposalState.Succeeded) {
            Proposal storage proposal = proposals[proposalId];
            uint256 eta = getBlockTimestamp() + timelock.delay();

            for (uint256 i = 0; i < proposal.targets.length; i++) {
                queueOrRevertInternal(
                    proposal.targets[i],
                    proposal.values[i],
                    proposal.signatures[i],
                    proposal.calldatas[i],
                    eta
                );
            }

            proposal.eta = eta;
            emit ProposalQueued(proposalId, eta);
        } else if (state(proposalId) == ProposalState.Defeated) {
            cancel(proposalId);
        } else {
            revert("Governor::queue: invalid state");
        }
    }

    function queueOrRevertInternal(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 eta
    ) internal {
        require(
            !timelock.queuedTransactions(
                keccak256(abi.encode(target, value, signature, data, eta))
            ),
            "Governor::queueOrRevertInternal: identical proposal action already queued at eta"
        );
        timelock.queueTransaction(target, value, signature, data, eta);
    }

    /**
     * @notice Executes a queued proposal if eta has passed
     * @param proposalId The id of the proposal to execute
     */
    function execute(uint256 proposalId) external payable override {
        require(
            state(proposalId) == ProposalState.Queued,
            "Governor::execute: proposal not queued"
        );
        Proposal storage proposal = proposals[proposalId];
        proposal.executed = true;

        for (uint256 i = 0; i < proposal.targets.length; i++) {
            timelock.executeTransaction{value: proposal.values[i]}(
                proposal.targets[i],
                proposal.values[i],
                proposal.signatures[i],
                proposal.calldatas[i],
                proposal.eta
            );
        }

        emit ProposalExecuted(proposalId);
    }

    /**
     * @notice Cancels a proposal only if sender is the proposer, or proposer delegates dropped below proposal threshold
     * @param proposalId The id of the proposal to cancel
     */
    function cancel(uint256 proposalId) public override {
        require(
            state(proposalId) != ProposalState.Executed,
            "Governor::cancel: cannot cancel executed proposal"
        );

        Proposal storage proposal = proposals[proposalId];

        if (msg.sender != proposal.proposer) {
            if (isWhitelisted(proposal.proposer)) {
                require(
                    (getVotes(proposal.proposer) < proposalThreshold) &&
                        msg.sender == whitelistGuardian,
                    "Governor::cancel: whitelisted proposer"
                );
            } else {
                require(
                    (getVotes(proposal.proposer) < proposalThreshold),
                    "Governor::cancel: proposer above threshold"
                );
            }
        }

        proposal.canceled = true;
        bytes32 proposalHash = keccak256(
            abi.encode(proposal.targets, proposal.values, proposal.calldatas)
        );
        proposalHashExists[proposalHash] = false;

        for (uint256 i = 0; i < proposal.targets.length; i++) {
            timelock.cancelTransaction(
                proposal.targets[i],
                proposal.values[i],
                proposal.signatures[i],
                proposal.calldatas[i],
                proposal.eta
            );
        }

        emit ProposalCanceled(proposalId);
    }

    /**
     * @notice Gets actions of a proposal
     * @param proposalId the id of the proposal
     * @return targets of the proposal actions
     * @return values of the proposal actions
     * @return signatures of the proposal actions
     * @return calldatas of the proposal actions
     */
    function getActions(
        uint256 proposalId
    )
        external
        view
        override
        returns (
            address[] memory targets,
            uint256[] memory values,
            string[] memory signatures,
            bytes[] memory calldatas
        )
    {
        Proposal storage p = proposals[proposalId];
        return (p.targets, p.values, p.signatures, p.calldatas);
    }

    /**
     * @notice Gets the receipt for a voter on a given proposal
     * @param proposalId the id of proposal
     * @param voter The address of the voter
     * @return The voting receipt
     */
    function getReceipt(
        uint256 proposalId,
        address voter
    ) external view override returns (Receipt memory) {
        return proposals[proposalId].receipts[voter];
    }

    /**
     * @notice Gets the state of a proposal
     * @param proposalId The id of the proposal
     * @return Proposal state
     */
    function state(
        uint256 proposalId
    ) public view override returns (ProposalState) {
        require(
            proposalCount >= proposalId,
            "Governor::state: invalid proposal id"
        );
        Proposal storage proposal = proposals[proposalId];

        if (proposal.canceled) {
            return ProposalState.Canceled;
        } else if (getBlockTimestamp() <= proposal.startTime) {
            return ProposalState.Pending;
        } else if (getBlockTimestamp() <= proposal.endTime) {
            return ProposalState.Active;
        } else if (
            proposal.forVotes <= proposal.againstVotes ||
            proposal.forVotes < QUORUM_VOTES
        ) {
            return ProposalState.Defeated;
        } else if (proposal.eta == 0) {
            return ProposalState.Succeeded;
        } else if (proposal.executed) {
            return ProposalState.Executed;
        } else if (
            getBlockTimestamp() >= proposal.eta + timelock.GRACE_PERIOD()
        ) {
            return ProposalState.Expired;
        } else {
            return ProposalState.Queued;
        }
    }

    /**
     * @notice Cast a vote for a proposal
     * @param proposalId The id of the proposal to vote on
     * @param support The support value for the vote. 0=against, 1=for
     */
    function castVote(uint256 proposalId, uint8 support) external override {
        emit VoteCast(
            msg.sender,
            proposalId,
            support,
            castVoteInternal(msg.sender, proposalId, support),
            ""
        );
    }

    /**
     * @notice Cast a vote for a proposal with a reason
     * @param proposalId The id of the proposal to vote on
     * @param support The support value for the vote. 0=against, 1=for
     * @param reason The reason given for the vote by the voter
     */
    function castVoteWithReason(
        uint256 proposalId,
        uint8 support,
        string calldata reason
    ) external override {
        emit VoteCast(
            msg.sender,
            proposalId,
            support,
            castVoteInternal(msg.sender, proposalId, support),
            reason
        );
    }

    /**
     * @notice Internal function that caries out voting logic
     * @param voter The voter that is casting their vote
     * @param proposalId The id of the proposal to vote on
     * @param support The support value for the vote. 0=against, 1=for
     * @return The number of votes cast
     */
    function castVoteInternal(
        address voter,
        uint256 proposalId,
        uint8 support
    ) internal nonReentrant returns (uint256) {
        require(
            getBlockTimestamp() - ForeStakes[msg.sender].startsAtTimestamp >=
                MIN_HOLD_PERIOD,
            "Governor::propose: holding period not met"
        );
        ProposalState proposalState = state(proposalId);
        require(
            proposalState != ProposalState.Pending,
            "Governor::castVoteInternal: voting not started"
        );
        require(
            proposalState == ProposalState.Active,
            "Governor::castVoteInternal: voting is closed"
        );
        require(support <= 1, "Governor::castVoteInternal: invalid vote type");
        Proposal storage proposal = proposals[proposalId];
        Receipt storage receipt = proposal.receipts[voter];
        require(
            receipt.hasVoted == false,
            "Governor::castVoteInternal: voter already voted"
        );
        uint256 votes = getPriorVotes(voter, proposal.voteStartBlock);
        require(votes > 0, "Governor::castVoteInternal: no votes available");

        if (support == 0) {
            proposal.againstVotes = proposal.againstVotes + votes;
        } else if (support == 1) {
            proposal.forVotes = proposal.forVotes + votes;
        }

        receipt.hasVoted = true;
        receipt.support = support;
        receipt.votes = votes;

        if (
            getBlockTimestamp() < ForeRewardsCampaignEndsAtTimestamp &&
            votedDuringForeRewardsCampaign[voter] == 0
        ) {
            votedDuringForeRewardsCampaign[voter] = ForeStakes[voter]
                .ForeAmount;
            totalVotedDuringForeRewardsCampaignLeft += votedDuringForeRewardsCampaign[
                voter
            ];
            emit ForeRewardCampaignVoteRegistered(
                voter,
                votedDuringForeRewardsCampaign[voter],
                ForeRewardsCampaignEndsAtTimestamp
            );
        }

        return votes;
    }

    /**
     * @notice View function which returns if an account is whitelisted
     * @param account Account to check white list status of
     * @return If the account is whitelisted
     */
    function isWhitelisted(
        address account
    ) public view override returns (bool) {
        return (whitelistAccountExpirations[account] > getBlockTimestamp());
    }

    /**
     * @notice Admin function for setting the voting delay
     * @param newVotingDelay new voting delay, in seconds
     */
    function _setVotingDelay(
        uint32 newVotingDelay
    ) external override adminOnly {
        require(
            newVotingDelay >= MIN_VOTING_DELAY &&
                newVotingDelay <= MAX_VOTING_DELAY,
            "Governor::_setVotingDelay: invalid voting delay"
        );

        emit VotingDelaySet(votingDelay, newVotingDelay);
        votingDelay = newVotingDelay;
    }

    /**
     * @notice Admin function for setting the voting period
     * @param newVotingPeriod new voting period, in seconds
     */
    function _setVotingPeriod(
        uint32 newVotingPeriod
    ) external override adminOnly {
        require(
            newVotingPeriod >= MIN_VOTING_PERIOD &&
                newVotingPeriod <= MAX_VOTING_PERIOD,
            "Governor::_setVotingPeriod: invalid voting period"
        );

        emit VotingPeriodSet(votingPeriod, newVotingPeriod);
        votingPeriod = newVotingPeriod;
    }

    /**
     * @notice Admin function for setting the moderator address which has the ability to queue the proposals
     * @param newModerator new moderator address
     */
    function _setModerator(address newModerator) external override adminOnly {
        emit ModeratorSet(moderator, newModerator);
        moderator = newModerator;
    }

    /**
     * @notice Admin function for setting the proposal threshold
     * @dev newProposalThreshold must be greater than the hardcoded min
     * @param newProposalThreshold new proposal threshold
     */
    function _setProposalThreshold(
        uint256 newProposalThreshold
    ) external override adminOnly {
        require(
            newProposalThreshold >= MIN_PROPOSAL_THRESHOLD &&
                newProposalThreshold <= MAX_PROPOSAL_THRESHOLD,
            "Governor::_setProposalThreshold: invalid threshold"
        );

        emit ProposalThresholdSet(proposalThreshold, newProposalThreshold);
        proposalThreshold = newProposalThreshold;
    }

    /**
     * @notice Admin function for setting the whitelist expiration as a timestamp for an account. Whitelist status allows accounts to propose without meeting threshold
     * @param account Account address to set whitelist expiration for
     * @param expiration Expiration for account whitelist status as timestamp (if now < expiration, whitelisted)
     */
    function _setWhitelistAccountExpiration(
        address account,
        uint256 expiration
    ) external override {
        if (msg.sender != admin && msg.sender != whitelistGuardian) {
            revert GovernorDelegate__AdminOnly();
        }
        whitelistAccountExpirations[account] = expiration;
        emit WhitelistAccountExpirationSet(account, expiration);
    }

    /**
     * @notice Admin function for setting the whitelistGuardian. WhitelistGuardian can cancel proposals from whitelisted addresses
     * @param account Account to set whitelistGuardian to (0x0 to remove whitelistGuardian)
     */
    function _setWhitelistGuardian(
        address account
    ) external override adminOnly {
        emit WhitelistGuardianSet(whitelistGuardian, account);
        whitelistGuardian = account;
    }

    /**
     * @notice Initiate the Governor contract
     * @dev Admin only
     */
    function _initiate() external override adminOnly {
        timelock._acceptAdmin();
    }

    function _timelockAcceptAdminOf(address addr) external override adminOnly {
        timelock._acceptAdminOf(addr);
    }

    /**
     * @notice Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @dev Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @param newPendingAdmin New pending admin.
     */
    function _setPendingAdmin(
        address newPendingAdmin
    ) external override adminOnly {
        require(
            newPendingAdmin != address(0),
            "Governor::_setPendingAdmin: invalid admin"
        );

        emit NewPendingAdmin(pendingAdmin, newPendingAdmin);
        pendingAdmin = newPendingAdmin;
    }

    /**
     * @notice Modifies the parameters of a specific tier in the staking mechanism.
     * @dev Only the admin can call this function. It allows the admin to update a tier's locked period and slashing percentage.
     *      The function enforces the following conditions:
     *      - `tierIndex` must be less than 4.
     *      - `lockedWeeks` must be greater than 0.
     *      - `slashPercentage` must be greater than 0.
     *      - `votingPowerCoefficient` must be greater than 0.
     *      - For tierIndex 0, `lockedWeeks` must be less than the next tier's `lockedWeeks`.
     *      - For tierIndex 1 or 2, `lockedWeeks` must be greater than the previous tier's `lockedWeeks` and less than the next tier's `lockedWeeks`.
     *      - For any other tier, `lockedWeeks` must be greater than the previous tier's `lockedWeeks`.
     * @param tierIndex The index of the tier being modified.
     * @param lockedWeeks The new lock-up duration for this tier, expressed in weeks.
     * @param slashPercentage The penalty percentage (slashing) applied to stakers in this tier for early withdrawal.
     * @param votingPowerCoefficient The voting power coefficient
     *
     * Emits a {ManagedTier} event indicating that a tier has been updated.
     */
    function _manageTier(
        uint8 tierIndex,
        uint32 lockedWeeks,
        uint32 slashPercentage,
        uint32 votingPowerCoefficient
    ) external override adminOnly {
        require(tierIndex < 4, "Governor::_manageTier: invalid tier index");
        require(
            lockedWeeks > 0,
            "Governor::_manageTier: lockedWeeks must be greater than 0"
        );
        require(
            slashPercentage > 0,
            "Governor::_manageTier: slashPercentage must be greater than 0"
        );
        require(
            votingPowerCoefficient > 0,
            "Governor::_manageTier: votingPowerCoefficient must be greater than 0"
        );

        Tier memory nextTier = _tiers[tierIndex + 1];

        if (tierIndex == 0) {
            require(
                nextTier.lockedWeeks > lockedWeeks,
                "Governor::_manageTier: last tier lockedWeeks must be less than the next tier"
            );
        } else {
            Tier memory prevTier = _tiers[tierIndex - 1];

            if (tierIndex == 3) {
                require(
                    prevTier.lockedWeeks < lockedWeeks,
                    "Governor::_manageTier: last tier lockedWeeks must be greater than the previous tier"
                );
            } else {
                require(
                    prevTier.lockedWeeks < lockedWeeks,
                    "Governor::_manageTier: last tier lockedWeeks must be greater than the previous tier"
                );
                require(
                    nextTier.lockedWeeks > lockedWeeks,
                    "Governor::_manageTier: last tier lockedWeeks must be less than the next tier"
                );
            }
        }

        emit ManagedTier(
            tierIndex,
            lockedWeeks,
            slashPercentage,
            votingPowerCoefficient
        );
        _tiers[tierIndex] = Tier(
            lockedWeeks,
            slashPercentage,
            votingPowerCoefficient
        );
    }

    /**
     * @notice Retrieves the details of a specific staking tier.
     * @dev Returns the `lockedWeeks` and `slashPercentage` for the given tier index.
     * @param tierIndex The index of the tier to fetch.
     * @return A `Tier` struct containing the lock-up duration (in weeks) and the penalty percentage.
     */
    function getTier(uint8 tierIndex) external view returns (Tier memory) {
        return _tiers[tierIndex];
    }

    /**
     * @notice Accepts transfer of admin rights. msg.sender must be pendingAdmin
     * @dev Admin function for pending admin to accept role and update admin
     */
    function _acceptAdmin() external override {
        require(
            msg.sender == pendingAdmin,
            "Governor::_acceptAdmin: pending admin only"
        );

        emit NewAdmin(admin, pendingAdmin);
        emit NewPendingAdmin(pendingAdmin, address(0));
        admin = pendingAdmin;
        pendingAdmin = address(0);
    }

    function _writeCheckpoint(address user, uint256 newVotes) internal {
        checkpoints[user].push(
            Checkpoint({fromBlock: uint32(block.number), votes: newVotes})
        );
    }

    function getBlockTimestamp() public view virtual returns (uint256) {
        return block.timestamp;
    }

    function getPriorVotes(
        address account,
        uint256 blockNumber
    ) public view returns (uint256) {
        Checkpoint[] storage checkpoint = checkpoints[account];
        if (checkpoint.length == 0) {
            return 0;
        }
        if (checkpoint.length == 1) {
            return checkpoint[0].votes;
        }

        uint256 low = 0;
        uint256 high = checkpoint.length - 1;

        while (low <= high) {
            uint256 mid = (low + high) / 2;

            if (checkpoint[mid].fromBlock == blockNumber) {
                return checkpoint[mid].votes;
            } else if (checkpoint[mid].fromBlock < blockNumber) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return high >= 0 ? checkpoint[high].votes : 0;
    }

    modifier nonReentrant() {
        require(_notEntered, "Governor::nonReentrant: reentered");
        _notEntered = false;
        _;
        _notEntered = true; // get a gas-refund post-Istanbul
    }
}
