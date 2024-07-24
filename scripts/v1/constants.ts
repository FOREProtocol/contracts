type ContractsAddresses = {
  protocolConfig: string;
  foreToken: string;
  marketLib: string;
  marketplace: string;
  foreVerifiers: string;
};

export const contractAddresses: Record<string, ContractsAddresses> = {
  arbitrum: {
    protocolConfig: "",
    foreToken: "",
    marketLib: "",
    marketplace: "",
    foreVerifiers: "",
  },
  arbitrumTestnet: {
    protocolConfig: "0x34AaD8FE478F4e6D75911b4A6F550e04F7fb19fD",
    foreToken: "0xe9e2889d515Fd4bF764Ea927Af13Aaf974Cde21E",
    marketLib: "0x86c1f2b95c7CA7059F0aD58A2fA908f92d2Faba1",
    marketplace: "0xF6Ad8855acd4967C64C1F65A3c1a50EBE0257dea",
    foreVerifiers: "0x84807Ad253c88d4F4F521bbFa4808eAB82a16a64",
  },
};
