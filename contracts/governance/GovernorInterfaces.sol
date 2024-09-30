// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract GovernorDelegationStorage {
    /// @notice Administrator for this contract
    address public admin;

    /// @notice Pending administrator for this contract
    address public pendingAdmin;

    /// @notice Active brain of Governor
    address public implementation;
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

    /// @notice The delay before voting on a proposal may take place, once proposed, in seconds
    uint public votingDelay;

    /// @notice The duration of voting on a proposal, in seconds
    uint public votingPeriod;

    /// @notice The number of votes required in order for a voter to become a proposer
    uint public proposalThreshold;

    /// @notice The total number of proposals
    uint public proposalCount;

    /// @notice The address of the Compound Protocol Timelock
    TimelockInterface public timelock;

    /// @notice Fore governance token
    IERC20 public ForeToken;

    /// @notice The official record of all proposals ever proposed
    mapping(uint => Proposal) public proposals;

    /// @notice The latest proposal for each proposer
    mapping(address => uint) public latestProposalIds;

    struct Proposal {
        /// @notice Unique id for looking up a proposal
        uint id;
        /// @notice Creator of the proposal
        address proposer;
        /// @notice The timestamp that the proposal will be available for execution, set once the vote succeeds
        uint eta;
        /// @notice the ordered list of target addresses for calls to be made
        address[] targets;
        /// @notice The ordered list of values (i.e. msg.value) to be passed to the calls to be made
        uint[] values;
        /// @notice The ordered list of function signatures to be called
        string[] signatures;
        /// @notice The ordered list of calldata to be passed to each call
        bytes[] calldatas;
        /// @notice The time at which voting begins: holders must delegate their votes prior to this time
        uint startTime;
        /// @notice The time at which voting ends: votes must be cast prior to this time
        uint endTime;
        /// @notice Current number of votes in favor of this proposal
        uint forVotes;
        /// @notice Current number of votes in opposition to this proposal
        uint againstVotes;
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
        uint votes;
    }

    /// @notice Tiers for early withdrawal
    struct Tier {
        uint256 lockedWeeks;
        uint256 earlyWithdrawalSlashPercentage;
        uint256 votingPowerCoefficient;
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
    mapping(address => uint) public whitelistAccountExpirations;

    /// @notice Address which manages whitelisted proposals and whitelist accounts
    address public whitelistGuardian;

    struct ForeStake {
        /// @notice Fore amount staked
        uint ForeAmount;
        /// @notice Stake start timestamp
        uint startsAtTimestamp;
        /// @notice Stake end timestamp
        uint endsAtTimestamp;
    }

    /// @notice Stores Fore stakes data
    mapping(address => ForeStake) public ForeStakes;

    /// @notice Address which manages Timelock queue. When unset, anyone can queue proposals
    address public moderator;

    /// @notice Amount of Fore left to be distributed during Fore Rewards Campaign
    uint public ForeRewardsAmountLeft;

    /// @notice Fore Rewards Campaign end timestamp
    uint public ForeRewardsCampaignEndsAtTimestamp;

    /// @notice Total amount of Fore voted during Fore Rewards Campaign
    uint public totalVotedDuringForeRewardsCampaignLeft;

    /// @notice Amount of Fore voted during Fore Rewards Campaign per user
    mapping(address => uint) public votedDuringForeRewardsCampaign;

    /// @notice Tier
    mapping(uint256 => Tier) internal _tiers;
}

abstract contract GovernorInterface is GovernorStorage {
    /// @notice The name of this contract
    string public constant name = "Fore Governor";

    /// @notice The minimum setable proposal threshold
    uint public constant MIN_PROPOSAL_THRESHOLD = 1000e18; // 1,000 Fore

    /// @notice The maximum setable proposal threshold
    uint public constant MAX_PROPOSAL_THRESHOLD = 100000000e18; // 100,000,000 votes

    /// @notice The minimum setable voting period
    uint public constant MIN_VOTING_PERIOD = 86400; // 1 day, in seconds

    /// @notice The max setable voting period
    uint public constant MAX_VOTING_PERIOD = 7 * 86400; // 7 days, in seconds

    /// @notice The min setable voting delay
    uint public constant MIN_VOTING_DELAY = 86400; // 1 day, in seconds

    /// @notice The max setable voting delay
    uint public constant MAX_VOTING_DELAY = 10 * 86400; // 10 days, in seconds

    /// @notice The number of votes in support of a proposal required in order for a quorum to be reached and for a vote to succeed
    uint public constant quorumVotes = 100000000e18; // 100,000,000 votes

    /// @notice The maximum number of actions that can be included in a proposal
    uint public constant proposalMaxOperations = 10; // 10 actions

    /// @notice in seconds
    uint public constant weeks13 = 7862400;
    uint public constant weeks26 = 15724800;
    uint public constant weeks52 = 31449600;
    uint public constant weeks104 = 62899200;

    /// @notice Divider
    uint constant DIVIDER = 10000;

    /// @notice An event emitted when a new proposal is created
    event ProposalCreated(
        uint id,
        address proposer,
        address[] targets,
        uint[] values,
        string[] signatures,
        bytes[] calldatas,
        uint startTime,
        uint endTime,
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
        uint proposalId,
        uint8 support,
        uint votes,
        string reason
    );

    /// @notice An event emitted when a proposal has been canceled
    event ProposalCanceled(uint id);

    /// @notice An event emitted when a proposal has been queued in the Timelock
    event ProposalQueued(uint id, uint eta);

    /// @notice An event emitted when a proposal has been executed in the Timelock
    event ProposalExecuted(uint id);

    /// @notice An event emitted when the voting delay is set
    event VotingDelaySet(uint oldVotingDelay, uint newVotingDelay);

    /// @notice An event emitted when the voting period is set
    event VotingPeriodSet(uint oldVotingPeriod, uint newVotingPeriod);

    /// @notice Emitted when proposal threshold is set
    event ProposalThresholdSet(
        uint oldProposalThreshold,
        uint newProposalThreshold
    );

    /// @notice Emitted when pendingAdmin is changed
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /// @notice Emitted when tier is changed
    event ManagedTier(
        uint8 indexed tierIndex,
        uint lockedWeeks,
        uint slashPercentage,
        uint votingPowerCoefficient
    );

    /// @notice Emitted when pendingAdmin is accepted, which means admin is updated
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Emitted when whitelist account expiration is set
    event WhitelistAccountExpirationSet(address account, uint expiration);

    /// @notice Emitted when the whitelistGuardian is set
    event WhitelistGuardianSet(address oldGuardian, address newGuardian);

    /// @notice Emitted when Fore stake is created or updated for an account
    event NewForeStake(
        address indexed account,
        uint ForeAmount,
        uint startsAtTimestamp,
        uint endsAtTimestamp
    );

    /// @notice Emitted when Fore stake is withdrawn
    event ForeWithdrawal(address indexed account, uint amount);

    /// @notice Emitted when moderator is changed
    event ModeratorSet(address oldModerator, address newModerator);

    /// @notice Emitted when Fore Rewards Campaign is launched
    event ForeRewardCampaignStarted(
        uint startsAtTimestamp,
        uint endsAtTimestamp,
        uint ForeRewardsAmount
    );

    /// @notice Emitted when account vote during Fore Rewards Campaign is registered and user is eligible for reward
    event ForeRewardCampaignVoteRegistered(
        address indexed account,
        uint ForeAmount,
        uint campaignEndsAtTimestamp
    );

    /// @notice Emitted when Fore reward is withdrawn
    event ForeRewardWithdrawal(address indexed account, uint amount);

    function initialize(
        address timelock_,
        address fore_,
        uint votingPeriod_,
        uint votingDelay_,
        uint proposalThreshold_
    ) external virtual;

    function startForeRewardsCampaign(
        uint endsAtTimestamp,
        uint ForeRewardsAmount
    ) external virtual;

    function calculateForeReward(
        address account
    ) external view virtual returns (uint);

    function withdrawForeReward() external virtual;

    function stakeForeForVotes(
        uint amount,
        uint stakePeriodLenSecs
    ) external virtual;

    function withdrawForeStake() external virtual;

    function getVotes(address account) external view virtual returns (uint);

    function getHypotheticalVotes(
        address account,
        uint addForeAmount,
        uint newStakePeriodLenSecs
    ) external view virtual returns (uint);

    function propose(
        address[] memory targets,
        uint[] memory values,
        string[] memory signatures,
        bytes[] memory calldatas,
        string memory title,
        string memory description
    ) external virtual returns (uint);

    function queue(uint proposalId) external virtual;

    function execute(uint proposalId) external payable virtual;

    function cancel(uint proposalId) external virtual;

    function getActions(
        uint proposalId
    )
        external
        view
        virtual
        returns (
            address[] memory targets,
            uint[] memory values,
            string[] memory signatures,
            bytes[] memory calldatas
        );

    function getReceipt(
        uint proposalId,
        address voter
    ) external view virtual returns (Receipt memory);

    function state(
        uint proposalId
    ) external view virtual returns (ProposalState);

    function castVote(uint proposalId, uint8 support) external virtual;

    function castVoteWithReason(
        uint proposalId,
        uint8 support,
        string calldata reason
    ) external virtual;

    function isWhitelisted(
        address account
    ) external view virtual returns (bool);

    function _setVotingDelay(uint newVotingDelay) external virtual;

    function _setVotingPeriod(uint newVotingPeriod) external virtual;

    function _setModerator(address newModerator) external virtual;

    function _setProposalThreshold(uint newProposalThreshold) external virtual;

    function _setWhitelistAccountExpiration(
        address account,
        uint expiration
    ) external virtual;

    function _setWhitelistGuardian(address account) external virtual;

    function _initiate() external virtual;

    function _timelockAcceptAdminOf(address addr) external virtual;

    function _setPendingAdmin(address newPendingAdmin) external virtual;

    function _manageTier(
        uint8 tierIndex,
        uint lockedWeeks,
        uint slashPercentage,
        uint votingPowerCoefficient
    ) external virtual;

    function _acceptAdmin() external virtual;
}

interface AcceptAdminInterface {
    function _acceptAdmin() external;
}

interface TimelockInterface is AcceptAdminInterface {
    function delay() external view returns (uint);

    function GRACE_PERIOD() external view returns (uint);

    function queuedTransactions(bytes32 hash) external view returns (bool);

    function queueTransaction(
        address target,
        uint value,
        string calldata signature,
        bytes calldata data,
        uint eta
    ) external returns (bytes32);

    function cancelTransaction(
        address target,
        uint value,
        string calldata signature,
        bytes calldata data,
        uint eta
    ) external;

    function executeTransaction(
        address target,
        uint value,
        string calldata signature,
        bytes calldata data,
        uint eta
    ) external payable returns (bytes memory);

    function _acceptAdminOf(address addr) external;

    function _setDelay(uint newDelay) external;

    function _setPendingAdmin(address newPendingAdmin) external;
}
