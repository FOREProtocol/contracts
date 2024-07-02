import { ERC20 } from "@/ERC20";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import {
  assertEvent,
  deployContract,
  deployMockedContract,
  deployMockedContractAs,
  txExec,
} from "../../helpers/utils";
import { ForeAccessManager } from "@/ForeAccessManager";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockContract } from "@defi-wonderland/smock";
import {
  SetIncentiveRatesEvent,
  TokenAddedEvent,
  TokenRemovedEvent,
} from "@/TokenIncentiveRegistry";
import { MockERC20, TokenIncentiveRegistry__factory } from "@/index";

const defaultIncentives = {
  predictionDiscountRate: 1000,
  marketCreatorDiscountRate: 1000,
  verificationDiscountRate: 1000,
  foundationDiscountRate: 1000,
} as const;

describe("Token Incentive Registry", function () {
  let contract: Contract;
  let foreAccessManager: MockContract<ForeAccessManager>;
  let deployerWallet: SignerWithAddress;
  let defaultAdmin: SignerWithAddress;
  let foundationWallet: SignerWithAddress;
  let [usdcToken, token1, token2, token3, token4]: ERC20[] = [];

  beforeEach(async () => {
    [deployerWallet, defaultAdmin, foundationWallet] =
      await ethers.getSigners();

    usdcToken = await deployContract(
      "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
      "USDC",
      "USDC"
    );
    token1 = await deployContract(
      "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
      "Token1",
      "Token1"
    );
    token2 = await deployContract(
      "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
      "Token2",
      "Token2"
    );
    token3 = await deployContract(
      "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
      "Token3",
      "Token3"
    );
    token4 = await deployContract(
      "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
      "Token4",
      "Token4"
    );

    // setup the access manager
    // preparing fore protocol
    foreAccessManager = await deployMockedContract<ForeAccessManager>(
      "ForeAccessManager",
      defaultAdmin.address
    );

    usdcToken.deployed();
    token1.deployed();
    token2.deployed();
    token3.deployed();

    const contractFactory = await ethers.getContractFactory(
      "TokenIncentiveRegistry"
    );
    contract = await upgrades.deployProxy(
      contractFactory,
      [foreAccessManager.address, [usdcToken.address], [defaultIncentives]],
      {
        kind: "uups",
        initializer: "initialize",
      }
    );
  });

  it("should not allow re-initialization", async function () {
    await expect(
      contract.initialize(
        foreAccessManager.address,
        [usdcToken.address],
        [defaultIncentives]
      )
    ).to.be.reverted;
  });

  describe("Access control", () => {
    describe("No permissions granted, default permissions", () => {
      describe("Default Admin Wallet", () => {
        it("Should allow to add token", async () => {
          const [, receipt] = await txExec(
            contract
              .connect(defaultAdmin)
              .addToken(token1.address, defaultIncentives)
          );

          assertEvent<TokenAddedEvent>(receipt, "TokenAdded");
        });

        it("Should allow to remove token", async () => {
          // Setup to remove token
          await contract
            .connect(defaultAdmin)
            .addToken(token1.address, defaultIncentives);

          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).removeToken(token1.address)
          );

          assertEvent<TokenRemovedEvent>(receipt, "TokenRemoved");
        });

        it("Should allow to set token incentives", async () => {
          await contract
            .connect(defaultAdmin)
            .addToken(token1.address, defaultIncentives);

          const incentives = {
            predictionDiscountRate: 100,
            marketCreatorDiscountRate: 100,
            verificationDiscountRate: 100,
            foundationDiscountRate: 100,
          };

          const [, receipt] = await txExec(
            contract
              .connect(defaultAdmin)
              .setTokenIncentives(token1.address, incentives)
          );

          assertEvent<SetIncentiveRatesEvent>(receipt, "SetIncentiveRates");
        });
      });

      describe("Deployer Wallet", () => {
        let deployerUnauthorizedMessage: string;

        beforeEach(async () => {
          deployerUnauthorizedMessage = `AccessManagedUnauthorized("${deployerWallet.address}")`;
        });

        it("Should revert on add token", async () => {
          await expect(
            contract.addToken(token1.address, defaultIncentives)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });

        it("Should revert on remove token", async () => {
          // Setup to remove token
          await contract
            .connect(defaultAdmin)
            .addToken(token1.address, defaultIncentives);

          await expect(contract.removeToken(token1.address)).to.be.revertedWith(
            deployerUnauthorizedMessage
          );
        });

        it("Should revert on set token incentives", async () => {
          // Setup to update token
          await contract
            .connect(defaultAdmin)
            .addToken(token1.address, defaultIncentives);

          const incentives = {
            predictionDiscountRate: 100,
            marketCreatorDiscountRate: 100,
            verificationDiscountRate: 100,
            foundationDiscountRate: 100,
          };

          await expect(
            contract.setTokenIncentives(token1.address, incentives)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });
      });

      describe("Foundation Wallet", () => {
        let foundationUnauthorizedMessage: string;

        beforeEach(async () => {
          foundationUnauthorizedMessage = `AccessManagedUnauthorized("${foundationWallet.address}")`;
        });

        it("Should revert on add token", async () => {
          await expect(
            contract
              .connect(foundationWallet)
              .addToken(token1.address, defaultIncentives)
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on remove token", async () => {
          // Setup to remove token
          await contract
            .connect(defaultAdmin)
            .addToken(token1.address, defaultIncentives);

          await expect(
            contract.connect(foundationWallet).removeToken(token1.address)
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on set token incentives", async () => {
          // Setup to update token
          await contract
            .connect(defaultAdmin)
            .addToken(token1.address, defaultIncentives);

          const incentives = {
            predictionDiscountRate: 100,
            marketCreatorDiscountRate: 100,
            verificationDiscountRate: 100,
            foundationDiscountRate: 100,
          };

          await expect(
            contract
              .connect(foundationWallet)
              .setTokenIncentives(token1.address, incentives)
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });
      });
    });

    describe("Custom permissions granted, no default permissions", () => {
      // 0 is reserver for the admin role
      const FOUNDATION_ROLE = 1n;

      beforeEach(async () => {
        await foreAccessManager
          .connect(defaultAdmin)
          .grantRole(FOUNDATION_ROLE, foundationWallet.address, 0);

        // Functions that can only be called by the foundation multisign
        await foreAccessManager
          .connect(defaultAdmin)
          .setTargetFunctionRole(
            contract.address,
            [
              contract.interface.getSighash("addToken"),
              contract.interface.getSighash("removeToken"),
              contract.interface.getSighash("setTokenIncentives"),
            ],
            FOUNDATION_ROLE
          );
      });

      describe("Default Admin Wallet", () => {
        let defaultAdminUnauthorizedMessage: string;

        beforeEach(async () => {
          defaultAdminUnauthorizedMessage = `AccessManagedUnauthorized("${defaultAdmin.address}")`;
        });

        it("Should revert on add token", async () => {
          await expect(
            contract
              .connect(defaultAdmin)
              .addToken(token1.address, defaultIncentives)
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });

        it("Should revert on remove token", async () => {
          // Setup to remove token
          await contract
            .connect(foundationWallet)
            .addToken(token1.address, defaultIncentives);

          await expect(
            contract.connect(defaultAdmin).removeToken(token1.address)
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });

        it("Should revert on set token incentives", async () => {
          // Setup to update token
          await contract
            .connect(foundationWallet)
            .addToken(token1.address, defaultIncentives);

          const incentives = {
            predictionDiscountRate: 100,
            marketCreatorDiscountRate: 100,
            verificationDiscountRate: 100,
            foundationDiscountRate: 100,
          };

          await expect(
            contract
              .connect(defaultAdmin)
              .setTokenIncentives(token1.address, incentives)
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });
      });

      describe("Deployer Wallet", () => {
        let deployerUnauthorizedMessage: string;

        beforeEach(async () => {
          deployerUnauthorizedMessage = `AccessManagedUnauthorized("${deployerWallet.address}")`;
        });

        it("Should revert on add token", async () => {
          await expect(
            contract.addToken(token1.address, defaultIncentives)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });

        it("Should revert on remove token", async () => {
          // Setup to remove token
          await contract
            .connect(foundationWallet)
            .addToken(token1.address, defaultIncentives);

          await expect(contract.removeToken(token1.address)).to.be.revertedWith(
            deployerUnauthorizedMessage
          );
        });

        it("Should revert on set token incentives", async () => {
          // Setup to update token
          await contract
            .connect(foundationWallet)
            .addToken(token1.address, defaultIncentives);

          const incentives = {
            predictionDiscountRate: 100,
            marketCreatorDiscountRate: 100,
            verificationDiscountRate: 100,
            foundationDiscountRate: 100,
          };

          await expect(
            contract.setTokenIncentives(token1.address, incentives)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });
      });

      describe("Foundation Wallet", () => {
        it("Should allow to add token", async () => {
          const [, receipt] = await txExec(
            contract
              .connect(foundationWallet)
              .addToken(token1.address, defaultIncentives)
          );

          assertEvent<TokenAddedEvent>(receipt, "TokenAdded");
        });

        it("Should allow to remove token", async () => {
          // Setup to remove token
          await contract
            .connect(foundationWallet)
            .addToken(token1.address, defaultIncentives);

          const [, receipt] = await txExec(
            contract.connect(foundationWallet).removeToken(token1.address)
          );

          assertEvent<TokenRemovedEvent>(receipt, "TokenRemoved");
        });

        it("Should allow to set token incentives", async () => {
          await contract
            .connect(foundationWallet)
            .addToken(token1.address, defaultIncentives);

          const incentives = {
            predictionDiscountRate: 100,
            marketCreatorDiscountRate: 100,
            verificationDiscountRate: 100,
            foundationDiscountRate: 100,
          };

          const [, receipt] = await txExec(
            contract
              .connect(foundationWallet)
              .setTokenIncentives(token1.address, incentives)
          );

          assertEvent<SetIncentiveRatesEvent>(receipt, "SetIncentiveRates");
        });
      });
    });
  });

  describe("Initial values", () => {
    it("should add initial tokens", async () => {
      expect(await contract.isTokenEnabled(usdcToken.address)).to.eql(true);
      expect(await contract.getTokenIncentives(usdcToken.address)).to.eql([
        BigNumber.from(1000),
        BigNumber.from(1000),
        BigNumber.from(1000),
        BigNumber.from(1000),
      ]);
    });
  });

  describe("Invalid initialization", () => {
    let TestFactory: TokenIncentiveRegistry__factory;

    before(async () => {
      TestFactory = await ethers.getContractFactory("TokenIncentiveRegistry");
    });

    it("should revert invalid token", async () => {
      await expect(
        upgrades.deployProxy(TestFactory, [
          foreAccessManager.address,
          ["0x0000000000000000000000000000000000000000"],
          [defaultIncentives],
        ])
      ).to.be.reverted;
    });

    it("should revert invalid incentives", async () => {
      await expect(
        upgrades.deployProxy(TestFactory, [
          foreAccessManager.address,
          [usdcToken.address],
          [
            {
              predictionDiscountRate: 0,
              marketCreatorDiscountRate: 0,
              verificationDiscountRate: 0,
              foundationDiscountRate: 0,
            },
          ],
        ])
      ).to.be.reverted;
    });
  });

  describe("Registry", () => {
    beforeEach(async () => {
      // 0 is reserver for the admin role
      const ADMIN_ROLE = 0n;

      await foreAccessManager
        .connect(defaultAdmin)
        .grantRole(ADMIN_ROLE, deployerWallet.address, 0);

      // Functions that can only be called by the foundation multisign
      await foreAccessManager
        .connect(defaultAdmin)
        .setTargetFunctionRole(
          contract.address,
          [
            contract.interface.getSighash("addToken"),
            contract.interface.getSighash("removeToken"),
            contract.interface.getSighash("setTokenIncentives"),
          ],
          ADMIN_ROLE
        );
    });

    describe("successfully add token", () => {
      beforeEach(async () => {
        await contract.addToken(token1.address, defaultIncentives);
        await contract.addToken(token2.address, defaultIncentives);
        await contract.addToken(token3.address, defaultIncentives);
      });

      it("should enabled token", async () => {
        expect(await contract.isTokenEnabled(token1.address)).to.eq(true);
        expect(await contract.isTokenEnabled(token2.address)).to.eq(true);
        expect(await contract.isTokenEnabled(token3.address)).to.eq(true);
      });

      it("should set discount rate", async () => {
        expect(await contract.getTokenIncentives(token1.address)).to.eql([
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
        ]);
        expect(await contract.getTokenIncentives(token2.address)).to.eql([
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
        ]);
        expect(await contract.getTokenIncentives(token3.address)).to.eql([
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
        ]);
      });

      it("should revert when adding a token that has already been added", async () => {
        await expect(contract.addToken(token1.address, defaultIncentives)).to.be
          .reverted;
        await expect(contract.addToken(token2.address, defaultIncentives)).to.be
          .reverted;
      });

      it("should revert when adding a token with all incentive rates are zeroes", async () => {
        const incentives = {
          predictionDiscountRate: 0,
          marketCreatorDiscountRate: 0,
          verificationDiscountRate: 0,
          foundationDiscountRate: 0,
        };
        await expect(contract.addToken(token4.address, incentives)).to.be
          .reverted;
      });
    });

    it("should revert add token where token is invalid", async () => {
      await expect(
        contract.addToken(
          "0x0000000000000000000000000000000000000000",
          defaultIncentives
        )
      ).to.be.reverted;
    });

    describe("successfully remove token", () => {
      beforeEach(async () => {
        await contract.addToken(token1.address, defaultIncentives);
        await contract.addToken(token2.address, defaultIncentives);
        await contract.addToken(token3.address, defaultIncentives);

        await contract.removeToken(token1.address);
        await contract.removeToken(token2.address);
        await contract.removeToken(token3.address);
      });

      it("should disable token", async () => {
        expect(await contract.isTokenEnabled(token1.address)).to.eq(false);
        expect(await contract.isTokenEnabled(token2.address)).to.eq(false);
        expect(await contract.isTokenEnabled(token3.address)).to.eq(false);
      });

      it("should all incentive rates are set to 0", async () => {
        expect(await contract.getTokenIncentives(token1.address)).to.eql([
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
        ]);
        expect(await contract.getTokenIncentives(token2.address)).to.eql([
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
        ]);
        expect(await contract.getTokenIncentives(token3.address)).to.eql([
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
        ]);
      });

      it("should revert when removing an unregistered token", async () => {
        await expect(contract.removeToken(token4.address)).to.be.reverted;
      });

      it("should able to add token again", async () => {
        expect(await contract.addToken(token1.address, defaultIncentives));
        expect(await contract.isTokenEnabled(token1.address)).to.eq(true);
      });
    });

    describe("set incentives", () => {
      const updatedIncentives = {
        predictionDiscountRate: 100,
        marketCreatorDiscountRate: 100,
        verificationDiscountRate: 100,
        foundationDiscountRate: 100,
      };

      describe("successfully", () => {
        beforeEach(async () => {
          await contract.addToken(token1.address, defaultIncentives);
          await contract.addToken(token2.address, defaultIncentives);
          await contract.addToken(token3.address, defaultIncentives);
          await contract.setTokenIncentives(token1.address, updatedIncentives);
          await contract.setTokenIncentives(token2.address, updatedIncentives);
          await contract.setTokenIncentives(token3.address, updatedIncentives);
        });

        it("should set discount rate", async () => {
          expect(await contract.getTokenIncentives(token1.address)).to.be.eql([
            BigNumber.from(100),
            BigNumber.from(100),
            BigNumber.from(100),
            BigNumber.from(100),
          ]);
          expect(await contract.getTokenIncentives(token2.address)).to.be.eql([
            BigNumber.from(100),
            BigNumber.from(100),
            BigNumber.from(100),
            BigNumber.from(100),
          ]);
          expect(await contract.getTokenIncentives(token3.address)).to.be.eql([
            BigNumber.from(100),
            BigNumber.from(100),
            BigNumber.from(100),
            BigNumber.from(100),
          ]);
        });
      });

      describe("invalid", async () => {
        beforeEach(async () => {
          await contract.addToken(token1.address, defaultIncentives);
        });

        it("should revert invalid incentives", async () => {
          await expect(
            contract.setTokenIncentives(token1.address, {
              predictionDiscountRate: 0,
              marketCreatorDiscountRate: 0,
              verificationDiscountRate: 0,
              foundationDiscountRate: 0,
            })
          ).to.be.reverted;
        });

        it("should revert token not registered", async () => {
          const testToken = await deployMockedContractAs<MockERC20>(
            defaultAdmin,
            "MockERC20",
            "Test",
            "Test Coin",
            ethers.utils.parseEther("1000000")
          );

          await expect(
            contract.setTokenIncentives(testToken.address, defaultIncentives)
          ).to.be.reverted;
        });
      });
    });
  });

  describe("authorize upgrade", () => {
    it("should revert unauthorized upgrade", async () => {
      const deployerUnauthorizedMessage = `AccessManagedUnauthorized("${deployerWallet.address}")`;
      const RouterImplV2 = await ethers.getContractFactory(
        "TokenIncentiveRegistry"
      );
      await expect(
        upgrades.upgradeProxy(contract.address, RouterImplV2, {
          kind: "uups",
          call: {
            fn: "isTokenEnabled",
            args: [usdcToken.address],
          },
        })
      ).to.revertedWith(deployerUnauthorizedMessage);
    });

    it("should authorize upgrade", async () => {
      const RegistryImplV2 = await ethers.getContractFactory(
        "TokenIncentiveRegistry",
        defaultAdmin
      );
      await upgrades.upgradeProxy(contract.address, RegistryImplV2, {
        kind: "uups",
        call: {
          fn: "isTokenEnabled",
          args: [usdcToken.address],
        },
      });
    });
  });
});
