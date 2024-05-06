import { ethers, upgrades } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const TokenIncentiveRegistry = await ethers.getContractFactory(
        "TokenIncentiveRegistry"
    );

    const initialTokens = [];

    console.log("Deploying TokenIncentiveRegistry...");
    const registry = await upgrades.deployProxy(
        TokenIncentiveRegistry,
        [initialTokens],
        {
            initializer: "initialize",
        }
    );

    console.log("TokenIncentiveRegistry deployed to:", registry.address);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
