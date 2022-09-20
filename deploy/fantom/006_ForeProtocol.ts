import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";
import { getDeployedContract } from "../helpers/utils";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();

    const protocolConfig: Contract = await getDeployedContract(
        "ProtocolConfig"
    );

    const deployment = await deploy("ForeProtocol", {
        from: deployer,
        args: [protocolConfig.address],
        log: true,
    });

    if (deployment.newlyDeployed) {
        const foreToken: ForeToken = await getDeployedContract("ForeToken");

        const foreVerifiers: ForeVerifiers = await getDeployedContract(
            "ForeVerifiers"
        );

        await foreToken.setProtocol(deployment.address);
        await foreVerifiers.setProtocol(deployment.address);
    }
};
export default func;
func.tags = [
    "ForeProtocol",
    "ProtocolConfig",
    "ForeToken",
    "ForeNftMarketplace",
    "ForeVerifiers",
];
