import { BigNumber } from "ethers";

export const MaxAllowanceTransferAmount = BigNumber.from(
    "0xffffffffffffffffffffffffffffffffffffffff"
);

export const PERMIT_DETAILS = [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
];

export const PERMIT_TYPES = {
    PermitSingle: [
        { name: "details", type: "PermitDetails" },
        { name: "spender", type: "address" },
        { name: "sigDeadline", type: "uint256" },
    ],
    PermitDetails: PERMIT_DETAILS,
};
