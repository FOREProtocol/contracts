import { TokenIncentiveRegistry } from "@/TokenIncentiveRegistry";
import { deployContract } from "../helpers/utils";
import { ERC20 } from "@/ERC20";
import { expect } from "chai";

describe("Token Incentive Registry", function () {
    let contract: TokenIncentiveRegistry;
    let [usdc, token1, token2, token3, token4]: ERC20[] = [];

    beforeEach(async () => {
        usdc = await deployContract("ERC20", "USDC", "USDC");
        token1 = await deployContract("ERC20", "Token1", "Token1");
        token2 = await deployContract("ERC20", "Token2", "Token2");
        token3 = await deployContract("ERC20", "Token3", "Token3");
        token4 = await deployContract("ERC20", "Token4", "Token4");

        usdc.deployed();
        token1.deployed();
        token2.deployed();
        token3.deployed();

        contract = await deployContract("TokenIncentiveRegistry", [
            {
                tokenAddress: usdc.address,
                discountRate: 10,
            },
        ]);
    });

    describe("Initial values", () => {
        it("should add initial tokens", async () => {
            expect(await contract.isTokenEnabled(usdc.address)).to.eql(true);
            expect(await contract.getDiscountRate(usdc.address)).to.eql(10);
        });
    });

    describe("Registry", () => {
        describe("Add token", () => {
            beforeEach(async () => {
                await contract.addToken(token1.address, 10);
                await contract.addToken(token2.address, 10);
                await contract.addToken(token3.address, 10);
            });

            it("successfully", async () => {
                expect(await contract.isTokenEnabled(token1.address)).to.eq(
                    true
                );
                expect(await contract.isTokenEnabled(token2.address)).to.eq(
                    true
                );
                expect(await contract.isTokenEnabled(token3.address)).to.eq(
                    true
                );
            });

            it("should set discount rate", async () => {
                expect(await contract.getDiscountRate(token1.address)).to.eql(
                    10
                );
                expect(await contract.getDiscountRate(token2.address)).to.eql(
                    10
                );
                expect(await contract.getDiscountRate(token3.address)).to.eql(
                    10
                );
            });

            it("should revert when adding a token that has already been added", async () => {
                await expect(contract.addToken(token1.address, 10)).to.be
                    .reverted;
                await expect(contract.addToken(token2.address, 10)).to.be
                    .reverted;
            });

            it("should revert when adding a token with a discount rate of 0", async () => {
                await expect(contract.addToken(token4.address, 0)).to.be
                    .reverted;
            });
        });

        describe("Remove token", () => {
            beforeEach(async () => {
                await contract.addToken(token1.address, 10);
                await contract.addToken(token2.address, 10);
                await contract.addToken(token3.address, 10);

                await contract.removeToken(token1.address);
                await contract.removeToken(token2.address);
                await contract.removeToken(token3.address);
            });

            it("successfully", async () => {
                expect(await contract.isTokenEnabled(token1.address)).to.eq(
                    false
                );
                expect(await contract.isTokenEnabled(token2.address)).to.eq(
                    false
                );
                expect(await contract.isTokenEnabled(token3.address)).to.eq(
                    false
                );
            });

            it("should have a discount rate equal to 0", async () => {
                expect(await contract.getDiscountRate(token1.address)).to.eq(0);
                expect(await contract.getDiscountRate(token2.address)).to.eq(0);
                expect(await contract.getDiscountRate(token3.address)).to.eq(0);
            });

            it("should revert when removing an unregistered token", async () => {
                await expect(contract.removeToken(token4.address)).to.be
                    .reverted;
            });

            it("should able to add token again", async () => {
                expect(await contract.addToken(token1.address, 10));
                expect(await contract.isTokenEnabled(token1.address)).to.eq(
                    true
                );
            });
        });

        describe("Set incentives", () => {
            beforeEach(async () => {
                await contract.addToken(token1.address, 1);
                await contract.addToken(token2.address, 1);
                await contract.addToken(token3.address, 1);

                await contract.setDiscountRate(token1.address, 10);
                await contract.setDiscountRate(token2.address, 10);
                await contract.setDiscountRate(token3.address, 10);
            });

            it("should set discount rate", async () => {
                expect(
                    await contract.getDiscountRate(token1.address)
                ).to.be.eql(10);
                expect(
                    await contract.getDiscountRate(token2.address)
                ).to.be.eql(10);
                expect(
                    await contract.getDiscountRate(token3.address)
                ).to.be.eql(10);
            });
        });
    });
});
