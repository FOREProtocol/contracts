import { ethers } from "hardhat";
import { MockContract } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ContractReceipt } from "ethers";
import { Block } from "@ethersproject/abstract-provider";

import { ForeToken } from "@/ForeToken";
import {
  ForeRewardCampaignStartedEvent,
  ForeRewardWithdrawalEvent,
  ForeWithdrawalEvent,
  GovernorDelegate,
  ManagedTierEvent,
  ModeratorSetEvent,
  NewForeStakeEvent,
  ProposalCanceledEvent,
  ProposalCreatedEvent,
  ProposalExecutedEvent,
  ProposalQueuedEvent,
  ProposalThresholdSetEvent,
  VoteCastEvent,
  VotingDelaySetEvent,
  VotingPeriodSetEvent,
  WhitelistAccountExpirationSetEvent,
  WhitelistGuardianSetEvent,
} from "@/GovernorDelegate";
import { GovernorDelegator } from "@/GovernorDelegator";
import { Timelock } from "@/Timelock";
import { ProtocolConfig } from "@/ProtocolConfig";
import { ForeVerifiers } from "@/ForeVerifiers";

import {
  assertEvent,
  attachContract,
  deployMockedContract,
  encodeParameters,
  expectFractionalAmount,
  getEvent,
  sendERC20Tokens,
  timetravel,
  txExec,
} from "../../../test/helpers/utils";
import {
  MORE_THAN_QUORUM_VOTES,
  PROPOSAL_THRESHOLD,
  TIME_LOCK_DELAY,
  UINT_MAX,
  VOTING_DELAY,
  VOTING_PERIOD,
  ZERO_ADDRESS,
} from "../../../test/helpers/constants";
import { NewImplementationEvent } from "@/GovernorDelegatorInterface";

const weeks = (x: number) => {
  return x * 604800;
};

enum VoteType {
  VOTE_AGAINST = 0,
  VOTE_FOR = 1,
}

describe("FORE Governance", function () {
  let defaultAdmin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let james: SignerWithAddress;
  let dave: SignerWithAddress;
  let highGuardAccount: SignerWithAddress;
  let marketplaceContract: SignerWithAddress;
  let foundationWallet: SignerWithAddress;

  let governor: GovernorDelegate;
  let governorDelegator: MockContract<GovernorDelegator>;
  let timelock: MockContract<Timelock>;
  let foreToken: MockContract<ForeToken>;
  let protocolConfig: MockContract<ProtocolConfig>;
  let foreVerifiers: MockContract<ForeVerifiers>;

  let blockTimestamp: number;

  beforeEach(async () => {
    [
      defaultAdmin,
      foundationWallet,
      highGuardAccount,
      marketplaceContract,
      alice,
      bob,
      james,
      dave,
    ] = await ethers.getSigners();

    foreToken = await deployMockedContract<ForeToken>("ForeToken");

    foreVerifiers = await deployMockedContract<ForeVerifiers>(
      "ForeVerifiers",
      "https://test.com/"
    );

    protocolConfig = await deployMockedContract<ProtocolConfig>(
      "ProtocolConfig",
      foundationWallet.address,
      highGuardAccount.address,
      marketplaceContract.address,
      foreToken.address,
      foreVerifiers.address,
      ethers.utils.parseEther("10"),
      ethers.utils.parseEther("20")
    );

    timelock = await deployMockedContract<Timelock>(
      "Timelock",
      defaultAdmin.address,
      TIME_LOCK_DELAY
    );

    await protocolConfig.transferOwnership(timelock.address);

    const governorDelegate = await deployMockedContract<GovernorDelegate>(
      "GovernorDelegate"
    );
    governorDelegator = await deployMockedContract<GovernorDelegator>(
      "GovernorDelegator",
      timelock.address,
      foreToken.address,
      defaultAdmin.address,
      governorDelegate.address,
      VOTING_PERIOD,
      VOTING_DELAY,
      PROPOSAL_THRESHOLD
    );
    governor = await attachContract<GovernorDelegate>(
      "GovernorDelegate",
      governorDelegator.address
    );

    await timelock._setPendingAdmin(governor.address);
    await governor._initiate();
    await governor._setWhitelistAccountExpiration(
      defaultAdmin.address,
      UINT_MAX
    );

    const previousBlock = await ethers.provider.getBlock("latest");
    blockTimestamp = previousBlock.timestamp;

    await foreToken.approve(governor.address, UINT_MAX);
  });

  const createProposal = async (user = defaultAdmin) => {
    await governor._setWhitelistAccountExpiration(user.address, UINT_MAX);
    await governor.connect(user).propose(
      [protocolConfig.address],
      [0],
      [
        "setMarketConfig(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
      ],
      [
        encodeParameters(
          [
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
          ],
          [
            ethers.utils.parseEther("1000"), // verifier mint price
            ethers.utils.parseEther("1000"), // dispute price
            ethers.utils.parseEther("10"), // creation price
            86400, // report period
            43200, // verification period
            100, // burn fee
            150, //  Foundation fee
            50, // market creator fee
            200, // verification fee
          ]
        ),
      ],
      "test",
      "description"
    );
    const previousBlock = await ethers.provider.getBlock("latest");
    await timetravel(previousBlock.timestamp + VOTING_DELAY + 1);
  };

  const startCampaign = async (endTime: number, amount: BigNumber) => {
    await governor.startForeRewardsCampaign(endTime, amount);
  };

  const stakeAndVote = async (
    user: SignerWithAddress = alice,
    amount: BigNumber,
    proposalId = 1
  ) => {
    await sendERC20Tokens(foreToken, {
      [user.address]: amount,
    });
    await foreToken.connect(user).approve(governor.address, UINT_MAX);
    await governor.connect(user).stakeForeForVotes(amount, weeks(104));
    await governor.connect(user).castVote(proposalId, VoteType.VOTE_FOR);
  };

  describe("getVotes", async () => {
    it("initial votes for more than 104 weeks stake", async () => {
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("100"),
        weeks(120)
      );
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("100")
      );
    });

    it("initial votes for 104 weeks stake", async () => {
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("100"),
        weeks(104)
      );
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("100")
      );
    });

    it("initial votes for 52 weeks stake", async () => {
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("100"),
        weeks(52)
      );
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("45")
      );
    });

    it("initial votes for 26 weeks stake", async () => {
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("100"),
        weeks(26)
      );
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("21")
      );
    });

    it("initial votes for 20 weeks stake", async () => {
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("100"),
        weeks(20)
      );
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("10")
      );
    });

    it("initial votes for 13 weeks stake", async () => {
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("100"),
        weeks(13)
      );
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("10")
      );
    });

    it("initial votes for less than 13 weeks stake", async () => {
      await expect(
        governor.stakeForeForVotes(ethers.utils.parseEther("100"), weeks(10))
      ).to.be.revertedWith("Governor::getNewStakeData: stakePeriodLen too low");
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(0);
    });

    it("votes for 104 weeks stake after 52 weeks", async () => {
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("100"),
        weeks(104)
      );
      await timetravel(blockTimestamp + weeks(52));
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("100")
      );
    });

    it("expired votes", async () => {
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("100"),
        weeks(104)
      );
      await timetravel(blockTimestamp + weeks(105));
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(0);
    });

    it("votes for 104 weeks stake after 1 week", async () => {
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("100"),
        weeks(104)
      );
      await timetravel(blockTimestamp + weeks(1));
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("100")
      );
    });

    it("votes for 30 weeks stake after 15 weeks", async () => {
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("100"),
        weeks(30)
      );
      await timetravel(blockTimestamp + weeks(15));
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("21")
      );
    });

    it("no votes", async () => {
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(0);
    });

    it("multiple votes for single account", async () => {
      expect(
        await governor.getHypotheticalVotes(defaultAdmin.address, 0, 42)
      ).to.equal(0);
      expect(
        await governor.getHypotheticalVotes(defaultAdmin.address, 42, 0)
      ).to.equal(0);
      expect(
        await governor.getHypotheticalVotes(defaultAdmin.address, 0, 0)
      ).to.equal(0);
      await expect(
        governor.getHypotheticalVotes(defaultAdmin.address, 1, 42)
      ).to.be.revertedWith("Governor::getNewStakeData: stakePeriodLen too low");
      await expect(
        governor.stakeForeForVotes(ethers.utils.parseEther("50"), 42)
      ).to.be.revertedWith("Governor::getNewStakeData: stakePeriodLen too low");

      expect(
        await governor.getHypotheticalVotes(
          ZERO_ADDRESS,
          ethers.utils.parseEther("50"),
          weeks(13)
        )
      ).to.equal(ethers.utils.parseEther("5"));
      expect(
        await governor.getHypotheticalVotes(
          defaultAdmin.address,
          ethers.utils.parseEther("50"),
          weeks(13)
        )
      ).to.equal(ethers.utils.parseEther("5"));
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("50"),
        weeks(13)
      );
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("5")
      );
      expect(
        await governor.getHypotheticalVotes(defaultAdmin.address, 0, 0)
      ).to.equal(ethers.utils.parseEther("5"));

      expect(
        await governor.getHypotheticalVotes(
          defaultAdmin.address,
          ethers.utils.parseEther("50"),
          0
        )
      ).to.equal(ethers.utils.parseEther("10"));
      await governor.stakeForeForVotes(ethers.utils.parseEther("50"), 0);
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("10")
      );

      expect(
        await governor.getHypotheticalVotes(defaultAdmin.address, 0, weeks(26))
      ).to.equal(ethers.utils.parseEther("21"));
      await governor.stakeForeForVotes(0, weeks(26));
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("21")
      );

      await expect(
        governor.getHypotheticalVotes(defaultAdmin.address, 0, weeks(13))
      ).to.be.revertedWith(
        "Governor::getNewStakeData: new stakePeriodLen cannot be lower than old one"
      );

      expect(
        await governor.getHypotheticalVotes(
          defaultAdmin.address,
          ethers.utils.parseEther("50"),
          weeks(114)
        )
      ).to.equal(ethers.utils.parseEther("150"));
      await governor.stakeForeForVotes(
        ethers.utils.parseEther("50"),
        weeks(114)
      );
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("150")
      );

      let previousBlock = await timetravel(blockTimestamp + weeks(57));

      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("150")
      );

      await timetravel(previousBlock.timestamp + weeks(37));
      expect(await governor.getVotes(defaultAdmin.address)).to.equal(
        ethers.utils.parseEther("150")
      );
    });
  });

  it("stakeForeForVotes", async () => {
    await expect(
      governor.stakeForeForVotes(ethers.utils.parseEther("0"), weeks(13))
    ).to.be.revertedWith("Governor::stakeForeForVotes: invalid argument");
    await expect(
      governor.stakeForeForVotes(ethers.utils.parseEther("50"), 0)
    ).to.be.revertedWith("Governor::stakeForeForVotes: invalid argument");
    await expect(governor.stakeForeForVotes(0, 0)).to.be.revertedWith(
      "Governor::stakeForeForVotes: invalid argument"
    );

    let [, receipt] = await txExec(
      governor.stakeForeForVotes(ethers.utils.parseEther("50"), weeks(13))
    );

    let previousBlock = await ethers.provider.getBlock("latest");
    blockTimestamp = previousBlock.timestamp;

    const firstStakeStartsAt = blockTimestamp;
    const firstStakeEndsAt = firstStakeStartsAt + weeks(13);

    assertEvent<NewForeStakeEvent>(receipt, "NewForeStake", {
      account: defaultAdmin.address,
      tierIndex: 0,
      startsAtTimestamp: BigNumber.from(firstStakeStartsAt),
      endsAtTimestamp: BigNumber.from(firstStakeEndsAt),
      addForeAmount: ethers.utils.parseEther("50"),
      ForeAmount: ethers.utils.parseEther("50"),
    });

    // await expectEventInLogs(stakePromise, "ERC20TokenMock", "Transfer", {
    //   from: defaultAdmin.address,
    //   to: governor.address,
    //   value: ethers.utils.parseEther("50"),
    // });

    [, receipt] = await txExec(
      governor.stakeForeForVotes(ethers.utils.parseEther("25"), 0)
    );
    assertEvent<NewForeStakeEvent>(receipt, "NewForeStake", {
      account: defaultAdmin.address,
      tierIndex: 0,
      startsAtTimestamp: BigNumber.from(firstStakeStartsAt),
      endsAtTimestamp: BigNumber.from(firstStakeEndsAt),
      addForeAmount: ethers.utils.parseEther("25"),
      ForeAmount: ethers.utils.parseEther("75"),
    });

    await timetravel(blockTimestamp + weeks(10));

    [, receipt] = await txExec(
      governor.stakeForeForVotes(ethers.utils.parseEther("25"), weeks(15))
    );
    assertEvent<NewForeStakeEvent>(receipt, "NewForeStake", {
      account: defaultAdmin.address,
      tierIndex: 0,
      startsAtTimestamp: BigNumber.from(firstStakeStartsAt),
      endsAtTimestamp: BigNumber.from(firstStakeEndsAt + weeks(2)),
      addForeAmount: ethers.utils.parseEther("25"),
      ForeAmount: ethers.utils.parseEther("100"),
    });
  });

  it("withdrawForeStake", async () => {
    await expect(governor.withdrawForeStake()).to.be.revertedWith(
      "Governor::withdrawForeStake: nothing to withdraw"
    );

    await governor.stakeForeForVotes(ethers.utils.parseEther("50"), weeks(13));
    await governor.stakeForeForVotes(ethers.utils.parseEther("25"), 0);
    let previousBlock = await ethers.provider.getBlock("latest");
    previousBlock = await timetravel(previousBlock.timestamp + weeks(10));
    await governor.stakeForeForVotes(ethers.utils.parseEther("25"), weeks(15));
    await timetravel(previousBlock.timestamp + weeks(5));
    const [, receipt] = await txExec(governor.withdrawForeStake());

    // await expectEventInLogs(withdrawPromise, "ERC20TokenMock", "Transfer", {
    //   from: governor.address,
    //   to: defaultAdmin.address,
    //   value: ethers.utils.parseEther("100"),
    // });

    assertEvent<ForeWithdrawalEvent>(receipt, "ForeWithdrawal", {
      account: defaultAdmin.address,
      amount: ethers.utils.parseEther("100"),
    });

    await expect(governor.withdrawForeStake()).to.be.revertedWith(
      "Governor::withdrawForeStake: nothing to withdraw"
    );
    expect(await governor.getVotes(defaultAdmin.address)).to.equal(0);
  });

  it("startForeRewardsCampaign", async () => {
    const previousBlock = await timetravel(blockTimestamp + 10);

    await expect(
      governor.startForeRewardsCampaign(
        blockTimestamp + 5,
        ethers.utils.parseEther("100")
      )
    ).to.be.revertedWith(
      "Governor::startForeRewardsCampaign: invalid argument"
    );
    await expect(
      governor.startForeRewardsCampaign(
        previousBlock.timestamp + 100,
        ethers.utils.parseEther("0")
      )
    ).to.be.revertedWith(
      "Governor::startForeRewardsCampaign: invalid argument"
    );
    await expect(
      governor.startForeRewardsCampaign(
        previousBlock.timestamp + 200000000000,
        ethers.utils.parseEther("100")
      )
    ).to.be.revertedWith(
      "Governor::startForeRewardsCampaign: invalid argument"
    );
    await expect(
      governor
        .connect(alice)
        .startForeRewardsCampaign(
          previousBlock.timestamp + 100,
          ethers.utils.parseEther("100")
        )
    ).to.be.revertedWith("Governor::startForeRewardsCampaign: admin only");

    let [, receipt] = await txExec(
      governor.startForeRewardsCampaign(
        previousBlock.timestamp + 100,
        ethers.utils.parseEther("100")
      )
    );

    assertEvent<ForeRewardCampaignStartedEvent>(
      receipt,
      "ForeRewardCampaignStarted",
      {
        endsAtTimestamp: BigNumber.from(previousBlock.timestamp + 100),
        ForeRewardsAmount: ethers.utils.parseEther("100"),
      }
    );

    // await expectEventInLogs(startPromise, "ERC20TokenMock", "Transfer", {
    //   from: defaultAdmin.address,
    //   to: governor.address,
    //   value: ethers.utils.parseEther("100"),
    // });

    await expect(
      governor.startForeRewardsCampaign(
        previousBlock.timestamp + 110,
        ethers.utils.parseEther("100")
      )
    ).to.be.revertedWith(
      "Governor::startForeRewardsCampaign: previous campaign not ended"
    );

    await timetravel(previousBlock.timestamp + 100);

    await expect(
      governor.startForeRewardsCampaign(
        previousBlock.timestamp + 200,
        ethers.utils.parseEther("90")
      )
    ).to.be.revertedWith(
      "Governor::startForeRewardsCampaign: ForeRewardsAmount is less than ForeRewardsAmountLeft"
    );

    [, receipt] = await txExec(
      governor.startForeRewardsCampaign(
        previousBlock.timestamp + 200,
        ethers.utils.parseEther("150")
      )
    );
    assertEvent<ForeRewardCampaignStartedEvent>(
      receipt,
      "ForeRewardCampaignStarted",
      {
        endsAtTimestamp: BigNumber.from(previousBlock.timestamp + 200),
        ForeRewardsAmount: ethers.utils.parseEther("150"),
      }
    );

    // await expectEventInLogs(startPromise, "ERC20TokenMock", "Transfer", {
    //   from: defaultAdmin.address,
    //   to: governor.address,
    //   value: ethers.utils.parseEther("50"),
    // });
  });

  describe("calculateForeReward", async () => {
    let previousBlock: Block;

    beforeEach(async () => {
      previousBlock = await ethers.provider.getBlock("latest");
    });

    it("withdrawForeReward", async () => {
      // try to withdraw before first campaign started
      await expect(governor.withdrawForeReward()).to.be.revertedWith(
        "Governor::withdrawForeReward: campaign not ended"
      );

      await createProposal();

      // user voted when no campaign active should not be registered
      await stakeAndVote(bob, ethers.utils.parseEther("10"));
      await startCampaign(
        previousBlock.timestamp + 100000,
        ethers.utils.parseEther("100")
      );
      await stakeAndVote(alice, ethers.utils.parseEther("10"));

      // try to withdraw before campaign end
      await expect(
        governor.connect(alice).withdrawForeReward()
      ).to.be.revertedWith("Governor::withdrawForeReward: campaign not ended");

      // end campaign
      await timetravel(previousBlock.timestamp + 100000);

      // user voted when no campaign active should not be registered
      await stakeAndVote(james, ethers.utils.parseEther("10"));

      // user1 withdraw Fore Rewards
      const [, receipt] = await txExec(
        governor.connect(alice).withdrawForeReward()
      );
      assertEvent<ForeRewardWithdrawalEvent>(receipt, "ForeRewardWithdrawal", {
        account: alice.address,
        amount: ethers.utils.parseEther("100"),
      });

      // await expectEventInLogs(withdrawPromise, "ERC20TokenMock", "Transfer", {
      //   from: governor.address,
      //   to: alice.address,
      //   value: ethers.utils.parseEther("100"),
      // });

      // try to withdraw multiple times
      await expect(
        governor.connect(alice).withdrawForeReward()
      ).to.be.revertedWith("Governor::withdrawForeReward: nothing to withdraw");

      // try to withdraw no reward
      await expect(governor.withdrawForeReward()).to.be.revertedWith(
        "Governor::withdrawForeReward: nothing to withdraw"
      );
    });

    it("single user", async () => {
      expect(await governor.calculateForeReward(alice.address)).to.equal(
        ethers.utils.parseEther("0")
      );

      await createProposal();
      await startCampaign(
        previousBlock.timestamp + 100000,
        ethers.utils.parseEther("100")
      );
      await stakeAndVote(alice, ethers.utils.parseEther("10"));

      // end campaign
      await timetravel(previousBlock.timestamp + 100000);

      // calculate rewards
      expect(await governor.calculateForeReward(alice.address)).to.equal(
        ethers.utils.parseEther("100")
      );

      // withdraw rewards
      const [, receipt] = await txExec(
        governor.connect(alice).withdrawForeReward()
      );
      assertEvent<ForeRewardWithdrawalEvent>(receipt, "ForeRewardWithdrawal", {
        account: alice.address,
        amount: ethers.utils.parseEther("100"),
      });

      // try to calculate rewards again
      expect(await governor.calculateForeReward(alice.address)).to.equal(
        ethers.utils.parseEther("0")
      );
    });

    it("two users", async () => {
      await createProposal();
      await startCampaign(
        previousBlock.timestamp + 200000,
        ethers.utils.parseEther("100")
      );

      await stakeAndVote(alice, ethers.utils.parseEther("100"));
      await stakeAndVote(bob, ethers.utils.parseEther("42"));

      // second vote during campaign should not be registered
      await createProposal(alice);

      await stakeAndVote(alice, ethers.utils.parseEther("10"), 2);

      // end campaign
      await timetravel(previousBlock.timestamp + 200000);

      // calculate rewards
      expect(await governor.calculateForeReward(alice.address)).to.equal(
        "70422535211267605633"
      );
      expect(await governor.calculateForeReward(bob.address)).to.equal(
        "29577464788732394366"
      );

      // withdraw rewards
      expectFractionalAmount(
        (
          await getEvent(
            "ForeRewardWithdrawal",
            governor.connect(alice).withdrawForeReward()
          )
        ).args["amount"],
        "70422535211267605633",
        5
      );
      expectFractionalAmount(
        (
          await getEvent(
            "ForeRewardWithdrawal",
            governor.connect(bob).withdrawForeReward()
          )
        ).args["amount"],
        "29577464788732394366",
        5
      );
    });

    it("multiple users", async () => {
      await createProposal();
      await startCampaign(
        previousBlock.timestamp + 100000,
        ethers.utils.parseEther("100")
      );
      await stakeAndVote(defaultAdmin, ethers.utils.parseEther("12"));
      await stakeAndVote(alice, ethers.utils.parseEther("42"));
      await stakeAndVote(bob, ethers.utils.parseEther("7"));
      await stakeAndVote(james, ethers.utils.parseEther("0.000003"));
      await stakeAndVote(dave, ethers.utils.parseEther("38.999997"));

      // end campaign
      await timetravel(previousBlock.timestamp + 100000);

      // calculate rewards
      expectFractionalAmount(
        await governor.calculateForeReward(defaultAdmin.address),
        ethers.utils.parseEther("12"),
        5
      );
      expectFractionalAmount(
        await governor.calculateForeReward(alice.address),
        ethers.utils.parseEther("42"),
        5
      );
      expectFractionalAmount(
        await governor.calculateForeReward(bob.address),
        ethers.utils.parseEther("7"),
        5
      );
      expectFractionalAmount(
        await governor.calculateForeReward(james.address),
        ethers.utils.parseEther("0.000003"),
        5
      );
      expectFractionalAmount(
        await governor.calculateForeReward(dave.address),
        ethers.utils.parseEther("38.999997"),
        5
      );

      // withdraw rewards
      expectFractionalAmount(
        (
          await getEvent(
            "ForeRewardWithdrawal",
            governor.connect(defaultAdmin).withdrawForeReward()
          )
        ).args["amount"],
        ethers.utils.parseEther("12"),
        5
      );
      expectFractionalAmount(
        (
          await getEvent(
            "ForeRewardWithdrawal",
            governor.connect(alice).withdrawForeReward()
          )
        ).args["amount"],
        ethers.utils.parseEther("42"),
        5
      );
      expectFractionalAmount(
        (
          await getEvent(
            "ForeRewardWithdrawal",
            governor.connect(bob).withdrawForeReward()
          )
        ).args["amount"],
        ethers.utils.parseEther("7"),
        5
      );
      expectFractionalAmount(
        (
          await getEvent(
            "ForeRewardWithdrawal",
            governor.connect(james).withdrawForeReward()
          )
        ).args["amount"],
        ethers.utils.parseEther("0.000003"),
        5
      );
      expectFractionalAmount(
        (
          await getEvent(
            "ForeRewardWithdrawal",
            governor.connect(dave).withdrawForeReward()
          )
        ).args["amount"],
        ethers.utils.parseEther("38.999997"),
        5
      );
    });

    it("rewards left from previous campaign", async () => {
      await createProposal();
      await startCampaign(
        previousBlock.timestamp + 100000,
        ethers.utils.parseEther("100")
      );
      await stakeAndVote(alice, ethers.utils.parseEther("10"));
      await stakeAndVote(bob, ethers.utils.parseEther("10"));

      // end campaign
      await timetravel(previousBlock.timestamp + 100000);

      // user1 withdraw rewards
      let [, receipt] = await txExec(
        governor.connect(alice).withdrawForeReward()
      );
      assertEvent<ForeRewardWithdrawalEvent>(receipt, "ForeRewardWithdrawal", {
        account: alice.address,
        amount: ethers.utils.parseEther("50"),
      });

      // start new campaign
      await startCampaign(
        previousBlock.timestamp + 200000,
        ethers.utils.parseEther("100")
      );

      // user1 vote in new campaign
      await createProposal(alice);
      await governor.connect(alice).castVote(2, VoteType.VOTE_FOR);

      // end campaign
      await timetravel(previousBlock.timestamp + 200000);

      // calculate rewards
      expect(await governor.calculateForeReward(alice.address)).to.equal(
        ethers.utils.parseEther("50")
      );
      expect(await governor.calculateForeReward(bob.address)).to.equal(
        ethers.utils.parseEther("50")
      );

      // user2 withdraw rewards
      [, receipt] = await txExec(governor.connect(bob).withdrawForeReward());
      assertEvent<ForeRewardWithdrawalEvent>(receipt, "ForeRewardWithdrawal", {
        account: bob.address,
        amount: ethers.utils.parseEther("50"),
      });
    });
  });

  describe("cancel proposal", async () => {
    let previousBlock: Block;

    beforeEach(async () => {
      previousBlock = await ethers.provider.getBlock("latest");

      await sendERC20Tokens(foreToken, {
        [alice.address]: MORE_THAN_QUORUM_VOTES,
      });
      await foreToken.connect(alice).approve(governor.address, UINT_MAX);
    });

    it("cannot cancel executed proposal", async () => {
      await createProposal();
      await stakeAndVote(alice, MORE_THAN_QUORUM_VOTES);

      previousBlock = await ethers.provider.getBlock("latest");
      previousBlock = await timetravel(previousBlock.timestamp + VOTING_PERIOD);

      let [, receipt] = await txExec(governor.queue(1));

      assertEvent<ProposalQueuedEvent>(receipt, "ProposalQueued");
      previousBlock = await timetravel(
        previousBlock.timestamp + TIME_LOCK_DELAY + 100
      );

      [, receipt] = await txExec(governor.execute(1));
      assertEvent<ProposalExecutedEvent>(receipt, "ProposalExecuted");

      await expect(governor.cancel(1)).to.be.revertedWith(
        "Governor::cancel: cannot cancel executed proposal"
      );
    });

    it("cancel whitelisted by proposer", async () => {
      await createProposal();

      const [, receipt] = await txExec(governor.cancel(1));
      assertEvent<ProposalCanceledEvent>(receipt, "ProposalCanceled", {
        id: BigNumber.from(1),
      });
      expect(await governor.state(1)).to.equal(2); // canceled
    });

    it("cancel whitelisted by non-proposer", async () => {
      await createProposal();
      await expect(governor.connect(alice).cancel(1)).to.be.revertedWith(
        "Governor::cancel: whitelisted proposer"
      );
    });

    it("cancel above threshold non-whitelisted by whitelisted", async () => {
      await governor
        .connect(alice)
        .stakeForeForVotes(MORE_THAN_QUORUM_VOTES, weeks(104));

      await governor
        .connect(alice)
        .propose(
          [protocolConfig.address],
          [0],
          ["setFoundationWallet(address)"],
          [encodeParameters(["address"], [foundationWallet.address])],
          "test proposal 1",
          "description 1"
        );

      await expect(governor.cancel(1)).to.be.revertedWith(
        "Governor::cancel: proposer above threshold"
      );
    });

    it("cancel below threshold non-whitelisted by whitelisted", async () => {
      await governor
        .connect(alice)
        .stakeForeForVotes(MORE_THAN_QUORUM_VOTES, weeks(104));

      await governor
        .connect(alice)
        .propose(
          [protocolConfig.address],
          [0],
          ["setFoundationWallet(address)"],
          [encodeParameters(["address"], [foundationWallet.address])],
          "test proposal 1",
          "description 1"
        );

      previousBlock = await ethers.provider.getBlock("latest");
      previousBlock = await timetravel(previousBlock.timestamp + weeks(104));
      const [, receipt] = await txExec(governor.cancel(1));

      assertEvent<ProposalCanceledEvent>(receipt, "ProposalCanceled", {
        id: BigNumber.from(1),
      });
    });

    it("cancel below threshold whitelisted by non-whitelisted", async () => {
      await governor._setWhitelistAccountExpiration(alice.address, UINT_MAX);
      await governor
        .connect(alice)
        .stakeForeForVotes(MORE_THAN_QUORUM_VOTES, weeks(104));

      await governor
        .connect(alice)
        .propose(
          [protocolConfig.address],
          [0],
          ["setFoundationWallet(address)"],
          [encodeParameters(["address"], [foundationWallet.address])],
          "test proposal 1",
          "description 1"
        );
      await timetravel(previousBlock.timestamp + weeks(104));

      await expect(governor.connect(bob).cancel(1)).to.be.revertedWith(
        "Governor::cancel: whitelisted proposer"
      );
    });
  });

  describe("early withdrawal", async () => {
    let previousBlock: Block;

    beforeEach(async () => {
      await sendERC20Tokens(foreToken, {
        [alice.address]: MORE_THAN_QUORUM_VOTES,
      });
      await foreToken.connect(alice).approve(governor.address, UINT_MAX);

      await governor._setWhitelistAccountExpiration(alice.address, UINT_MAX);
    });

    it("should slash 20%", async () => {
      await governor
        .connect(alice)
        .stakeForeForVotes(ethers.utils.parseEther("100"), weeks(104));

      previousBlock = await ethers.provider.getBlock("latest");

      await timetravel(previousBlock.timestamp + weeks(103));
      const [, receipt] = await txExec(
        governor.connect(alice).withdrawForeStake()
      );
      assertEvent<ForeWithdrawalEvent>(receipt, "ForeWithdrawal", {
        account: alice.address,
        amount: ethers.utils.parseEther("80"),
      });
    });

    it("should slash 19%", async () => {
      await governor
        .connect(alice)
        .stakeForeForVotes(ethers.utils.parseEther("100"), weeks(52));

      previousBlock = await ethers.provider.getBlock("latest");

      await timetravel(previousBlock.timestamp + weeks(51));
      const [, receipt] = await txExec(
        governor.connect(alice).withdrawForeStake()
      );
      assertEvent<ForeWithdrawalEvent>(receipt, "ForeWithdrawal", {
        account: alice.address,
        amount: ethers.utils.parseEther("81"),
      });
    });

    it("should slash 18%", async () => {
      await governor
        .connect(alice)
        .stakeForeForVotes(ethers.utils.parseEther("100"), weeks(26));

      previousBlock = await ethers.provider.getBlock("latest");

      await timetravel(previousBlock.timestamp + weeks(25));
      const [, receipt] = await txExec(
        governor.connect(alice).withdrawForeStake()
      );
      assertEvent<ForeWithdrawalEvent>(receipt, "ForeWithdrawal", {
        account: alice.address,
        amount: ethers.utils.parseEther("82"),
      });
    });

    it("should slash 17%", async () => {
      await governor
        .connect(alice)
        .stakeForeForVotes(ethers.utils.parseEther("100"), weeks(13));

      previousBlock = await ethers.provider.getBlock("latest");

      await timetravel(previousBlock.timestamp + weeks(12));
      const [, receipt] = await txExec(
        governor.connect(alice).withdrawForeStake()
      );
      assertEvent<ForeWithdrawalEvent>(receipt, "ForeWithdrawal", {
        account: alice.address,
        amount: ethers.utils.parseEther("83"),
      });
    });
  });

  describe("manage tiers", async () => {
    describe("successfully", async () => {
      let receipt: ContractReceipt;
      let previousBlock: Block;

      beforeEach(async () => {
        [, receipt] = await txExec(
          governor._manageTier(0, weeks(4), 1000, 1000)
        );
        previousBlock = await ethers.provider.getBlock("latest");
      });

      it("should emit event", async () => {
        assertEvent<ManagedTierEvent>(receipt, "ManagedTier", {
          tierIndex: 0,
          lockedWeeks: BigNumber.from(weeks(4)),
          slashPercentage: BigNumber.from(1000),
          votingPowerCoefficient: BigNumber.from(1000),
        });
      });

      it("should update storage", async () => {
        expect(await governor.getTier(0)).to.be.eql([
          BigNumber.from(weeks(4)),
          BigNumber.from(1000),
          BigNumber.from(1000),
        ]);
      });

      describe("withdraw stake with updated tier", async () => {
        beforeEach(async () => {
          await sendERC20Tokens(foreToken, {
            [alice.address]: MORE_THAN_QUORUM_VOTES,
          });
          await foreToken.connect(alice).approve(governor.address, UINT_MAX);

          await governor._setWhitelistAccountExpiration(
            alice.address,
            UINT_MAX
          );
        });

        it("should early withdraw and slash 10%", async () => {
          await governor
            .connect(alice)
            .stakeForeForVotes(ethers.utils.parseEther("100"), weeks(4));

          previousBlock = await ethers.provider.getBlock("latest");

          await timetravel(previousBlock.timestamp + weeks(3));
          const [, receipt] = await txExec(
            governor.connect(alice).withdrawForeStake()
          );
          assertEvent<ForeWithdrawalEvent>(receipt, "ForeWithdrawal", {
            account: alice.address,
            amount: ethers.utils.parseEther("90"),
          });
        });
      });

      describe("get votes", async () => {
        beforeEach(async () => {
          await txExec(governor._manageTier(0, weeks(4), 1000, 1000));
          await txExec(governor._manageTier(1, weeks(8), 1000, 2100));
          await txExec(governor._manageTier(2, weeks(12), 1000, 4500));
          await txExec(governor._manageTier(3, weeks(16), 1000, 10000));

          previousBlock = await ethers.provider.getBlock("latest");
        });

        it("initial votes for more than 16 weeks stake", async () => {
          await governor.stakeForeForVotes(
            ethers.utils.parseEther("100"),
            weeks(17)
          );
          expect(await governor.getVotes(defaultAdmin.address)).to.equal(
            ethers.utils.parseEther("100")
          );
        });

        it("initial votes for more than 12 weeks stake", async () => {
          await governor.stakeForeForVotes(
            ethers.utils.parseEther("100"),
            weeks(13)
          );
          expect(await governor.getVotes(defaultAdmin.address)).to.equal(
            ethers.utils.parseEther("45")
          );
        });

        it("initial votes for more than 8 weeks stake", async () => {
          await governor.stakeForeForVotes(
            ethers.utils.parseEther("100"),
            weeks(9)
          );
          expect(await governor.getVotes(defaultAdmin.address)).to.equal(
            ethers.utils.parseEther("21")
          );
        });

        it("initial votes for more than 4 weeks stake", async () => {
          await governor.stakeForeForVotes(
            ethers.utils.parseEther("100"),
            weeks(5)
          );
          expect(await governor.getVotes(defaultAdmin.address)).to.equal(
            ethers.utils.parseEther("10")
          );
        });
      });

      describe("with updated voting power coefficient", async () => {
        beforeEach(async () => {
          await txExec(governor._manageTier(0, weeks(4), 1000, 500));
          await txExec(governor._manageTier(1, weeks(8), 1000, 1000));
          await txExec(governor._manageTier(2, weeks(12), 1000, 1500));
          await txExec(governor._manageTier(3, weeks(16), 1000, 2000));

          previousBlock = await ethers.provider.getBlock("latest");
        });

        it("initial votes for more than 16 weeks stake", async () => {
          await governor.stakeForeForVotes(
            ethers.utils.parseEther("100"),
            weeks(17)
          );
          expect(await governor.getVotes(defaultAdmin.address)).to.equal(
            ethers.utils.parseEther("20")
          );
        });

        it("initial votes for more than 12 weeks stake", async () => {
          await governor.stakeForeForVotes(
            ethers.utils.parseEther("100"),
            weeks(13)
          );
          expect(await governor.getVotes(defaultAdmin.address)).to.equal(
            ethers.utils.parseEther("15")
          );
        });

        it("initial votes for more than 8 weeks stake", async () => {
          await governor.stakeForeForVotes(
            ethers.utils.parseEther("100"),
            weeks(9)
          );
          expect(await governor.getVotes(defaultAdmin.address)).to.equal(
            ethers.utils.parseEther("10")
          );
        });

        it("initial votes for more than 4 weeks stake", async () => {
          await governor.stakeForeForVotes(
            ethers.utils.parseEther("100"),
            weeks(5)
          );
          expect(await governor.getVotes(defaultAdmin.address)).to.equal(
            ethers.utils.parseEther("5")
          );
        });
      });

      describe("with invalid parameters", async () => {
        it("should revert admin only", async () => {
          await expect(
            governor.connect(alice)._manageTier(0, weeks(4), 1700, 1000)
          ).to.be.revertedWith("Governor::_manageTier: admin only");
        });

        it("should revert invalid index", async () => {
          await expect(
            governor._manageTier(5, weeks(4), 1700, 1000)
          ).to.be.revertedWith("Governor::_manageTier: invalid tier index");
        });

        it("should revert lockedWeeks must be greater than 0", async () => {
          await expect(
            governor._manageTier(0, 0, 1700, 1000)
          ).to.be.revertedWith(
            "Governor::_manageTier: lockedWeeks must be greater than 0"
          );
        });

        it("should revert slashPercentage must be greater than 0", async () => {
          await expect(
            governor._manageTier(0, weeks(4), 0, 1000)
          ).to.be.revertedWith(
            "Governor::_manageTier: slashPercentage must be greater than 0"
          );
        });

        it("should revert votingPowerCoefficient must be greater than 0", async () => {
          await expect(
            governor._manageTier(0, weeks(4), 1700, 0)
          ).to.be.revertedWith(
            "Governor::_manageTier: votingPowerCoefficient must be greater than 0"
          );
        });

        it("should revert last tier lockedWeeks must be less than the next tier", async () => {
          await expect(
            governor._manageTier(0, weeks(27), 1700, 1000)
          ).to.be.revertedWith(
            "Governor::_manageTier: last tier lockedWeeks must be less than the next tier"
          );
        });

        it("should revert last tier lockedWeeks must be greater than the previous tier", async () => {
          await expect(
            governor._manageTier(3, weeks(51), 1700, 1000)
          ).to.be.revertedWith(
            "Governor::_manageTier: last tier lockedWeeks must be greater than the previous tier"
          );
        });

        it("should revert last tier lockedWeeks must be greater than the previous tier", async () => {
          await expect(
            governor._manageTier(2, weeks(25), 1700, 1000)
          ).to.be.revertedWith(
            "Governor::_manageTier: last tier lockedWeeks must be greater than the previous tier"
          );
        });

        it("should revert last tier lockedWeeks must be less than the next tier", async () => {
          await expect(
            governor._manageTier(1, weeks(53), 1700, 1000)
          ).to.be.revertedWith(
            "Governor::_manageTier: last tier lockedWeeks must be less than the next tier"
          );
        });
      });
    });
  });

  it("getActions", async () => {
    await sendERC20Tokens(foreToken, {
      [alice.address]: MORE_THAN_QUORUM_VOTES,
    });
    await foreToken.connect(alice).approve(governor.address, UINT_MAX);

    await governor
      .connect(alice)
      .stakeForeForVotes(MORE_THAN_QUORUM_VOTES, weeks(104));

    await governor
      .connect(alice)
      .propose(
        [protocolConfig.address],
        [0],
        ["setFoundationWallet(address)"],
        [encodeParameters(["address"], [foundationWallet.address])],
        "test proposal 1",
        "description 1"
      );

    const actions = await governor.getActions(1);
    const targets = actions[0];
    const values = actions[1];
    const signatures = actions[2];
    const callData = actions[3];

    expect(targets).to.have.members([protocolConfig.address]);
    expect(values.map((t) => t.toString())).to.have.members(["0"]);
    expect(signatures).to.have.members(["setFoundationWallet(address)"]);
    expect(callData).to.have.members([
      encodeParameters(["address"], [foundationWallet.address]),
    ]);
  });

  it("getReceipt", async () => {
    await createProposal();
    await stakeAndVote(alice, MORE_THAN_QUORUM_VOTES);

    const receipt = await governor.getReceipt(1, alice.address);
    expect(receipt.hasVoted).to.equal(true);
    expect(receipt.support).to.equal(VoteType.VOTE_FOR);
    expect(receipt.votes).to.equal(MORE_THAN_QUORUM_VOTES);
  });

  it("execute simple proposal", async () => {
    let receipt: ContractReceipt;

    await sendERC20Tokens(foreToken, {
      [alice.address]: MORE_THAN_QUORUM_VOTES,
    });
    await foreToken.connect(alice).approve(governor.address, UINT_MAX);

    await governor
      .connect(alice)
      .stakeForeForVotes(MORE_THAN_QUORUM_VOTES, weeks(104));

    [, receipt] = await txExec(
      governor
        .connect(alice)
        .propose(
          [protocolConfig.address],
          [0],
          ["setFoundationWallet(address)"],
          [encodeParameters(["address"], [foundationWallet.address])],
          "test proposal 1",
          "description 1"
        )
    );

    assertEvent<ProposalCreatedEvent>(receipt, "ProposalCreated", {
      id: BigNumber.from(1),
    });

    let previousBlock = await ethers.provider.getBlock("latest");
    previousBlock = await timetravel(
      previousBlock.timestamp + VOTING_DELAY + 1
    );

    [, receipt] = await txExec(
      governor.connect(alice).castVote(1, VoteType.VOTE_FOR)
    );

    assertEvent<VoteCastEvent>(receipt, "VoteCast");

    previousBlock = await timetravel(previousBlock.timestamp + VOTING_PERIOD);

    [, receipt] = await txExec(governor.queue(1));

    assertEvent<ProposalQueuedEvent>(receipt, "ProposalQueued");

    await timetravel(previousBlock.timestamp + TIME_LOCK_DELAY + 100);

    [, receipt] = await txExec(governor.execute(1));

    assertEvent<ProposalExecutedEvent>(receipt, "ProposalExecuted");

    // await expectEventInLogs(
    //   executeTx,
    //   "ComptrollerNFTCommonImpl",
    //   "NewBorrowCap"
    // );
  });

  it("can be queued by the moderator only", async () => {
    let [, receipt] = await txExec(
      governor.propose(
        [protocolConfig.address],
        [0],
        ["setFoundationWallet(address)"],
        [encodeParameters(["address"], [foundationWallet.address])],
        "test proposal 1",
        "description 1"
      )
    );

    assertEvent<ProposalCreatedEvent>(receipt, "ProposalCreated", {
      id: BigNumber.from(1),
    });

    await sendERC20Tokens(foreToken, {
      [alice.address]: MORE_THAN_QUORUM_VOTES,
    });
    await foreToken.connect(alice).approve(governor.address, UINT_MAX);

    await governor
      .connect(alice)
      .stakeForeForVotes(MORE_THAN_QUORUM_VOTES, weeks(104));

    let previousBlock = await ethers.provider.getBlock("latest");
    previousBlock = await timetravel(
      previousBlock.timestamp + VOTING_DELAY + 1
    );

    governor.connect(alice).castVote(1, VoteType.VOTE_FOR);

    [, receipt] = await txExec(governor._setModerator(bob.address));
    assertEvent<ModeratorSetEvent>(receipt, "ModeratorSet", {
      newModerator: bob.address,
      oldModerator: ZERO_ADDRESS,
    });

    previousBlock = await timetravel(
      previousBlock.timestamp + VOTING_DELAY + 1
    );
    await timetravel(previousBlock.timestamp + VOTING_PERIOD);

    await expect(governor.queue(1)).to.be.revertedWith(
      "Governor::queue: moderator only"
    );

    [, receipt] = await txExec(governor.connect(bob).queue(1));

    assertEvent<ProposalQueuedEvent>(receipt, "ProposalQueued");
  });

  it("contract upgrade process", async () => {
    const NewGovernorDelegate = await ethers.getContractFactory(
      "GovernorDelegateV2Mock"
    );
    const newGovernorDelegate = await NewGovernorDelegate.deploy();

    const governorDelegator = await ethers.getContractAt(
      "GovernorDelegator",
      governor.address
    ); // abi fix

    let [, receipt] = await txExec(
      governorDelegator._setImplementation(newGovernorDelegate.address)
    );
    assertEvent<NewImplementationEvent>(receipt, "NewImplementation");

    const newGovernor = await ethers.getContractAt(
      "GovernorDelegateV2Mock",
      governor.address
    ); // abi fix

    await newGovernor.setFoo(42);
    expect(await newGovernor.getFoo()).to.equal(42);
    expect(await newGovernor.implementation()).to.equal(
      newGovernorDelegate.address
    );
  });

  it("emits proper events", async () => {
    let [, receipt] = await txExec(governor._setVotingDelay(VOTING_DELAY + 1));
    assertEvent<VotingDelaySetEvent>(receipt, "VotingDelaySet", {
      oldVotingDelay: BigNumber.from(VOTING_DELAY),
      newVotingDelay: BigNumber.from(VOTING_DELAY + 1),
    });

    [, receipt] = await txExec(governor._setVotingPeriod(VOTING_PERIOD + 1));
    assertEvent<VotingPeriodSetEvent>(receipt, "VotingPeriodSet", {
      oldVotingPeriod: BigNumber.from(VOTING_PERIOD),
      newVotingPeriod: BigNumber.from(VOTING_PERIOD + 1),
    });

    [, receipt] = await txExec(
      governor._setProposalThreshold(PROPOSAL_THRESHOLD + 1)
    );
    assertEvent<ProposalThresholdSetEvent>(receipt, "ProposalThresholdSet", {
      oldProposalThreshold: BigNumber.from(PROPOSAL_THRESHOLD),
      newProposalThreshold: BigNumber.from(PROPOSAL_THRESHOLD + 1),
    });

    [, receipt] = await txExec(governor._setWhitelistGuardian(alice.address));
    assertEvent<WhitelistGuardianSetEvent>(receipt, "WhitelistGuardianSet", {
      oldGuardian: ZERO_ADDRESS,
      newGuardian: alice.address,
    });

    [, receipt] = await txExec(
      governor
        .connect(alice)
        ._setWhitelistAccountExpiration(bob.address, UINT_MAX)
    );
    assertEvent<WhitelistAccountExpirationSetEvent>(
      receipt,
      "WhitelistAccountExpirationSet",
      {
        account: bob.address,
        expiration: BigNumber.from(UINT_MAX),
      }
    );
  });

  it("validations and checks", async () => {
    await expect(governor.state("200000000")).to.be.revertedWith(
      "Governor::state: invalid proposal id"
    );
    await expect(
      governor.initialize(defaultAdmin.address, defaultAdmin.address, 1, 1, 1)
    ).to.be.revertedWith("Governor::initialize: can only initialize once");
    await expect(
      governor.stakeForeForVotes(ethers.utils.parseEther("100"), "200000000")
    ).to.be.revertedWith("Governor::getNewStakeData: invalid argument");
    await expect(
      governor
        .connect(bob)
        .propose(
          [protocolConfig.address],
          [0],
          ["setFoundationWallet(address)"],
          [encodeParameters(["address"], [foundationWallet.address])],
          "test proposal 1",
          "description 1"
        )
    ).to.be.revertedWith(
      "Governor::propose: proposer votes below proposal threshold"
    );
    await expect(
      governor.connect(alice)._setProposalThreshold(0)
    ).to.be.revertedWith("Governor::_setProposalThreshold: admin only");
    await expect(
      governor.connect(alice)._setWhitelistAccountExpiration(ZERO_ADDRESS, 0)
    ).to.be.revertedWith(
      "Governor::_setWhitelistAccountExpiration: admin only"
    );
    await expect(
      governor.connect(alice)._setWhitelistGuardian(ZERO_ADDRESS)
    ).to.be.revertedWith("Governor::_setWhitelistGuardian: admin only");
    await expect(governor.connect(alice)._initiate()).to.be.revertedWith(
      "Governor::_initiate: admin only"
    );
    await expect(
      governor.connect(alice)._setModerator(ZERO_ADDRESS)
    ).to.be.revertedWith("Governor::_setModerator: admin only");
    await expect(governor.connect(alice)._setVotingDelay(0)).to.be.revertedWith(
      "Governor::_setVotingDelay: admin only"
    );
    await expect(governor._setVotingDelay(0)).to.be.revertedWith(
      "Governor::_setVotingDelay: invalid voting delay"
    );
    await expect(
      governor._setVotingDelay("99999999999999999999")
    ).to.be.revertedWith("Governor::_setVotingDelay: invalid voting delay");
    await expect(
      governor.connect(alice)._setVotingPeriod(0)
    ).to.be.revertedWith("Governor::_setVotingPeriod: admin only");
    await expect(governor._setVotingPeriod(0)).to.be.revertedWith(
      "Governor::_setVotingPeriod: invalid voting period"
    );
    await expect(
      governor._setVotingPeriod("99999999999999999999")
    ).to.be.revertedWith("Governor::_setVotingPeriod: invalid voting period");
    await expect(governor._setProposalThreshold(0)).to.be.revertedWith(
      "Governor::_setProposalThreshold: invalid proposal threshold"
    );
    await expect(
      governor._setProposalThreshold("999999999999999999999999999999999")
    ).to.be.revertedWith(
      "Governor::_setProposalThreshold: invalid proposal threshold"
    );
    await governor._setWhitelistAccountExpiration(
      defaultAdmin.address,
      UINT_MAX
    );
    await expect(
      governor.propose(
        [protocolConfig.address],
        [0, 0],
        ["setFoundationWallet(address)"],
        [encodeParameters(["address"], [foundationWallet.address])],
        "test proposal 1",
        "description 1"
      )
    ).to.be.revertedWith(
      "Governor::propose: proposal function information arity mismatch"
    );
    await expect(
      governor.propose([], [], [], [], "test", "description")
    ).to.be.revertedWith("Governor::propose: must provide actions");
  });
});
