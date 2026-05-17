import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import {
  Swap as SwapEvent,
  LiquidityAdded as LiquidityAddedEvent,
  LiquidityRemoved as LiquidityRemovedEvent,
} from "../generated/AMMPool/AMMPool";
import { Swap, LiquidityEvent, Pool } from "../generated/schema";

const POOL_ID = "1";
const WEI = BigDecimal.fromString("1000000000000000000");

function getOrCreatePool(): Pool {
  let pool = Pool.load(POOL_ID);
  if (!pool) {
    pool = new Pool(POOL_ID);
    pool.reserveA = BigDecimal.zero();
    pool.reserveB = BigDecimal.zero();
    pool.totalSwaps = BigInt.zero();
    pool.totalVolumeA = BigDecimal.zero();
    pool.totalVolumeB = BigDecimal.zero();
    pool.updatedAt = BigInt.zero();
  }
  return pool;
}

export function handleSwap(event: SwapEvent): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  const swap = new Swap(id);

  swap.user = event.params.user;
  swap.tokenIn = event.params.tokenIn;
  swap.amountIn = event.params.amountIn.toBigDecimal().div(WEI);
  swap.amountOut = event.params.amountOut.toBigDecimal().div(WEI);
  swap.timestamp = event.block.timestamp;
  swap.blockNumber = event.block.number;
  swap.transactionHash = event.transaction.hash;
  swap.save();

  const pool = getOrCreatePool();
  pool.totalSwaps = pool.totalSwaps.plus(BigInt.fromI32(1));
  pool.totalVolumeA = pool.totalVolumeA.plus(swap.amountIn);
  pool.updatedAt = event.block.timestamp;
  pool.save();
}

export function handleLiquidityAdded(event: LiquidityAddedEvent): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  const liqEvent = new LiquidityEvent(id);

  liqEvent.type = "ADD";
  liqEvent.provider = event.params.provider;
  liqEvent.amountA = event.params.amountA.toBigDecimal().div(WEI);
  liqEvent.amountB = event.params.amountB.toBigDecimal().div(WEI);
  liqEvent.lpAmount = event.params.lpMinted.toBigDecimal().div(WEI);
  liqEvent.timestamp = event.block.timestamp;
  liqEvent.blockNumber = event.block.number;
  liqEvent.transactionHash = event.transaction.hash;
  liqEvent.save();

  const pool = getOrCreatePool();
  pool.reserveA = pool.reserveA.plus(liqEvent.amountA);
  pool.reserveB = pool.reserveB.plus(liqEvent.amountB);
  pool.updatedAt = event.block.timestamp;
  pool.save();
}

export function handleLiquidityRemoved(event: LiquidityRemovedEvent): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  const liqEvent = new LiquidityEvent(id);

  liqEvent.type = "REMOVE";
  liqEvent.provider = event.params.provider;
  liqEvent.amountA = event.params.amountA.toBigDecimal().div(WEI);
  liqEvent.amountB = event.params.amountB.toBigDecimal().div(WEI);
  liqEvent.lpAmount = event.params.lpBurned.toBigDecimal().div(WEI);
  liqEvent.timestamp = event.block.timestamp;
  liqEvent.blockNumber = event.block.number;
  liqEvent.transactionHash = event.transaction.hash;
  liqEvent.save();

  const pool = getOrCreatePool();
  pool.reserveA = pool.reserveA.minus(liqEvent.amountA);
  pool.reserveB = pool.reserveB.minus(liqEvent.amountB);
  pool.updatedAt = event.block.timestamp;
  pool.save();
}
