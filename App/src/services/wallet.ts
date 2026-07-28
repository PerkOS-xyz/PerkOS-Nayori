import { getLocalStorage } from "@stacks/connect";
import { NETWORK_NAME, NetworkName } from "../constants/network";

type StxAddressEntry = { address: string };

export function isStxAddressForNetwork(
  address: string,
  network: NetworkName = NETWORK_NAME
) {
  const normalized = address.toUpperCase();
  return network === "mainnet"
    ? normalized.startsWith("SP") || normalized.startsWith("SM")
    : normalized.startsWith("ST") || normalized.startsWith("SN");
}

export function selectStxAddressForNetwork(
  addresses: StxAddressEntry[],
  network: NetworkName = NETWORK_NAME
) {
  return (
    addresses.find((entry) =>
      isStxAddressForNetwork(entry.address, network)
    )?.address ?? ""
  );
}

export function getWalletNetworkState() {
  const addresses = getLocalStorage()?.addresses?.stx ?? [];
  const address = selectStxAddressForNetwork(addresses, NETWORK_NAME);
  return {
    address,
    mismatch: addresses.length > 0 && !address,
  };
}

export function getConnectedStxAddress() {
  return getWalletNetworkState().address;
}
