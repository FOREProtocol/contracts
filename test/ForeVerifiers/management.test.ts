// import {
//     ForeVerifiers,
//     FactoryChangedEvent,
//     TransferAllowanceChangedEvent,
//     TokenPowerIncreasedEvent,
//     TokenPowerDecreasedEvent,
// } from "@/ForeVerifiers";
// import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
// import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import { expect } from "chai";
// import { BigNumber, ContractTransaction } from "ethers";
// import { ethers } from "hardhat";
// import {
//     assertEvent,
//     assertIsAvailableOnlyForOwner,
//     deployContract,
//     txExec,
// } from "../helpers/utils";
//
// xdescribe("ForeVerifiers / Management", () => {
//     let owner: SignerWithAddress;
//     let alice: SignerWithAddress;
//
//     let contract: ForeVerifiers;
//
//     beforeEach(async () => {
//         contract = await deployContract<ForeVerifiers>("ForeVerifiers");
//         [owner, alice] = await ethers.getSigners();
//     });
//
//     describe("Initial state", () => {
//         it("Should expose proper name", async () => {
//             expect(await contract.name()).to.be.equal("ForeNFT");
//         });
//
//         it("Should expose proper symbol", async () => {
//             expect(await contract.symbol()).to.be.equal("FORE");
//         });
//
//         it("Should disable transfers by default", async () => {
//             expect(await contract.transfersAllowed()).to.be.equal(false);
//         });
//     });
//
//     // describe("Change token penalty", () => {
//     //     it("Should fail for non existing token", async () => {
//     //         await expect(
//     //             contract.connect(owner).setTokenPenalty(0, 100)
//     //         ).to.be.revertedWith("TokenNotExist()");
//     //     });
//     //
//     //     describe("with existing token", () => {
//     //         beforeEach(async () => {
//     //             await txExec(
//     //                 contract.connect(owner).mint(alice.address, {
//     //                     staked: ethers.utils.parseUnits("1", "ether"),
//     //                     penalty: 10,
//     //                 })
//     //             );
//     //         });
//     //
//     //         it("Should allow to execute only by owner", async () => {
//     //             await assertIsAvailableOnlyForOwner(async (account) => {
//     //                 return contract.connect(account).setTokenPenalty(0, 100);
//     //             });
//     //         });
//     //
//     //         describe("successfully", () => {
//     //             let tx: ContractTransaction;
//     //             let recipt: ContractReceipt;
//     //
//     //             beforeEach(async () => {
//     //                 [tx, recipt] = await txExec(
//     //                     contract.connect(owner).setTokenPenalty(0, 100)
//     //                 );
//     //             });
//     //
//     //             it("Should emit event", async () => {
//     //                 assertEvent<TokenPenaltyChangedEvent>(
//     //                     recipt,
//     //                     "TokenPenaltyChanged",
//     //                     {
//     //                         tokenId: BigNumber.from(0),
//     //                         penalty: BigNumber.from(100),
//     //                     }
//     //                 );
//     //             });
//     //
//     //             it("Should update state", async () => {
//     //                 const token = await contract.tokens(0);
//     //                 expect(token.penalty).to.be.equal(100);
//     //             });
//     //         });
//     //     });
//     // });
//     //
//     // describe("Activating whitelist", () => {
//     //     it("Should allow to execute only by owner", async () => {
//     //         await assertIsAvailableOnlyForOwner(async (account) => {
//     //             return contract
//     //                 .connect(account)
//     //                 .setWhitelistFeatureActive(true);
//     //         });
//     //     });
//     //
//     //     describe("successfully", () => {
//     //         let tx: ContractTransaction;
//     //         let recipt: ContractReceipt;
//     //
//     //         beforeEach(async () => {
//     //             [tx, recipt] = await txExec(
//     //                 contract.connect(owner).setWhitelistFeatureActive(true)
//     //             );
//     //         });
//     //
//     //         it("Should emit event", async () => {
//     //             assertEvent<WhitelistActivityChangedEvent>(
//     //                 recipt,
//     //                 "WhitelistActivityChanged",
//     //                 {
//     //                     active: true,
//     //                 }
//     //             );
//     //         });
//     //
//     //         it("Should update state", async () => {
//     //             expect(await contract.getWhitelistFeatureActive()).to.be.equal(
//     //                 true
//     //             );
//     //         });
//     //     });
//     // });
//     //
//     // describe("Adding to whitelist", () => {
//     //     it("Should allow to execute only by owner", async () => {
//     //         await assertIsAvailableOnlyForOwner(async (account) => {
//     //             return contract
//     //                 .connect(account)
//     //                 .setAccountWhitelisted(alice.address, true);
//     //         });
//     //     });
//     //
//     //     describe("successfully", () => {
//     //         let tx: ContractTransaction;
//     //         let recipt: ContractReceipt;
//     //
//     //         beforeEach(async () => {
//     //             [tx, recipt] = await txExec(
//     //                 contract
//     //                     .connect(owner)
//     //                     .setAccountWhitelisted(alice.address, true)
//     //             );
//     //         });
//     //
//     //         it("Should emit event", async () => {
//     //             assertEvent<WhitelistAccountChangedEvent>(
//     //                 recipt,
//     //                 "WhitelistAccountChanged",
//     //                 {
//     //                     account: alice.address,
//     //                     active: true,
//     //                 }
//     //             );
//     //         });
//     //
//     //         it("Should update state", async () => {
//     //             expect(
//     //                 await contract.getAccountWhitelisted(alice.address)
//     //             ).to.be.equal(true);
//     //         });
//     //     });
//     // });
// });
