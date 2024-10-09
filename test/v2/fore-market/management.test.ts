import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";

import { BasicMarketV2 } from "@/BasicMarketV2";
import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactoryV2 } from "@/BasicFactoryV2";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ERC20 } from "@/ERC20";

import {
  deployContractAs,
  deployLibrary,
  deployMockedContract,
  deployUniversalRouter,
  impersonateContract,
  txExec,
} from "../../helpers/utils";
import { defaultIncentives } from "../../helpers/constants";
import { ForeAccessManager } from "@/ForeAccessManager";

describe("ForeMarketV2 / Management", () => {
  let foundationWallet: SignerWithAddress;
  let highGuardAccount: SignerWithAddress;
  let marketplaceContract: SignerWithAddress;
  let basicFactoryAccount: Signer;
  let protocolConfig: MockContract<ProtocolConfig>;
  let foreToken: MockContract<ForeToken>;
  let foreVerifiers: MockContract<ForeVerifiers>;
  let foreProtocol: MockContract<ForeProtocol>;
  let basicFactory: MockContract<BasicFactoryV2>;
  let tokenRegistry: Contract;
  let accountWhitelist: Contract;
  let usdcToken: MockContract<ERC20>;
  let contract: BasicMarketV2;
  let foreAccessManager: MockContract<ForeAccessManager>;

  beforeEach(async () => {
    [, foundationWallet, highGuardAccount, marketplaceContract] =
      await ethers.getSigners();

    // deploy library
    await deployLibrary("MarketLibV2", ["BasicMarketV2", "BasicFactoryV2"]);

    // preparing dependencies
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

    // preparing fore protocol
    foreProtocol = await deployMockedContract<ForeProtocol>(
      "ForeProtocol",
      protocolConfig.address,
      "https://markets.api.foreprotocol.io/market/"
    );

    usdcToken = await deployMockedContract<ERC20>(
      "openzeppelin-v4/contracts/token/ERC20/ERC20.sol:ERC20",
      "USDC",
      "USD Coin"
    );

    // setup the access manager
    // preparing fore protocol
    foreAccessManager = await deployMockedContract<ForeAccessManager>(
      "ForeAccessManager",
      foundationWallet.address
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
      [],
    ]);

    const router = await deployUniversalRouter(
      foreAccessManager.address,
      foreProtocol.address,
      [usdcToken.address, foreToken.address]
    );

    basicFactory = await deployMockedContract<BasicFactoryV2>(
      "BasicFactoryV2",
      foreAccessManager.address,
      foreProtocol.address,
      tokenRegistry.address,
      accountWhitelist.address,
      foundationWallet.address,
      router.address
    );

    basicFactoryAccount = await impersonateContract(basicFactory.address);

    // factory assignment
    await txExec(foreVerifiers.setProtocol(foreProtocol.address));

    // deployment of market using factory account
    contract = await deployContractAs<BasicMarketV2>(
      basicFactoryAccount,
      "BasicMarketV2"
    );
  });

  it("Should return proper factory address", async () => {
    expect(await contract.factory()).to.be.equal(
      await basicFactoryAccount.getAddress()
    );
  });

  it("Should return null protocol config address", async () => {
    expect(await contract.protocolConfig()).to.be.equal(
      "0x0000000000000000000000000000000000000000"
    );
  });

  it("Should return null market config address", async () => {
    expect(await contract.marketConfig()).to.be.equal(
      "0x0000000000000000000000000000000000000000"
    );
  });

  it("Should return null FORE verifiers address", async () => {
    expect(await contract.foreVerifiers()).to.be.equal(
      "0x0000000000000000000000000000000000000000"
    );
  });

  it("Should return null FORE token address", async () => {
    expect(await contract.foreToken()).to.be.equal(
      "0x0000000000000000000000000000000000000000"
    );
  });

  it("Should return proper market info struct", async () => {
    expect(await contract.marketInfo()).to.be.eql([
      [], // sides
      [], // verifications
      ethers.constants.AddressZero, // dispute creator
      BigNumber.from(0), // total market size
      BigNumber.from(0), // total verifications amount
      BigNumber.from(0), // endPredictionTimestamp
      BigNumber.from(0), // startVerificationTimestamp
      0, // result
      0, // winner side index
      false, // confirmed
      false, // solved
    ]);
  });

  it("Should return initial verificationHeight", async () => {
    expect(await contract.verificationHeight()).to.be.equal(0);
  });
});
