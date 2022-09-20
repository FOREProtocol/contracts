import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { utils, Contract } from "ethers";
import { getDeployedContract } from "../helpers/utils";
import { ForeNftMarketplace } from "@/ForeNftMarketplace";
import { ethers } from "hardhat";
import { ForeVerifiers } from "@/ForeVerifiers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();

    const foreToken: Contract = await getDeployedContract("ForeToken");

    await deploy("ForeVerifiers", {
        from: deployer,
        args: [],
        log: true,
    });

    const deployment = await deploy("ForeNftMarketplace", {
        from: deployer,
        args: [
            deployer,
            process.env.REVENUE_WALLET,
            foreToken.address,
            utils.parseEther("1"),
            utils.parseEther("1000000000"),
        ],
        log: true,
    });

    if (deployment.newlyDeployed) {
        const contract: ForeNftMarketplace = await getDeployedContract(
            "ForeNftMarketplace"
        );

        const foreVerifiers: ForeVerifiers = await getDeployedContract(
            "ForeVerifiers"
        );

        await contract.addCollection(
            foreVerifiers.address,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            1000,
            0
        );
    }
};
export default func;
func.tags = ["ForeNftMarketplace"];
