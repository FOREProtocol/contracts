import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract } from "ethers";
import { assertEvent, deployMockedContract, txExec } from "../../helpers/utils";
import { ForeAccessManager } from "@/ForeAccessManager";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockContract } from "@defi-wonderland/smock";
import { ManagedWhitelistEvent } from "@/AccountWhitelist";
import { AccountWhitelist__factory } from "@/index";

describe("Account Whitelist", function () {
  let contract: Contract;
  let foreAccessManager: MockContract<ForeAccessManager>;

  let deployerWallet: SignerWithAddress;
  let defaultAdmin: SignerWithAddress;
  let foundationWallet: SignerWithAddress;

  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let james: SignerWithAddress;

  beforeEach(async () => {
    [deployerWallet, defaultAdmin, foundationWallet, alice, bob, james] =
      await ethers.getSigners();

    // setup the access manager
    // preparing fore protocol
    foreAccessManager = await deployMockedContract<ForeAccessManager>(
      "ForeAccessManager",
      defaultAdmin.address
    );

    const contractFactory = await ethers.getContractFactory("AccountWhitelist");
    contract = await upgrades.deployProxy(contractFactory, [
      foreAccessManager.address,
      [defaultAdmin.address],
    ]);
  });

  it("should not allow re-initialization", async function () {
    await expect(
      contract.initialize(foreAccessManager.address, [defaultAdmin.address])
    ).to.be.reverted;
  });

  describe("Access control", () => {
    describe("No permissions granted, default permissions", () => {
      describe("Default Admin Wallet", () => {
        it("Should allow to whitelist account", async () => {
          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).manageWhitelist(alice.address, true)
          );

          assertEvent<ManagedWhitelistEvent>(receipt, "ManagedWhitelist");
        });

        it("Should allow to remove whitelisted account", async () => {
          // Setup to whitelist account
          await contract
            .connect(defaultAdmin)
            .manageWhitelist(alice.address, true);

          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).manageWhitelist(alice.address, false)
          );

          assertEvent<ManagedWhitelistEvent>(receipt, "ManagedWhitelist");
        });
      });

      describe("Deployer Wallet", () => {
        let deployerUnauthorizedMessage: string;

        beforeEach(async () => {
          deployerUnauthorizedMessage = `AccessManagedUnauthorized("${deployerWallet.address}")`;
        });

        it("Should revert on whitelist", async () => {
          await expect(
            contract.manageWhitelist(alice.address, true)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });

        it("Should revert on remove whitelisted account", async () => {
          // Setup to whitelist account
          await contract
            .connect(defaultAdmin)
            .manageWhitelist(alice.address, true);

          await expect(
            contract.manageWhitelist(alice.address, false)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });
      });

      describe("Foundation Wallet", () => {
        let foundationUnauthorizedMessage: string;

        beforeEach(async () => {
          foundationUnauthorizedMessage = `AccessManagedUnauthorized("${foundationWallet.address}")`;
        });

        it("Should revert on whitelist", async () => {
          await expect(
            contract
              .connect(foundationWallet)
              .manageWhitelist(alice.address, true)
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on remove whitelisted account", async () => {
          // Setup to whitelist account
          await contract
            .connect(defaultAdmin)
            .manageWhitelist(alice.address, true);

          await expect(
            contract
              .connect(foundationWallet)
              .manageWhitelist(alice.address, false)
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
            [contract.interface.getSighash("manageWhitelist")],
            FOUNDATION_ROLE
          );
      });

      describe("Default Admin Wallet", () => {
        let defaultAdminUnauthorizedMessage: string;

        beforeEach(async () => {
          defaultAdminUnauthorizedMessage = `AccessManagedUnauthorized("${defaultAdmin.address}")`;
        });

        it("Should revert on whitelist", async () => {
          await expect(
            contract.connect(defaultAdmin).manageWhitelist(alice.address, true)
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });

        it("Should revert on remove whitelisted account", async () => {
          // Setup to whitelist account
          await contract
            .connect(foundationWallet)
            .manageWhitelist(alice.address, true);

          await expect(
            contract.connect(defaultAdmin).manageWhitelist(alice.address, false)
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });
      });

      describe("Deployer Wallet", () => {
        let deployerUnauthorizedMessage: string;

        beforeEach(async () => {
          deployerUnauthorizedMessage = `AccessManagedUnauthorized("${deployerWallet.address}")`;
        });

        it("Should revert on whitelist", async () => {
          await expect(
            contract.manageWhitelist(alice.address, true)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });

        it("Should revert on remove whitelisted account", async () => {
          // Setup to whitelist account
          await contract
            .connect(foundationWallet)
            .manageWhitelist(alice.address, true);

          await expect(
            contract.manageWhitelist(alice.address, false)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });
      });

      describe("Foundation Wallet", () => {
        it("Should allow whitelist account", async () => {
          const [, receipt] = await txExec(
            contract
              .connect(foundationWallet)
              .manageWhitelist(alice.address, true)
          );

          assertEvent<ManagedWhitelistEvent>(receipt, "ManagedWhitelist");
        });

        it("Should allow to remove whitelisted account", async () => {
          // Setup to whitelist account
          await contract
            .connect(foundationWallet)
            .manageWhitelist(alice.address, true);

          const [, receipt] = await txExec(
            contract
              .connect(foundationWallet)
              .manageWhitelist(alice.address, false)
          );

          assertEvent<ManagedWhitelistEvent>(receipt, "ManagedWhitelist");
        });
      });
    });
  });

  describe("Initial values", () => {
    it("should add initial accounts", async () => {
      expect(await contract.isAccountWhitelisted(defaultAdmin.address)).to.eql(
        true
      );
    });
  });

  describe("Invalid initialization", () => {
    let TestContract: AccountWhitelist__factory;

    before(async () => {
      TestContract = await ethers.getContractFactory("AccountWhitelist");
    });

    it("should revert invalid account", async () => {
      await expect(
        upgrades.deployProxy(TestContract, [
          foreAccessManager.address,
          ["0x0000000000000000000000000000000000000000"],
        ])
      ).to.be.reverted;
    });
  });

  describe("Whitelist", () => {
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
          [contract.interface.getSighash("manageWhitelist")],
          ADMIN_ROLE
        );
    });

    describe("successfully whitelist", () => {
      beforeEach(async () => {
        await contract.manageWhitelist(alice.address, true);
        await contract.manageWhitelist(bob.address, true);
        await contract.manageWhitelist(james.address, true);
      });

      it("should whitelisted account", async () => {
        expect(await contract.isAccountWhitelisted(alice.address)).to.eq(true);
        expect(await contract.isAccountWhitelisted(bob.address)).to.eq(true);
        expect(await contract.isAccountWhitelisted(james.address)).to.eq(true);
      });
    });

    it("should revert manage whitelist where account is invalid", async () => {
      await expect(
        contract.manageWhitelist(
          "0x0000000000000000000000000000000000000000",
          true
        )
      ).to.be.reverted;
    });

    describe("successfully remove whitelist", () => {
      beforeEach(async () => {
        await contract.manageWhitelist(alice.address, true);
        await contract.manageWhitelist(bob.address, true);
        await contract.manageWhitelist(james.address, true);

        await contract.manageWhitelist(alice.address, false);
        await contract.manageWhitelist(bob.address, false);
        await contract.manageWhitelist(james.address, false);
      });

      it("should false", async () => {
        expect(await contract.isAccountWhitelisted(alice.address)).to.eq(false);
        expect(await contract.isAccountWhitelisted(bob.address)).to.eq(false);
        expect(await contract.isAccountWhitelisted(james.address)).to.eq(false);
      });

      it("should able to whitelist account again", async () => {
        expect(await contract.manageWhitelist(alice.address, true));
        expect(await contract.isAccountWhitelisted(alice.address)).to.eq(true);
      });
    });
  });

  describe("authorize upgrade", () => {
    it("should revert unauthorized upgrade", async () => {
      const deployerUnauthorizedMessage = `AccessManagedUnauthorized("${deployerWallet.address}")`;
      const ContractImplV2 = await ethers.getContractFactory(
        "AccountWhitelist"
      );
      await expect(
        upgrades.upgradeProxy(contract.address, ContractImplV2, {
          kind: "uups",
          call: {
            fn: "isAccountWhitelisted",
            args: [defaultAdmin.address],
          },
        })
      ).to.revertedWith(deployerUnauthorizedMessage);
    });

    it("should authorize upgrade", async () => {
      const ContractImplV2 = await ethers.getContractFactory(
        "AccountWhitelist",
        defaultAdmin
      );
      await upgrades.upgradeProxy(contract.address, ContractImplV2, {
        kind: "uups",
        call: {
          fn: "isAccountWhitelisted",
          args: [defaultAdmin.address],
        },
      });
    });
  });
});
