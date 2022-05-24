import { MarketConfig } from "@/MarketConfig";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { deployContract } from "./helpers/utils";

describe("Market configuration", () => {
    let owner: SignerWithAddress;

    let contract: MarketConfig;

    beforeEach(async () => {
        [owner] = await ethers.getSigners();

        contract = await deployContract<MarketConfig>(
            "MarketConfig",
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8
        );
    });

    it("Should expose proper configuration", async () => {
        expect(await contract.config()).to.be.eql([
            BigNumber.from(1),
            BigNumber.from(2),
            BigNumber.from(3),
            BigNumber.from(4),
            BigNumber.from(5),
            BigNumber.from(6),
            BigNumber.from(7),
            BigNumber.from(8),
        ]);
    });

    it("Should expose proper dispute price", async () => {
        expect(await contract.disputePrice()).to.be.equal(1);
    });

    it("Should expose proper dispute period", async () => {
        expect(await contract.disputePeriod()).to.be.equal(2);
    });

    it("Should expose proper verification period", async () => {
        expect(await contract.verificationPeriod()).to.be.equal(3);
    });

    it("Should expose proper burn fee", async () => {
        expect(await contract.burnFee()).to.be.equal(4);
    });

    it("Should expose proper foundation fee", async () => {
        expect(await contract.foundationFee()).to.be.equal(5);
    });

    it("Should expose proper revenue fee", async () => {
        expect(await contract.revenueFee()).to.be.equal(6);
    });

    it("Should expose proper market creation fee", async () => {
        expect(await contract.marketCreatorFee()).to.be.equal(7);
    });

    it("Should expose proper verification fee", async () => {
        expect(await contract.verificationFee()).to.be.equal(8);
    });

    it("Should expose proper feesSum sum", async () => {
        expect(await contract.feesSum()).to.be.equal(30);
    });
});
