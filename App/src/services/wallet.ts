import { getLocalStorage } from "@stacks/connect";
import { NETWORK_NAME } from "../constants/network";

export function isStxAddressForNetwork(
  address: string,
  network: "mainnet" | "testnet" = NETWORK_NAME
) {
  const normalized = address.toUpperCase();
  return network === "mainnet"
    ? normalized.startsWith("SP") || normalized.startsWith("SM")
    : normalized.startsWith("ST") || normalized.startsWith("SN");
}

export function getConnectedStxAddress() {
  const addresses = getLocalStorage()?.addresses?.stx ?? [];
  return (
    addresses.find((entry) =>
      isStxAddressForNetwork(entry.address, NETWORK_NAME)
    )?.address ?? ""
  );
}
