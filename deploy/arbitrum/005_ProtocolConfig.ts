import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract, ethers } from "ethers";
import { getDeployedContract } from "../helpers/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();

    const foreToken: Contract = await getDeployedContract("ForeToken");
    const marketplace: Contract = await getDeployedContract(
        "ForeNftMarketplace"
    );
    const foreVerifiers: Contract = await getDeployedContract("ForeVerifiers");

    await deploy("ProtocolConfig", {
        from: deployer,
        args: [
            process.env.REVENUE_WALLET,
            process.env.HIGH_GUARD_WALLET,
            marketplace.address,
            foreToken.address,
            foreVerifiers.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("1000"),
        ],
        log: true,
    });
};
export default func;
func.tags = [
    "ProtocolConfig",
    "ForeToken",
    "ForeNftMarketplace",
    "ForeVerifiers",
];
