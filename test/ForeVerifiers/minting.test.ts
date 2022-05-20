// import { ForeVerifiers, TransferEvent } from "@/ForeVerifiers";
// import { Block } from "@ethersproject/abstract-provider";
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
// xdescribe("ForeVerifiers / BaseNFT / Minting", () => {
//     let owner: SignerWithAddress;
//     let alice: SignerWithAddress;
//
//     let contract: ForeVerifiers;
//
//     beforeEach(async () => {
//         contract = await deployContract<ForeVerifiers>("ForeVerifiers");
//
//         [owner, alice] = await ethers.getSigners();
//     });
//
//     it("Should allow to execute mint only by owner", async () => {
//         await assertIsAvailableOnlyForOwner(async (account) => {
//             return contract.connect(account).mint(alice.address, {
//                 staked: ethers.utils.parseUnits("1", "ether"),
//                 penalty: 0,
//             });
//         });
//     });
//
//     describe("Should properly mint token", () => {
//         let tx: ContractTransaction;
//         let recipt: ContractReceipt;
//         let creationBlock: Block;
//
//         beforeEach(async () => {
//             [tx, recipt] = await txExec(
//                 contract.connect(owner).mint(alice.address, {
//                     staked: ethers.utils.parseUnits("1", "ether"),
//                     penalty: 10,
//                 })
//             );
//
//             creationBlock = await ethers.provider.getBlock("latest");
//         });
//
//         it("Should emit Transfer event", async () => {
//             assertEvent<TransferEvent>(recipt, "Transfer", {
//                 from: "0x0000000000000000000000000000000000000000",
//                 to: alice.address,
//                 tokenId: BigNumber.from(0),
//             });
//         });
//
//         it("Should return proper ownership", async () => {
//             const tokenOwner = await contract.ownerOf(0);
//             expect(tokenOwner).to.be.equal(alice.address);
//         });
//
//         it("Should return proper data", async () => {
//             const token = await contract.tokens(0);
//             expect(token.staked).to.be.equal(
//                 ethers.utils.parseUnits("1", "ether")
//             );
//             expect(token.penalty).to.be.equal(10);
//         });
//
//         it("Should return proper creation date", async () => {
//             expect(
//                 await contract.tokenCreatedAt(BigNumber.from(0))
//             ).to.be.equal(creationBlock.timestamp);
//         });
//     });
//
//     it("Should increase balances", async () => {
//         // check before
//         {
//             const balance = await contract.balanceOf(alice.address);
//             expect(balance).to.be.equal(0);
//
//             const totalSupply = await contract.totalSupply();
//             expect(totalSupply).to.be.equal(0);
//         }
//
//         // mint
//         const [tx, result] = await txExec(
//             contract.connect(owner).mint(alice.address, {
//                 staked: ethers.utils.parseUnits("1", "ether"),
//                 penalty: 10,
//             })
//         );
//
//         // check balance after
//         {
//             const balance = await contract.balanceOf(alice.address);
//             expect(balance).to.be.equal(1);
//
//             const totalSupply = await contract.totalSupply();
//             expect(totalSupply).to.be.equal(1);
//         }
//     });
// });
