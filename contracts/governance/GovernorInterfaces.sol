// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract GovernorDelegationStorage {
    /// @notice Administrator for this contract
    address public admin;

    /// @notice Pending administrator for this contract
    address public pendingAdmin;
}

contract GovernorDelegatorInterface is GovernorDelegationStorage {
    /// @notice Emitted when implementation is changed
    event NewImplementation(
        address oldImplementation,
        address newImplementation
    );
}

/**
 * @title Storage for Governor Delegate
 * @notice For future upgrades, do not change GovernorStorage. Create a new
 * contract which implements GovernorStorage and following the naming convention GovernorStorageVX
 */
contract GovernorStorage is GovernorDelegationStorage {
    /// @dev Guard variable for reentrancy checks
    bool internal _notEntered;

    /// @notice The number of votes required in order for a voter to become a proposer
    uint256 public proposalThreshold;

    /// @notice The total number of proposals
    uint256 public proposalCount;

    /// @notice The delay before voting on a proposal may take place, once proposed, in seconds
    uint32 public votingDelay;

    /// @notice The duration of voting on a proposal, in seconds
    uint32 public votingPeriod;

    /// @notice The address of the Compound Protocol Timelock
    TimelockInterface public timelock;

    /// @notice Fore governance token
    IERC20 public ForeToken;

    /// @notice The official record of all proposals ever proposed
    mapping(uint256 => Proposal) public proposals;

    /// @notice The latest proposal for each proposer
    mapping(address => uint256) public latestProposalIds;

    /// @notice Checkpoints
    mapping(address => Checkpoint[]) public checkpoints;

    /// @notice Proposal hash mapper
    mapping(bytes32 => bool) public proposalHashExists;

    struct Checkpoint {
        /// @notice From block
        uint32 fromBlock;
        /// @notice Recorded votes
        uint256 votes;
    }

    struct Proposal {
        /// @notice Unique id for looking up a proposal
        uint256 id;
        /// @notice Creator of the proposal
        address proposer;
        /// @notice The timestamp that the proposal will be available for execution, set once the vote succeeds
        uint256 eta;
        /// @notice the ordered list of target addresses for calls to be made
        address[] targets;
        /// @notice The ordered list of values (i.e. msg.value) to be passed to the calls to be made
        uint256[] values;
        /// @notice The ordered list of function signatures to be called
        string[] signatures;
        /// @notice The ordered list of calldata to be passed to each call
        bytes[] calldatas;
        /// @notice The time at which voting begins: holders must delegate their votes prior to this time
        uint256 startTime;
        /// @notice The time at which voting ends: votes must be cast prior to this time
        uint256 endTime;
        /// @notice Current number of votes in favor of this proposal
        uint256 forVotes;
        /// @notice Current number of votes in opposition to this proposal
        uint256 againstVotes;
        /// @notice Vote start block
        uint256 voteStartBlock;
        /// @notice Flag marking whether the proposal has been canceled
        bool canceled;
        /// @notice Flag marking whether the proposal has been executed
        bool executed;
        /// @notice Receipts of ballots for the entire set of voters
        mapping(address => Receipt) receipts;
    }

    /// @notice Ballot receipt record for a voter
    struct Receipt {
        /// @notice Whether or not a vote has been cast
        bool hasVoted;
        /// @notice Whether or not the voter supports the proposal
        uint8 support;
        /// @notice The number of votes the voter had, which were cast
        uint256 votes;
    }

    /// @notice Tiers for early withdrawal
    struct Tier {
        uint32 lockedWeeks;
        uint32 earlyWithdrawalSlashPercentage;
        uint32 votingPowerCoefficient;
    }

    /// @notice Possible states that a proposal may be in
    enum ProposalState {
        Pending, // 0
        Active, // 1
        Canceled, // 2
        Defeated, // 3
        Succeeded, // 4
        Queued, // 5
        Expired, // 6
        Executed // 7
    }

    /// @notice Stores the expiration of account whitelist status as a timestamp
    mapping(address => uint256) public whitelistAccountExpirations;

    /// @notice Address which manages whitelisted proposals and whitelist accounts
    address public whitelistGuardian;

    struct ForeStake {
        /// @notice Fore amount staked
        uint256 ForeAmount;
        /// @notice Stake start timestamp
        uint256 startsAtTimestamp;
        /// @notice Stake end timestamp
        uint256 endsAtTimestamp;
    }

    /// @notice Stores Fore stakes data
    mapping(address => ForeStake) public ForeStakes;

    /// @notice Address which manages Timelock queue. When unset, anyone can queue proposals
    address public moderator;

    /// @notice Amount of Fore left to be distributed during Fore Rewards Campaign
    uint256 public ForeRewardsAmountLeft;

    /// @notice Fore Rewards Campaign end timestamp
    uint256 public ForeRewardsCampaignEndsAtTimestamp;

    /// @notice Total amount of Fore voted during Fore Rewards Campaign
    uint256 public totalVotedDuringForeRewardsCampaignLeft;

    /// @notice Amount of Fore voted during Fore Rewards Campaign per user
    mapping(address => uint256) public votedDuringForeRewardsCampaign;

    /// @notice Tier
    mapping(uint8 => Tier) internal _tiers;
}

abstract contract GovernorInterface is GovernorStorage {
    error GovernorDelegate__AdminOnly();
    error GovernorDelegate__AlreadyInitialized();
    error GovernorDelegate__InvalidInitializationParameters();
    error GovernorDelegate__InvalidArgument();
    error GovernorDelegate__InsufficientBalance();
    error GovernorDelegate__NothingToWithdraw();
    error GovernorDelegate__StakeLengthTooLow();
    error GovernorDelegate__HoldingPeriodNotMet();
    error GovernorDelegate__InvalidState();
    error GovernorDelegate__DuplicateProposal();
    error GovernorDelegate__IDCollision();

    /// @notice The name of this contract
    string public constant name = "Fore Governor";

    /// @notice The minimum setable proposal threshold
    uint256 public constant MIN_PROPOSAL_THRESHOLD = 1000e18; // 1,000 Fore

    /// @notice The maximum setable proposal threshold
    uint256 public constant MAX_PROPOSAL_THRESHOLD = 100000000e18; // 100,000,000 votes

    /// @notice Max stake amount
    uint128 public constant MAX_STAKE_AMOUNT = 120000000 ether;

    /// @notice The number of votes in support of a proposal required in order for a quorum to be reached and for a vote to succeed
    uint128 public constant QUORUM_VOTES = 100000000e18; // 100,000,000 votes

    /// @notice The minimum setable voting period
    uint32 public constant MIN_VOTING_PERIOD = 86400; // 1 day, in seconds

    /// @notice The max setable voting period
    uint32 public constant MAX_VOTING_PERIOD = 7 days; // 7 days, in seconds

    /// @notice The min setable voting delay
    uint32 public constant MIN_VOTING_DELAY = 86400; // 1 day, in seconds

    /// @notice The max setable voting delay
    uint32 public constant MAX_VOTING_DELAY = 10 * 86400; // 10 days, in seconds

    /// @notice Holding period
    uint32 public constant MIN_HOLD_PERIOD = 3 days;

    /// @notice in seconds
    uint32 public constant weeks13 = 7862400;
    uint32 public constant weeks26 = 15724800;
    uint32 public constant weeks52 = 31449600;
    uint32 public constant weeks104 = 62899200;

    /// @notice Divider
    uint16 public constant DIVIDER = 10000;

    /// @notice The maximum number of actions that can be included in a proposal
    uint8 public constant proposalMaxOperations = 10; // 10 actions

    /// @notice A governor is initialized
    event GovernorInitialized(
        uint32 votingDelay,
        uint32 votingPeriod,
        uint256 proposalThreshold
    );

    /// @notice An event emitted when a new proposal is created
    event ProposalCreated(
        uint256 indexed id,
        address proposer,
        address[] targets,
        uint256[] values,
        string[] signatures,
        bytes[] calldatas,
        uint256 startTime,
        uint256 endTime,
        string title,
        string description
    );

    /** @notice An event emitted when a vote has been cast on a proposal
     *  @param voter The address which casted a vote
     *  @param proposalId The proposal id which was voted on
     *  @param support Support value for the vote. 0=against, 1=for
     *  @param votes Number of votes which were cast by the voter
     *  @param reason The reason given for the vote by the voter
     */
    event VoteCast(
        address indexed voter,
        uint256 proposalId,
        uint8 support,
        uint256 votes,
        string reason
    );

    /// @notice An event emitted when a proposal has been canceled
    event ProposalCanceled(uint256 id);

    /// @notice An event emitted when a proposal has been queued in the Timelock
    event ProposalQueued(uint256 id, uint256 eta);

    /// @notice An event emitted when a proposal has been executed in the Timelock
    event ProposalExecuted(uint256 id);

    /// @notice An event emitted when the voting delay is set
    event VotingDelaySet(uint32 oldVotingDelay, uint32 newVotingDelay);

    /// @notice An event emitted when the voting period is set
    event VotingPeriodSet(uint32 oldVotingPeriod, uint32 newVotingPeriod);

    /// @notice Emitted when proposal threshold is set
    event ProposalThresholdSet(
        uint256 oldProposalThreshold,
        uint256 newProposalThreshold
    );

    /// @notice Emitted when pendingAdmin is changed
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /// @notice Emitted when tier is changed
    event ManagedTier(
        uint8 indexed tierIndex,
        uint32 lockedWeeks,
        uint32 slashPercentage,
        uint32 votingPowerCoefficient
    );

    /// @notice Emitted when pendingAdmin is accepted, which means admin is updated
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Emitted when whitelist account expiration is set
    event WhitelistAccountExpirationSet(address account, uint256 expiration);

    /// @notice Emitted when the whitelistGuardian is set
    event WhitelistGuardianSet(address oldGuardian, address newGuardian);

    /// @notice Emitted when Fore stake is created or updated for an account
    event NewForeStake(
        address indexed account,
        uint8 tierIndex,
        uint256 addForeAmount,
        uint256 ForeAmount,
        uint256 startsAtTimestamp,
        uint256 endsAtTimestamp
    );

    /// @notice Emitted when Fore stake is withdrawn
    event ForeWithdrawal(address indexed account, uint256 amount);

    /// @notice Emitted when moderator is changed
    event ModeratorSet(address oldModerator, address newModerator);

    /// @notice Emitted when Fore Rewards Campaign is launched
    event ForeRewardCampaignStarted(
        uint256 startsAtTimestamp,
        uint256 endsAtTimestamp,
        uint256 ForeRewardsAmount
    );

    /// @notice Emitted when account vote during Fore Rewards Campaign is registered and user is eligible for reward
    event ForeRewardCampaignVoteRegistered(
        address indexed account,
        uint256 ForeAmount,
        uint256 campaignEndsAtTimestamp
    );

    /// @notice Emitted when Fore reward is withdrawn
    event ForeRewardWithdrawal(address indexed account, uint256 amount);

    function initialize(
        address timelock_,
        address fore_,
        uint32 votingPeriod_,
        uint32 votingDelay_,
        uint256 proposalThreshold_
    ) external virtual;

    function startForeRewardsCampaign(
        uint256 endsAtTimestamp,
        uint256 ForeRewardsAmount
    ) external virtual;

    function calculateForeReward(
        address account
    ) external view virtual returns (uint256);

    function withdrawForeReward() external virtual;

    function stakeForeForVotes(
        uint256 amount,
        uint256 stakePeriodLenSecs
    ) external virtual;

    function withdrawForeStake() external virtual;

    function getVotes(address account) external view virtual returns (uint256);

    function getHypotheticalVotes(
        address account,
        uint256 addForeAmount,
        uint256 newStakePeriodLenSecs
    ) external view virtual returns (uint256);

    function propose(
        address[] memory targets,
        uint256[] memory values,
        string[] memory signatures,
        bytes[] memory calldatas,
        string memory title,
        string memory description
    ) external virtual returns (uint256);

    function queue(uint256 proposalId) external virtual;

    function execute(uint256 proposalId) external payable virtual;

    function cancel(uint256 proposalId) external virtual;

    function getActions(
        uint256 proposalId
    )
        external
        view
        virtual
        returns (
            address[] memory targets,
            uint256[] memory values,
            string[] memory signatures,
            bytes[] memory calldatas
        );

    function getReceipt(
        uint256 proposalId,
        address voter
    ) external view virtual returns (Receipt memory);

    function state(
        uint256 proposalId
    ) external view virtual returns (ProposalState);

    function castVote(uint256 proposalId, uint8 support) external virtual;

    function castVoteWithReason(
        uint256 proposalId,
        uint8 support,
        string calldata reason
    ) external virtual;

    function isWhitelisted(
        address account
    ) external view virtual returns (bool);

    function _setVotingDelay(uint32 newVotingDelay) external virtual;

    function _setVotingPeriod(uint32 newVotingPeriod) external virtual;

    function _setModerator(address newModerator) external virtual;

    function _setProposalThreshold(
        uint256 newProposalThreshold
    ) external virtual;

    function _setWhitelistAccountExpiration(
        address account,
        uint256 expiration
    ) external virtual;

    function _setWhitelistGuardian(address account) external virtual;

    function _initiate() external virtual;

    function _timelockAcceptAdminOf(address addr) external virtual;

    function _setPendingAdmin(address newPendingAdmin) external virtual;

    function _manageTier(
        uint8 tierIndex,
        uint32 lockedWeeks,
        uint32 slashPercentage,
        uint32 votingPowerCoefficient
    ) external virtual;

    function _acceptAdmin() external virtual;
}

interface AcceptAdminInterface {
    function _acceptAdmin() external;
}

interface TimelockInterface is AcceptAdminInterface {
    function delay() external view returns (uint32);

    function GRACE_PERIOD() external view returns (uint32);

    function queuedTransactions(bytes32 hash) external view returns (bool);

    function queueTransaction(
        address target,
        uint256 value,
        string calldata signature,
        bytes calldata data,
        uint256 eta
    ) external returns (bytes32);

    function cancelTransaction(
        address target,
        uint256 value,
        string calldata signature,
        bytes calldata data,
        uint256 eta
    ) external;

    function executeTransaction(
        address target,
        uint256 value,
        string calldata signature,
        bytes calldata data,
        uint256 eta
    ) external payable returns (bytes memory);

    function _acceptAdminOf(address addr) external;

    function _setDelay(uint32 newDelay) external;

    function _setPendingAdmin(address newPendingAdmin) external;
}
