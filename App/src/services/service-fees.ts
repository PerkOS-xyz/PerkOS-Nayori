import {
  Cl,
  ClarityType,
  fetchCallReadOnlyFunction,
  validateStacksAddress,
  type ClarityValue,
} from "@stacks/transactions";
import { NETWORK, NETWORK_NAME } from "../constants/network";
import {
  CONTRACT_ADDRESS,
  SBTC_COMMERCE_CONTRACT_NAME,
  STX_COMMERCE_CONTRACT_NAME,
  STX_COMMERCE_HAS_SERVICE_FEES,
  SBTC_COMMERCE_HAS_SERVICE_FEES,
} from "../constants/contract";
import type { Job } from "./agentic-commerce";

export type FeeAsset = "stx" | "sbtc";
export interface ServiceFeeState {
  treasury: string;
  gross: bigint;
  potentialFee: bigint;
  serviceRecorded: boolean;
  waiver?: string;
  settlement?: {
    gross: bigint;
    recipient: string;
    net: bigint;
    chargedFee: bigint;
    refundedFee: bigint;
  };
}
export type FeeDisclosure = {
  serviceFee?: ServiceFeeState;
  serviceFeeUnavailable?: boolean;
};
export const hasServiceFees = (asset: FeeAsset) =>
  asset === "stx"
    ? STX_COMMERCE_HAS_SERVICE_FEES
    : SBTC_COMMERCE_HAS_SERVICE_FEES;

const invalid = () =>
  new Error(
    "Could not verify the earned service fee policy. Refresh before signing."
  );
const tuple = (cv?: ClarityValue) => {
  if (cv?.type !== ClarityType.Tuple) throw invalid();
  return cv.value;
};
const response = (cv: ClarityValue) => {
  if (cv.type !== ClarityType.ResponseOk) throw invalid();
  return tuple(cv.value);
};
const uint = (cv?: ClarityValue) => {
  if (cv?.type !== ClarityType.UInt) throw invalid();
  const n = BigInt(cv.value);
  if (n < BigInt(0) || n > (BigInt(1) << BigInt(128)) - BigInt(1))
    throw invalid();
  return n;
};
const bool = (cv?: ClarityValue) => {
  if (cv?.type === ClarityType.BoolTrue) return true;
  if (cv?.type === ClarityType.BoolFalse) return false;
  throw invalid();
};
const principal = (
  cv: ClarityValue | undefined,
  network: "mainnet" | "testnet"
) => {
  if (
    cv?.type !== ClarityType.PrincipalStandard &&
    cv?.type !== ClarityType.PrincipalContract
  )
    throw invalid();
  const value = cv.value;
  const address = value.split(".")[0];
  if (
    !validateStacksAddress(address) ||
    !(network === "mainnet" ? /^(SP|SM)/ : /^(ST|SN)/).test(address)
  )
    throw invalid();
  return value;
};

/** Mirrors the candidate Clarity ABI; bigint arithmetic, never floating point. */
export function parseServiceFeeState(
  cv: ClarityValue,
  config: ClarityValue,
  job: Job,
  network: "mainnet" | "testnet"
): ServiceFeeState {
  if (!Number.isSafeInteger(job.budget) || job.budget < 0) throw invalid();
  const p = response(config);
  const f = response(cv);
  const treasury = principal(f.treasury, network);
  const gross = BigInt(job.budget);
  const potentialFee = uint(f["fee-amount"]);
  if (
    !bool(p.configured) ||
    uint(p["service-fee-bps"]) !== BigInt(200) ||
    uint(f["basis-points"]) !== BigInt(200) ||
    uint(p["review-window"]) !== BigInt(12) ||
    uint(p["appeal-window"]) !== BigInt(network === "mainnet" ? 144 : 3) ||
    treasury !== principal(p.treasury, network) ||
    treasury !== job.treasury ||
    potentialFee !== gross / BigInt(50) ||
    [
      job.client,
      job.provider,
      job.evaluator,
      job.appealAuthority,
      principal(p["appeal-authority"], network),
    ].includes(treasury)
  )
    throw invalid();
  const serviceRecorded = bool(f["service-recorded"]);
  if (serviceRecorded !== [3, 4, 7, 8].includes(job.status)) throw invalid();
  let waiver: string | undefined;
  if (f.waiver?.type === ClarityType.OptionalSome) {
    if (f.waiver.value.type !== ClarityType.Buffer) throw invalid();
    waiver = f.waiver.value.value;
    if (
      !/^[a-f\d]{64}$/i.test(waiver) ||
      /^0{64}$/.test(waiver) ||
      !serviceRecorded
    )
      throw invalid();
  } else if (f.waiver?.type !== ClarityType.OptionalNone) throw invalid();
  const state = { treasury, gross, potentialFee, serviceRecorded, waiver };
  if (f.settlement?.type === ClarityType.OptionalNone) {
    if (job.status === 3 || job.status === 4) throw invalid();
    return state;
  }
  if (f.settlement?.type !== ClarityType.OptionalSome) throw invalid();
  const s = tuple(f.settlement.value);
  const settlement = {
    gross: uint(s.gross),
    recipient: principal(s.recipient, network),
    net: uint(s.net),
    chargedFee: uint(s["charged-fee"]),
    refundedFee: uint(s["refunded-fee"]),
  };
  if (
    !serviceRecorded ||
    gross === BigInt(0) ||
    settlement.gross !== gross ||
    settlement.net + settlement.chargedFee !== gross ||
    (job.status !== 3 && job.status !== 4) ||
    settlement.recipient !== (job.status === 3 ? job.provider : job.client) ||
    settlement.chargedFee !==
      (waiver && settlement.chargedFee === BigInt(0)
        ? BigInt(0)
        : potentialFee) ||
    settlement.refundedFee > settlement.chargedFee ||
    (settlement.refundedFee !== BigInt(0) &&
      (!waiver || settlement.refundedFee !== settlement.chargedFee))
  )
    throw invalid();
  return { ...state, settlement };
}

export async function getJobServiceFee(
  job: Job,
  asset: FeeAsset
): Promise<ServiceFeeState> {
  if (!hasServiceFees(asset)) throw invalid();
  const read = (functionName: string, args: ClarityValue[] = []) =>
    fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName:
        asset === "stx"
          ? STX_COMMERCE_CONTRACT_NAME
          : SBTC_COMMERCE_CONTRACT_NAME,
      functionName,
      functionArgs: args,
      senderAddress: CONTRACT_ADDRESS,
      network: NETWORK,
    });
  const [fee, config] = await Promise.all([
    read("get-job-service-fee", [Cl.uint(job.id)]),
    read("get-protocol-config"),
  ]);
  return parseServiceFeeState(fee, config, job, NETWORK_NAME);
}

export function feeAcceptanceKey(
  job: Job & FeeDisclosure & { currency: FeeAsset },
  wallet: string
): string {
  const f = job.serviceFee;
  if (!f || job.serviceFeeUnavailable) return "";
  return [
    NETWORK_NAME,
    CONTRACT_ADDRESS,
    job.currency === "stx"
      ? STX_COMMERCE_CONTRACT_NAME
      : SBTC_COMMERCE_CONTRACT_NAME,
    job.currency,
    job.id,
    wallet,
    job.status,
    f.gross,
    f.potentialFee,
    f.treasury,
    f.waiver ?? "",
    "net-after-evaluation",
  ].join(":");
}

export function verifyFeeAction(
  snapshot: Job & FeeDisclosure & { currency: FeeAsset },
  fresh: Job & FeeDisclosure & { currency: FeeAsset },
  wallet: string,
  acceptedKey?: string
): void {
  const key = feeAcceptanceKey(fresh, wallet);
  if (
    !key ||
    snapshot.currency !== fresh.currency ||
    snapshot.id !== fresh.id ||
    key !== feeAcceptanceKey(snapshot, wallet) ||
    (acceptedKey !== undefined && key !== acceptedKey)
  )
    throw invalid();
}

export function formatFeeAmount(amount: bigint, asset: FeeAsset): string {
  const places = asset === "sbtc" ? 8 : 6;
  const unit = BigInt(10) ** BigInt(places);
  const fraction = (amount % unit)
    .toString()
    .padStart(places, "0")
    .replace(/0+$/, "");
  return `${amount / unit}${fraction ? `.${fraction}` : ""} ${asset === "sbtc" ? "sBTC" : "STX"}`;
}
