import { expect } from "chai";
import { ethers } from "hardhat";

const initialSupply = ethers.BigNumber.from(
    ethers.utils.parseEther("1000000000")
);

describe("ForeToken", function () {
    it("Should be burnable", async function () {
        const ForeTokenArtifact = await ethers.getContractFactory("ForeToken");
        const foretoken = await ForeTokenArtifact.deploy();
        await foretoken.deployed();

        expect(await foretoken.totalSupply()).to.equal(initialSupply);

        const burnTx = await foretoken.burn(initialSupply);
        await burnTx.wait();

        expect(await foretoken.totalSupply()).to.equal(
            ethers.BigNumber.from("0")
        );
    });
});
