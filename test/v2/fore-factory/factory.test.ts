import { ForeProtocol } from "@/ForeProtocol";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract, ContractTransaction } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  assertEvent,
  attachContract,
  deployContract,
  deployLibrary,
  deployMockedContract,
  txExec,
} from "../../helpers/utils";
import {
  BasicFactoryV2,
  SetFoundationFlatFeeRateEvent,
  SetMarketCreatorFlatFeeRateEvent,
  SetPredictionFlatFeeRateEvent,
  SetVerificationFlatFeeRateEvent,
} from "@/BasicFactoryV2";
import { ERC20 } from "@/ERC20";
import { ForeAccessManager } from "@/ForeAccessManager";
import { defaultIncentives } from "../../helpers/constants";
import { PausedEvent, UnpausedEvent } from "@/Pausable";
import { BasicMarketV2 } from "@/BasicMarketV2";

describe("BasicFactoryV2", () => {
  let owner: SignerWithAddress;
  let foundationWallet: SignerWithAddress;
  let highGuardAccount: SignerWithAddress;
  let marketplaceContract: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let defaultAdmin: SignerWithAddress;
  let sentinelWallet: SignerWithAddress;

  let protocolConfig: ProtocolConfig;
  let foreToken: MockContract<ForeToken>;
  let foreVerifiers: MockContract<ForeVerifiers>;
  let protocol: ForeProtocol;
  let contract: BasicFactoryV2;
  let tokenRegistry: Contract;
  let accountWhitelist: Contract;
  let usdcToken: MockContract<ERC20>;
  let foreAccessManager: MockContract<ForeAccessManager>;

  beforeEach(async () => {
    [
      owner,
      foundationWallet,
      highGuardAccount,
      marketplaceContract,
      alice,
      bob,
      defaultAdmin,
      sentinelWallet,
    ] = await ethers.getSigners();

    foreToken = await deployMockedContract<ForeToken>("ForeToken");
    foreVerifiers = await deployMockedContract<ForeVerifiers>(
      "ForeVerifiers",
      "https://markets.api.foreprotocol.io/verifiers/"
    );

    protocolConfig = await deployContract<ProtocolConfig>(
      "ProtocolConfig",
      foundationWallet.address,
      highGuardAccount.address,
      marketplaceContract.address,
      foreToken.address,
      foreVerifiers.address,
      ethers.utils.parseEther("10"),
      ethers.utils.parseEther("20")
    );

    await deployLibrary("MarketLibV2", ["BasicMarketV2", "BasicFactoryV2"]);

    protocol = await deployContract<ForeProtocol>(
      "ForeProtocol",
      protocolConfig.address,
      "https://markets.api.foreprotocol.io/market/"
    );

    usdcToken = await deployMockedContract<ERC20>(
      "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
      "USDC",
      "USD Coin"
    );

    // setup the access manager
    // preparing fore protocol
    foreAccessManager = await deployMockedContract<ForeAccessManager>(
      "ForeAccessManager",
      defaultAdmin.address
    );

    // preparing token registry
    const tokenRegistryFactory = await ethers.getContractFactory(
      "TokenIncentiveRegistry"
    );
    tokenRegistry = await upgrades.deployProxy(tokenRegistryFactory, [
      foreAccessManager.address,
      [usdcToken.address, foreToken.address],
      [defaultIncentives, defaultIncentives],
    ]);

    // preparing account whitelist
    const accountWhitelistFactory = await ethers.getContractFactory(
      "AccountWhitelist"
    );
    accountWhitelist = await upgrades.deployProxy(accountWhitelistFactory, [
      foreAccessManager.address,
      [defaultAdmin.address],
    ]);

    contract = await deployContract<BasicFactoryV2>(
      "BasicFactoryV2",
      foreAccessManager.address,
      protocol.address,
      tokenRegistry.address,
      accountWhitelist.address,
      foundationWallet.address
    );

    await txExec(foreVerifiers.setProtocol(protocol.address));

    await txExec(
      foreToken
        .connect(owner)
        .transfer(bob.address, ethers.utils.parseEther("1000"))
    );

    await txExec(
      protocolConfig.connect(owner).setFactoryStatus([contract.address], [true])
    );

    // allowance
    await txExec(
      foreToken
        .connect(alice)
        .approve(protocol.address, ethers.utils.parseUnits("1000", "ether"))
    );
    await txExec(
      foreToken
        .connect(bob)
        .approve(protocol.address, ethers.utils.parseUnits("1000", "ether"))
    );

    await txExec(
      foreToken
        .connect(alice)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether"))
    );
    await txExec(
      foreToken
        .connect(bob)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether"))
    );
  });

  describe("Access control", () => {
    describe("No permissions granted, default permissions", () => {
      describe("Default Admin Wallet", () => {
        it("Should allow to use pause", async () => {
          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).pause()
          );

          assertEvent<PausedEvent>(receipt, "Paused");
        });

        it("Should allow to use unpause", async () => {
          // Enable the pause function to test unpause
          await contract.connect(defaultAdmin).pause();

          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).unpause()
          );

          assertEvent<UnpausedEvent>(receipt, "Unpaused");
        });

        it("Should allow to set prediction fee", async () => {
          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).setPredictionFlatFeeRate(150)
          );

          assertEvent<SetPredictionFlatFeeRateEvent>(
            receipt,
            "SetPredictionFlatFeeRate",
            {
              feeRate: 150,
            }
          );
        });

        it("Should allow to set market creator fee", async () => {
          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).setMarketCreatorFlatFeeRate(150)
          );

          assertEvent<SetMarketCreatorFlatFeeRateEvent>(
            receipt,
            "SetMarketCreatorFlatFeeRate",
            {
              feeRate: 150,
            }
          );
        });

        it("Should allow to set verification fee", async () => {
          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).setVerificationFlatFeeRate(150)
          );

          assertEvent<SetVerificationFlatFeeRateEvent>(
            receipt,
            "SetVerificationFlatFeeRate",
            {
              feeRate: 150,
            }
          );
        });

        it("Should allow to set foundation fee", async () => {
          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).setFoundationFlatFeeRate(150)
          );

          assertEvent<SetFoundationFlatFeeRateEvent>(
            receipt,
            "SetFoundationFlatFeeRate",
            {
              feeRate: 150,
            }
          );
        });
      });

      describe("Deployer Wallet", () => {
        let deployerUnauthorizedMessage: string;

        beforeEach(async () => {
          deployerUnauthorizedMessage = `AccessManagedUnauthorized("${owner.address}")`;
        });

        it("Should revert on pause", async () => {
          await expect(contract.pause()).to.be.revertedWith(
            deployerUnauthorizedMessage
          );
        });

        it("Should revert on unpause", async () => {
          // Enable the pause function to test unpause
          await contract.connect(defaultAdmin).pause();

          await expect(contract.unpause()).to.be.revertedWith(
            deployerUnauthorizedMessage
          );
        });

        it("Should revert on set prediction fee", async () => {
          await expect(
            contract.setPredictionFlatFeeRate(150)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });

        it("Should revert on set market creator fee", async () => {
          await expect(
            contract.setMarketCreatorFlatFeeRate(150)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });

        it("Should revert on set verification fee", async () => {
          await expect(
            contract.setVerificationFlatFeeRate(150)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });

        it("Should revert on set foundation fee", async () => {
          await expect(
            contract.setFoundationFlatFeeRate(150)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });
      });

      describe("Sentinel Wallet", () => {
        let sentinelUnauthorizedMessage: string;

        beforeEach(async () => {
          sentinelUnauthorizedMessage = `AccessManagedUnauthorized("${sentinelWallet.address}")`;
        });

        it("Should revert on pause", async () => {
          await expect(
            contract.connect(sentinelWallet).pause()
          ).to.be.revertedWith(sentinelUnauthorizedMessage);
        });

        it("Should revert on unpause", async () => {
          // Enable the pause function to test unpause
          await contract.connect(defaultAdmin).pause();

          await expect(
            contract.connect(sentinelWallet).unpause()
          ).to.be.revertedWith(sentinelUnauthorizedMessage);
        });

        it("Should revert on set prediction fee", async () => {
          await expect(
            contract.connect(sentinelWallet).setPredictionFlatFeeRate(150)
          ).to.be.revertedWith(sentinelUnauthorizedMessage);
        });

        it("Should revert on set market creator fee", async () => {
          await expect(
            contract.connect(sentinelWallet).setMarketCreatorFlatFeeRate(150)
          ).to.be.revertedWith(sentinelUnauthorizedMessage);
        });

        it("Should revert on set verification fee", async () => {
          await expect(
            contract.connect(sentinelWallet).setVerificationFlatFeeRate(150)
          ).to.be.revertedWith(sentinelUnauthorizedMessage);
        });

        it("Should revert on set foundation fee", async () => {
          await expect(
            contract.connect(sentinelWallet).setFoundationFlatFeeRate(150)
          ).to.be.revertedWith(sentinelUnauthorizedMessage);
        });
      });

      describe("Foundation Wallet", () => {
        let foundationUnauthorizedMessage: string;

        beforeEach(async () => {
          foundationUnauthorizedMessage = `AccessManagedUnauthorized("${foundationWallet.address}")`;
        });

        it("Should revert on pause", async () => {
          await expect(
            contract.connect(foundationWallet).pause()
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on unpause", async () => {
          // Enable the pause function to test unpause
          await contract.connect(defaultAdmin).pause();

          await expect(
            contract.connect(foundationWallet).unpause()
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on set prediction fee", async () => {
          await expect(
            contract.connect(foundationWallet).setPredictionFlatFeeRate(150)
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on set market creator fee", async () => {
          await expect(
            contract.connect(foundationWallet).setMarketCreatorFlatFeeRate(150)
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on set verification fee", async () => {
          await expect(
            contract.connect(foundationWallet).setVerificationFlatFeeRate(150)
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on set foundation fee", async () => {
          await expect(
            contract.connect(foundationWallet).setFoundationFlatFeeRate(150)
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });
      });
    });

    describe("Custom permissions granted, no default permissions", () => {
      // 0 is reserver for the admin role
      const FOUNDATION_ROLE = 1n;
      const SENTINEL_ROLE = 2n;

      beforeEach(async () => {
        await foreAccessManager
          .connect(defaultAdmin)
          .grantRole(FOUNDATION_ROLE, foundationWallet.address, 0);

        await foreAccessManager
          .connect(defaultAdmin)
          .grantRole(SENTINEL_ROLE, sentinelWallet.address, 0);

        // Functions that can only be called by the sentinel
        await foreAccessManager
          .connect(defaultAdmin)
          .setTargetFunctionRole(
            contract.address,
            [
              contract.interface.getSighash("pause"),
              contract.interface.getSighash("unpause"),
            ],
            SENTINEL_ROLE
          );

        // Functions that can only be called by the foundation multisign
        await foreAccessManager
          .connect(defaultAdmin)
          .setTargetFunctionRole(
            contract.address,
            [
              contract.interface.getSighash("setPredictionFlatFeeRate"),
              contract.interface.getSighash("setMarketCreatorFlatFeeRate"),
              contract.interface.getSighash("setVerificationFlatFeeRate"),
              contract.interface.getSighash("setFoundationFlatFeeRate"),
            ],
            FOUNDATION_ROLE
          );
      });

      describe("Default Admin Wallet", () => {
        let defaultAdminUnauthorizedMessage: string;

        beforeEach(async () => {
          defaultAdminUnauthorizedMessage = `AccessManagedUnauthorized("${defaultAdmin.address}")`;
        });

        it("Should revert on pause", async () => {
          await expect(
            contract.connect(defaultAdmin).pause()
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });

        it("Should revert on unpause", async () => {
          // Enable the pause function to test unpause
          await contract.connect(sentinelWallet).pause();

          await expect(
            contract.connect(defaultAdmin).unpause()
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });

        it("Should revert on set prediction fee", async () => {
          await expect(
            contract.connect(defaultAdmin).setPredictionFlatFeeRate(150)
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });

        it("Should revert on set market creator fee", async () => {
          await expect(
            contract.connect(defaultAdmin).setMarketCreatorFlatFeeRate(150)
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });

        it("Should revert on set verification fee", async () => {
          await expect(
            contract.connect(defaultAdmin).setVerificationFlatFeeRate(150)
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });

        it("Should revert on set foundation fee", async () => {
          await expect(
            contract.connect(defaultAdmin).setFoundationFlatFeeRate(150)
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });
      });

      describe("Deployer Wallet", () => {
        let deployerUnauthorizedMessage: string;

        beforeEach(async () => {
          deployerUnauthorizedMessage = `AccessManagedUnauthorized("${owner.address}")`;
        });

        it("Should revert on pause", async () => {
          await expect(contract.pause()).to.be.revertedWith(
            deployerUnauthorizedMessage
          );
        });

        it("Should revert on unpause", async () => {
          // Enable the pause function to test unpause
          await contract.connect(sentinelWallet).pause();

          await expect(contract.unpause()).to.be.revertedWith(
            deployerUnauthorizedMessage
          );
        });

        it("Should revert on set prediction fee", async () => {
          await expect(
            contract.setPredictionFlatFeeRate(150)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });

        it("Should revert on set market creator fee", async () => {
          await expect(
            contract.setMarketCreatorFlatFeeRate(150)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });

        it("Should revert on set verification fee", async () => {
          await expect(
            contract.setVerificationFlatFeeRate(150)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });

        it("Should revert on set foundation fee", async () => {
          await expect(
            contract.setFoundationFlatFeeRate(150)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });
      });

      describe("Sentinel Wallet", () => {
        let sentinelUnauthorizedMessage: string;

        beforeEach(async () => {
          sentinelUnauthorizedMessage = `AccessManagedUnauthorized("${sentinelWallet.address}")`;
        });

        it("Should allow to use pause", async () => {
          const [, receipt] = await txExec(
            contract.connect(sentinelWallet).pause()
          );

          assertEvent<PausedEvent>(receipt, "Paused");
        });

        it("Should allow to use unpause", async () => {
          // Enable the pause function to test unpause
          await txExec(contract.connect(sentinelWallet).pause());

          const [, receipt] = await txExec(
            contract.connect(sentinelWallet).unpause()
          );

          assertEvent<UnpausedEvent>(receipt, "Unpaused");
        });

        it("Should revert on set prediction fee", async () => {
          await expect(
            contract.connect(sentinelWallet).setPredictionFlatFeeRate(150)
          ).to.be.revertedWith(sentinelUnauthorizedMessage);
        });

        it("Should revert on set market creator fee", async () => {
          await expect(
            contract.connect(sentinelWallet).setMarketCreatorFlatFeeRate(150)
          ).to.be.revertedWith(sentinelUnauthorizedMessage);
        });

        it("Should revert on set verification fee", async () => {
          await expect(
            contract.connect(sentinelWallet).setVerificationFlatFeeRate(150)
          ).to.be.revertedWith(sentinelUnauthorizedMessage);
        });

        it("Should revert on set foundation fee", async () => {
          await expect(
            contract.connect(sentinelWallet).setFoundationFlatFeeRate(150)
          ).to.be.revertedWith(sentinelUnauthorizedMessage);
        });
      });

      describe("Foundation Wallet", () => {
        let foundationUnauthorizedMessage: string;

        beforeEach(async () => {
          foundationUnauthorizedMessage = `AccessManagedUnauthorized("${foundationWallet.address}")`;
        });

        it("Should revert on pause", async () => {
          await expect(
            contract.connect(foundationWallet).pause()
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on unpause", async () => {
          // Enable the pause function to test unpause
          await contract.connect(sentinelWallet).pause();

          await expect(
            contract.connect(foundationWallet).unpause()
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should allow to set prediction fee", async () => {
          const [, receipt] = await txExec(
            contract.connect(foundationWallet).setPredictionFlatFeeRate(150)
          );

          assertEvent<SetPredictionFlatFeeRateEvent>(
            receipt,
            "SetPredictionFlatFeeRate",
            {
              feeRate: 150,
            }
          );
        });

        it("Should allow to set market creator fee", async () => {
          const [, receipt] = await txExec(
            contract.connect(foundationWallet).setMarketCreatorFlatFeeRate(150)
          );

          assertEvent<SetMarketCreatorFlatFeeRateEvent>(
            receipt,
            "SetMarketCreatorFlatFeeRate",
            {
              feeRate: 150,
            }
          );
        });

        it("Should allow to set verification fee", async () => {
          const [, receipt] = await txExec(
            contract.connect(foundationWallet).setVerificationFlatFeeRate(150)
          );

          assertEvent<SetVerificationFlatFeeRateEvent>(
            receipt,
            "SetVerificationFlatFeeRate",
            {
              feeRate: 150,
            }
          );
        });

        it("Should allow to set foundation fee", async () => {
          const [, receipt] = await txExec(
            contract.connect(foundationWallet).setFoundationFlatFeeRate(150)
          );

          assertEvent<SetFoundationFlatFeeRateEvent>(
            receipt,
            "SetFoundationFlatFeeRate",
            {
              feeRate: 150,
            }
          );
        });
      });
    });
  });

  describe("Creating market", () => {
    describe("Paused Contract", () => {
      beforeEach(async () => {
        await contract.connect(defaultAdmin).pause();
      });

      it("Should revert with pause error", async () => {
        await expect(
          contract
            .connect(alice)
            .createMarket(
              "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
              alice.address,
              [ethers.utils.parseEther("2"), ethers.utils.parseEther("1")],
              1653327334588,
              1653357334588,
              foreToken.address
            )
        ).to.revertedWith("EnforcedPause()");
      });
    });

    describe("Unpaused Contract", () => {
      it("Should revert without funds for creation fee", async () => {
        await expect(
          contract
            .connect(alice)
            .createMarket(
              "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
              alice.address,
              [ethers.utils.parseEther("2"), ethers.utils.parseEther("1")],
              1653327334588,
              1653357334588,
              foreToken.address
            )
        ).to.revertedWith("ERC20: transfer amount exceeds balance");
      });

      it("Should revert if not whitelisted factory", async () => {
        await expect(
          protocol
            .connect(alice)
            .createMarket(
              "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
              alice.address,
              alice.address,
              "0xdac17f958d2ee523a2206206994597c13d831ec7"
            )
        ).to.revertedWith("FactoryIsNotWhitelisted");
      });

      it("Should revert in case inversed dates", async () => {
        await expect(
          contract
            .connect(alice)
            .createMarket(
              "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
              alice.address,
              [ethers.utils.parseEther("2"), ethers.utils.parseEther("1")],
              1653357334588,
              1653327334588,
              foreToken.address
            )
        ).to.revertedWith("Basic Factory: Date error");
      });
    });

    describe("Invalid market", async () => {
      it("should revert token not enabled", async () => {
        await expect(
          txExec(
            contract
              .connect(alice)
              .createMarket(
                "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                alice.address,
                [0, 0],
                1653327334588,
                1653357334588,
                "0x0000000000000000000000000000000000000000"
              )
          )
        ).to.revertedWith("Basic Factory: Token is not enabled");
      });

      it("should revert maximum sides reached", async () => {
        await expect(
          txExec(
            contract
              .connect(alice)
              .createMarket(
                "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                alice.address,
                new Array(11).fill(0),
                1653327334588,
                1653357334588,
                foreToken.address
              )
          )
        ).to.revertedWith("Basic Factory: Maximum sides reached");
      });
    });
  });

  describe("With market created", () => {
    let tx: ContractTransaction;
    let marketContract: BasicMarketV2;

    beforeEach(async () => {
      const marketHash =
        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab";
      [tx] = await txExec(
        contract
          .connect(bob)
          .createMarket(
            marketHash,
            alice.address,
            [ethers.utils.parseEther("2"), ethers.utils.parseEther("1")],
            1653327334588,
            1653357334588,
            foreToken.address
          )
      );

      const initCode = await contract.INIT_CODE_PAIR_HASH();

      const salt = marketHash;
      const newAddress = ethers.utils.getCreate2Address(
        contract.address,
        salt,
        initCode
      );

      marketContract = await attachContract<BasicMarketV2>(
        "BasicMarketV2",
        newAddress
      );
    });

    it("Should return true while checking market is operator", async () => {
      expect(await protocol.isForeOperator(marketContract.address)).to.be.equal(
        true
      );
    });

    it("Should return true for isApprovedForAll with created market", async () => {
      expect(
        await protocol.isApprovedForAll(alice.address, marketContract.address)
      ).to.be.equal(true);
    });

    it("tokenURI() should return proper URI", async () => {
      expect(await protocol.tokenURI(0)).to.be.equal(
        "https://markets.api.foreprotocol.io/market/0"
      );
    });

    it("allMarketsLength() should be increased", async () => {
      expect(await protocol.allMarketLength()).to.be.equal(1);
    });

    it("Should not be able to create market with same hash (revert with MarketAlreadyExists)", async () => {
      await txExec(
        protocolConfig.connect(owner).setFactoryStatus([owner.address], [true])
      );
      await txExec(
        protocol
          .connect(owner)
          .createMarket(
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abbb",
            alice.address,
            alice.address,
            "0xdac17f958d2ee523a2206206994597c13d831ec7"
          )
      );
      await expect(
        protocol
          .connect(owner)
          .createMarket(
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abbb",
            alice.address,
            alice.address,
            "0xdac17f958d2ee523a2206206994597c13d831ec7"
          )
      ).to.be.revertedWith("MarketAlreadyExists");
    });

    it("Should burn funds as creation fee (ERC20 Transfer)", async () => {
      await expect(tx)
        .to.emit(foreToken, "Transfer")
        .withArgs(
          bob.address,
          "0x000000000000000000000000000000000000dEaD",
          ethers.utils.parseEther("10")
        );
    });

    it("Should emit token creation event (ERC721 Transfer)", async () => {
      await expect(tx)
        .to.emit(protocol, "Transfer")
        .withArgs(
          "0x0000000000000000000000000000000000000000",
          alice.address,
          BigNumber.from(0)
        );
    });
  });

  describe("With whitelisted market creator", () => {
    let tx: ContractTransaction;
    let marketContract: BasicMarketV2;

    beforeEach(async () => {
      await accountWhitelist
        .connect(defaultAdmin)
        .manageWhitelist(bob.address, true);
      const marketHash =
        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab";
      [tx] = await txExec(
        contract
          .connect(bob)
          .createMarket(
            marketHash,
            alice.address,
            [ethers.utils.parseEther("2"), ethers.utils.parseEther("1")],
            1653327334588,
            1653357334588,
            foreToken.address
          )
      );

      const initCode = await contract.INIT_CODE_PAIR_HASH();

      const salt = marketHash;
      const newAddress = ethers.utils.getCreate2Address(
        contract.address,
        salt,
        initCode
      );

      marketContract = await attachContract<BasicMarketV2>(
        "BasicMarketV2",
        newAddress
      );
    });

    it("should not incur fees", async () => {
      expect(
        await foreToken.balanceOf("0x000000000000000000000000000000000000dEaD")
      ).to.be.eq(0);
    });
  });
});
