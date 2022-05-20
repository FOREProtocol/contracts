// import { ForeNftMarketplace } from "@/ForeNftMarketplace";
// import { ForeVerifiers, TransferEvent } from "@/ForeVerifiers";
// import { ForeToken } from "@/ForeToken";
// import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
// import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import { BigNumber, ContractTransaction } from "ethers";
// import { ethers } from "hardhat";
// import { expect } from "chai";
// import {
//     assertEvent,
//     deployContract,
//     deployContractAs,
//     findEvent,
//     txExec,
// } from "../helpers/utils";
//
// xdescribe("NFTMarketplace / NFT integration", () => {
//     let owner: SignerWithAddress;
//     let admin: SignerWithAddress;
//     let treasury: SignerWithAddress;
//     let creator: SignerWithAddress;
//     let alice: SignerWithAddress;
//     let bob: SignerWithAddress;
//
//     let tokenContract: ForeToken;
//     let nftContract: ForeVerifiers;
//     let marketplaceContract: ForeNftMarketplace;
//
//     let ownerdNfts: Record<string, BigNumber[]>;
//
//     async function transferCoins(num: number, recipients: string[]) {
//         for (const recipient of recipients) {
//             const [tx, recipt] = await txExec(
//                 tokenContract
//                     .connect(owner)
//                     .transfer(
//                         recipient,
//                         ethers.utils.parseUnits(num.toString(), "ether")
//                     )
//             );
//         }
//     }
//
//     async function createTokens(num: number, recipients: string[]) {
//         for (let i = 0; i < num; ++i) {
//             const rIdx = i % recipients.length;
//             const recipient = recipients[rIdx];
//
//             const [tx, recipt] = await txExec(
//                 nftContract.connect(owner).mintWithPower(recipient, 100)
//             );
//
//             const mintEvent = findEvent<TransferEvent>(recipt, "Transfer");
//             if (!ownerdNfts[mintEvent.args.to]) {
//                 ownerdNfts[mintEvent.args.to] = [];
//             }
//
//             ownerdNfts[mintEvent.args.to].push(mintEvent.args.tokenId);
//         }
//     }
//
//     beforeEach(async () => {
//         [owner, admin, treasury, creator, alice, bob] =
//             await ethers.getSigners();
//
//         ownerdNfts = {};
//
//         tokenContract = await deployContract<ForeToken>("ForeToken");
//         nftContract = await deployContractAs<ForeVerifiers>(
//             creator,
//             "ForeVerifiers"
//         );
//         marketplaceContract = await deployContract<ForeNftMarketplace>(
//             "ForeNftMarketplace",
//             admin.address,
//             treasury.address,
//             tokenContract.address,
//             ethers.utils.parseUnits("0.0001", "ether"),
//             ethers.utils.parseUnits("1000", "ether")
//         );
//
//         await txExec(
//             marketplaceContract
//                 .connect(admin)
//                 .addCollection(
//                     nftContract.address,
//                     creator.address,
//                     "0x0000000000000000000000000000000000000000",
//                     0,
//                     2000
//                 )
//         );
//
//         await transferCoins(1e6, [alice.address, bob.address]);
//         await createTokens(5, [alice.address, bob.address]);
//
//         // allowance
//         await txExec(
//             tokenContract
//                 .connect(alice)
//                 .approve(
//                     marketplaceContract.address,
//                     ethers.utils.parseUnits("1000", "ether")
//                 )
//         );
//         await txExec(
//             tokenContract
//                 .connect(bob)
//                 .approve(
//                     marketplaceContract.address,
//                     ethers.utils.parseUnits("1000", "ether")
//                 )
//         );
//     });
//
//     describe("with tokens for sale", () => {
//         beforeEach(async () => {
//             await txExec(
//                 nftContract
//                     .connect(alice)
//                     .approve(
//                         marketplaceContract.address,
//                         ownerdNfts[alice.address][0]
//                     )
//             );
//
//             await txExec(
//                 marketplaceContract
//                     .connect(alice)
//                     .createAskOrder(
//                         nftContract.address,
//                         ownerdNfts[alice.address][0],
//                         ethers.utils.parseUnits("1", "ether")
//                     )
//             );
//         });
//
//         it("Should transfer coins from buyer", async () => {
//             await expect(() =>
//                 marketplaceContract
//                     .connect(bob)
//                     .buyTokenUsingWBNB(
//                         nftContract.address,
//                         ownerdNfts[alice.address][0],
//                         ethers.utils.parseUnits("1", "ether")
//                     )
//             ).to.changeTokenBalance(
//                 tokenContract,
//                 bob,
//                 ethers.utils.parseUnits("-1", "ether")
//             );
//         });
//
//         it("Should transfer coins to seller", async () => {
//             await expect(() =>
//                 marketplaceContract
//                     .connect(bob)
//                     .buyTokenUsingWBNB(
//                         nftContract.address,
//                         ownerdNfts[alice.address][0],
//                         ethers.utils.parseUnits("1", "ether")
//                     )
//             ).to.changeTokenBalance(
//                 tokenContract,
//                 alice,
//                 ethers.utils.parseUnits("0.8", "ether")
//             );
//         });
//
//         describe("Buys successfully", () => {
//             let tx: ContractTransaction;
//             let recipt: ContractReceipt;
//
//             beforeEach(async () => {
//                 [tx, recipt] = await txExec(
//                     marketplaceContract
//                         .connect(bob)
//                         .buyTokenUsingWBNB(
//                             nftContract.address,
//                             ownerdNfts[alice.address][0],
//                             ethers.utils.parseUnits("1", "ether")
//                         )
//                 );
//             });
//
//             it("Should emit Trade event", async () => {
//                 expect(tx)
//                     .to.emit(marketplaceContract, "Trade")
//                     .withArgs(
//                         nftContract.address,
//                         ownerdNfts[alice.address][0],
//                         alice.address,
//                         bob.address,
//                         ethers.utils.parseUnits("1", "ether"),
//                         ethers.utils.parseUnits("0.8", "ether"),
//                         false
//                     );
//             });
//
//             it("Should emit Transfer event", async () => {
//                 expect(tx)
//                     .to.emit(nftContract, "Transfer")
//                     .withArgs(
//                         marketplaceContract.address,
//                         bob.address,
//                         ownerdNfts[alice.address][0]
//                     );
//             });
//
//             it("Should increase pending revenue", async () => {
//                 expect(
//                     await marketplaceContract.pendingRevenue(creator.address)
//                 ).to.be.equal(ethers.utils.parseUnits("0.2", "ether"));
//             });
//
//             it("Should be able to claim pending revenue", async () => {
//                 await expect(() =>
//                     marketplaceContract.connect(creator).claimPendingRevenue()
//                 ).to.changeTokenBalance(
//                     tokenContract,
//                     creator,
//                     ethers.utils.parseUnits("0.2", "ether")
//                 );
//             });
//         });
//     });
// });
