import { ForeMarket } from "@/ForeMarket";
import { ForeMarkets } from "@/ForeMarkets";
import { ForeToken } from "@/ForeToken";
import { ProtocolConfig } from "@/ProtocolConfig";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { attachContract, deployContract, txExec } from "./helpers/utils";

describe("ForeMarkets / Management", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let revenueWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreVerifiersContract: SignerWithAddress;
    let alice: SignerWithAddress;

    let foreToken: ForeToken;
    let protocolConfig: ProtocolConfig;
    let contract: ForeMarkets;

    beforeEach(async () => {
        [
            owner,
            foundationWallet,
            revenueWallet,
            highGuardAccount,
            marketplaceContract,
            foreVerifiersContract,
            alice,
        ] = await ethers.getSigners();

        foreToken = await deployContract<ForeToken>("ForeToken");

        protocolConfig = await deployContract<ProtocolConfig>(
            "ProtocolConfig",
            foundationWallet.address,
            revenueWallet.address,
            highGuardAccount.address,
            marketplaceContract.address,
            foreToken.address,
            foreVerifiersContract.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("20")
        );

        contract = await deployContract<ForeMarkets>(
            "ForeMarkets",
            protocolConfig.address
        );

        await txExec(foreToken.setFactory(contract.address));
    });

    describe("Initial state", () => {
        it("Should expose proper name", async () => {
            expect(await contract.name()).to.be.equal("Fore Markets");
        });

        it("Should expose proper symbol", async () => {
            expect(await contract.symbol()).to.be.equal("MFORE");
        });
    });

    describe("For non created token", () => {
        it("tokenURI() should revert", async () => {
            await expect(contract.tokenURI(1)).to.be.revertedWith(
                "Non minted token"
            );
        });
    });

    describe("Fore operator verification", () => {
        it("Should return false for sample account", async () => {
            expect(await contract.isForeOperator(alice.address)).to.be.equal(
                false
            );
        });

        it("Should return true for marketplace", async () => {
            expect(
                await contract.isForeOperator(marketplaceContract.address)
            ).to.be.equal(true);
        });

        it("Should return true for factory", async () => {
            expect(await contract.isForeOperator(contract.address)).to.be.equal(
                true
            );
        });
    });

    // creating market

    describe("With market created", () => {
        let marketContract: ForeMarket;

        beforeEach(async () => {
            const [tx, recipt] = await txExec(
                contract
                    .connect(alice)
                    .createMarket(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        alice.address,
                        ethers.utils.parseEther("2"),
                        ethers.utils.parseEther("1"),
                        1653327334588,
                        1653357334588
                    )
            );

            console.dir(recipt);

            // marketContract = await attachContract(
            //     "ForeMarket",
            //     marketContractAddress
            // );
        });

        it("Should return true while checking market is operator", async () => {
            expect(
                await contract.isForeOperator(marketContract.address)
            ).to.be.equal(true);
        });
    });
});
