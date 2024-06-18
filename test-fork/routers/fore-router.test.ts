/* eslint-disable camelcase */
import { ethers, expect, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ForeToken } from "@/ForeToken";
import { ForeProtocol } from "@/ForeProtocol";
import { MarketLib } from "@/MarketLib";
import { BasicMarket } from "@/BasicMarket";
import { MockERC20 } from "@/MockERC20";
import { BasicMarket__factory } from "@/index";

import {
  deployContract,
  deployLibrary,
  deployMockedContractAs,
  impersonateContract,
  toDeadline,
  txExec,
} from "../../helpers/utils";
import {
  MaxAllowanceTransferAmount,
  PERMIT_TYPES,
  foreProtocolAddress,
  foreTokenAddress,
  permit2Address,
  tokenHolderAddress,
} from "../../helpers/constants";

interface PermitSingle {
  details: {
    token: string;
    amount: BigNumber;
    expiration: number;
    nonce: number;
  };
  spender: string;
  sigDeadline: number;
}

const marketsAddresses = [
  "0x825B1599d5839707Df1c84203F69D16F9130FB67",
  "0x0E67C264bADa2Cd265543bf77ea404b9D0e6ca4A",
  "0x22D3301ee79bCa56336926792C0000bb538ED7fE",
];

describe("Fork / Fore Universal Router / Basic Market", () => {
  let [, alice, usdcHolder]: SignerWithAddress[] = [];

  let foreToken: ForeToken;
  let foreProtocol: ForeProtocol;
  let contract: Contract;
  let usdcToken: MockERC20;

  let MarketFactory: BasicMarket__factory;

  const markets: (BasicMarket | null)[] = new Array(3).fill(null);

  before(async () => {
    await ethers.provider.send("hardhat_reset", [
      {
        forking: {
          jsonRpcUrl: process.env.ARBITRUM_MAINNET_URL,
          ...(process.env?.FORK_BLOCK_NUMBER && {
            blockNumber: Number(process.env.FORK_BLOCK_NUMBER),
          }),
        },
      },
    ]);
  });

  beforeEach(async () => {
    [, alice, usdcHolder] = await ethers.getSigners();

    foreProtocol = (await ethers.getContractFactory("ForeProtocol")).attach(
      foreProtocolAddress
    );

    usdcToken = await deployMockedContractAs<MockERC20>(
      usdcHolder,
      "MockERC20",
      "USDC",
      "USD Coin",
      ethers.utils.parseEther("1000000")
    );

    foreToken = (await ethers.getContractFactory("ForeToken")).attach(
      foreTokenAddress
    );

    // preparing universal contract
    const routerFactory = await ethers.getContractFactory(
      "ForeUniversalRouter"
    );
    contract = await upgrades.deployProxy(routerFactory, [
      foreProtocol.address,
      permit2Address,
      [foreToken.address, usdcToken.address],
    ]);

    // Impersonate token holder
    const impersonatedTokenHolder = await impersonateContract(
      tokenHolderAddress
    );

    // deploy library
    const marketlib = await deployLibrary("MarketLib", [
      "BasicMarket",
      "BasicFactory",
    ]);

    MarketFactory = await ethers.getContractFactory("BasicMarket", {
      libraries: {
        MarketLib: marketlib.address,
      },
    });

    // Attach mainnet markets
    const marketLib = await deployContract<MarketLib>("MarketLib");

    for (const [i, address] of marketsAddresses.entries()) {
      markets[i] = (
        await ethers.getContractFactory("BasicMarket", {
          libraries: {
            MarketLib: marketLib.address,
          },
        })
      ).attach(address);
    }

    // Send fore token to alice
    await foreToken
      .connect(impersonatedTokenHolder)
      .transfer(alice.address, ethers.utils.parseEther("1000"));

    // Approve permit2 contract (one time approval)
    await txExec(
      foreToken
        .connect(alice)
        .approve(permit2Address, ethers.utils.parseEther("1000"))
    );
  });

  describe("Initial state", () => {
    it("Should return proper contract states", async () => {
      expect(await contract.foreProtocol()).to.be.eq(foreProtocolAddress);
      expect(await contract.permit2()).to.be.eq(permit2Address);
    });

    it("Should return proper state of fore protocol", async () => {
      expect(await foreProtocol.name()).to.be.eq("Fore Markets");
    });

    it("Should return proper state of fore token", async () => {
      expect(await foreToken.name()).to.be.eq("FORE Protocol");
    });
  });

  describe("permit2", () => {
    let permitSingle: PermitSingle;
    let signature: string;

    beforeEach(async () => {
      permitSingle = {
        details: {
          token: foreToken.address,
          amount: MaxAllowanceTransferAmount,
          expiration: toDeadline(1000 * 60 * 60 * 24 * 30), // 30 days
          nonce: 0,
        },
        spender: contract.address,
        sigDeadline: toDeadline(1000 * 60 * 60 * 30), // 30 minutes
      };

      const domain = {
        name: "Permit2",
        chainId: 31337,
        verifyingContract: permit2Address,
      };

      signature = await alice._signTypedData(
        domain,
        PERMIT_TYPES,
        permitSingle
      );
    });

    describe("predict", () => {
      describe("successfully", () => {
        beforeEach(async () => {
          await txExec(contract.connect(alice).permit(permitSingle, signature));
        });

        it("should predict market", async () => {
          const data = MarketFactory.interface.encodeFunctionData("predict", [
            ethers.utils.parseEther("2"),
            true,
          ]);

          await txExec(
            contract
              .connect(alice)
              .callFunction(
                markets[0].address,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          );
        });

        it("should predict multiple markets", async () => {
          const data = MarketFactory.interface.encodeFunctionData("predict", [
            ethers.utils.parseEther("2"),
            true,
          ]);

          await txExec(
            contract
              .connect(alice)
              .callFunction(
                markets[0].address,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          );
          await txExec(
            contract
              .connect(alice)
              .callFunction(
                markets[1].address,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          );
          await txExec(
            contract
              .connect(alice)
              .callFunction(
                markets[2].address,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          );
        });
      });
    });
  });
});
