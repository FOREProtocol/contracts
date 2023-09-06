import { ForeToken } from "@/ForeToken";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContract } from "./helpers/utils";

describe("Fore ERC20 token", function () {
    let contract: ForeToken;

    beforeEach(async () => {
        contract = await deployContract("ForeToken");
    });

    describe("Initial values", () => {
        it("Should return proper name", async () => {
            expect(await contract.name()).to.equal("FORE Protocol");
        });

        it("Should return proper symbol", async () => {
            expect(await contract.symbol()).to.equal("FORE");
        });

        it("Should return proper intial supply", async () => {
            expect(await contract.totalSupply()).to.equal(
                ethers.utils.parseEther("1000000000")
            );
        });
    });
});
