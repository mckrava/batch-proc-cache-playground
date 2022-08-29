import { BatchContext, EvmLogEvent, SubstrateBatchProcessor, SubstrateBlock } from '@subsquid/substrate-processor'
import * as factory from './types/abi/factory'
import * as pair from './types/abi/pair'
import * as swapFlashLoan from './types/abi/swapFlashLoan'
import { CHAIN_NODE, DAY_MS, FACTORY_ADDRESS, HOUR_MS, MONTH_MS, WEEK_MS } from './consts'
import { Store, TypeormDatabase } from '@subsquid/typeorm-store'
import {
    Pair,
    TokenSwapEvent,
    Swapper,
    SwapperType,
    UniswapFactory,
    Bundle,
    Token,
    LiquidityPosition,
    Transaction,
} from './model'
import { SwapStatPeriod, SwapPeriod } from './model/custom/swapStat'
import { Between, Not, In } from 'typeorm'
import { Big as BigDecimal } from 'big.js'
import { BaseMapper, EntityClass, EntityMap } from './mappers/baseMapper'
import { NewPairMapper } from './mappers/factory'
import { BurnMapper, MintMapper, SwapMapper, SyncMapper, TransferMapper } from './mappers/pairs'
import { TokenSwapMapper } from './mappers/swapFlashLoan'

const database = new TypeormDatabase()
const processor = new SubstrateBatchProcessor()
    .setBatchSize(200)
    .setBlockRange({ from: 199900 })
    .setDataSource({
        chain: CHAIN_NODE,
        archive: 'https://moonbeam.archive.subsquid.io/graphql',
    })
    .setTypesBundle('moonbeam')
    .addEvmLog(FACTORY_ADDRESS, {
        filter: [factory.events['PairCreated(address,address,address,uint256)'].topic],
    })
    .addEvmLog('*', {
        filter: [
            [
                pair.events['Transfer(address,address,uint256)'].topic,
                pair.events['Sync(uint112,uint112)'].topic,
                pair.events['Swap(address,uint256,uint256,uint256,uint256,address)'].topic,
                pair.events['Mint(address,uint256,uint256)'].topic,
                pair.events['Burn(address,uint256,uint256,address)'].topic,
            ],
        ],
    })
    .addEvmLog('0x8273De7090C7067f3aE1b6602EeDbd2dbC02C48f', {
        filter: [[swapFlashLoan.events['TokenSwap(address,uint256,uint256,uint128,uint128)'].topic]],
        range: { from: 1329660 },
    })
    .addEvmLog('0x09A793cCa9D98b14350F2a767Eb5736AA6B6F921', {
        filter: [[swapFlashLoan.events['TokenSwap(address,uint256,uint256,uint128,uint128)'].topic]],
        range: { from: 1298636 },
    })

processor.run(database, async (ctx) => {
    const mappers: BaseMapper<any>[] = []

    for (const block of ctx.blocks) {
        for (const item of block.items) {
            if (item.kind === 'event') {
                if (item.name === 'EVM.Log') {
                    await handleEvmLog(ctx, block.header, item.event).then((mapper) => {
                        if (mapper != null) mappers.push(mapper)
                    })
                }
            }
        }
    }

    const requests = new Map<EntityClass, Set<string>>()
    for (const mapper of mappers) {
        for (const [entityClass, ids] of mapper.getRequest()) {
            const oldRequest = requests.get(entityClass) || new Set()
            requests.set(entityClass, new Set([...oldRequest, ...ids]))
        }
    }

    const entities = new EntityMap()
    for (const [entityClass, ids] of requests) {
        const e: Map<string, any> = await ctx.store
            .find(entityClass, { where: { id: In([...ids]) } })
            .then((es) => new Map(es.map((e: any) => [e.id, e])))
        entities.set(entityClass, e)
    }
    entities.set(Token, await ctx.store.find(Token, {}).then((es) => new Map(es.map((e: any) => [e.id, e]))))

    for (const mapper of mappers) {
        await mapper.process(entities)
    }

    await ctx.store.save([...entities.get(UniswapFactory).values()])
    await ctx.store.save([...entities.get(Bundle).values()])
    await ctx.store.save([...entities.get(Token).values()])
    await ctx.store.save([...entities.get(Pair).values()])
    await ctx.store.save([...entities.get(LiquidityPosition).values()])
    await ctx.store.save([...entities.get(Transaction).values()])
    await ctx.store.save([...entities.get(TokenSwapEvent).values()])

    for (const [entityClass, entity] of entities) {
        ctx.log.info(`saved ${entity.size} ${entityClass.name}`)
    }

    const lastBlock = ctx.blocks[ctx.blocks.length - 1].header
    await updateTop(ctx, lastBlock)
})

const knownPairContracts: Set<string> = new Set()

async function isKnownPairContracts(store: Store, address: string) {
    const normalizedAddress = address.toLowerCase()
    if (knownPairContracts.has(normalizedAddress)) {
        return true
    } else if ((await store.countBy(Pair, { id: normalizedAddress })) > 0) {
        knownPairContracts.add(normalizedAddress)
        return true
    }
    return false
}

async function handleEvmLog(
    ctx: BatchContext<Store, unknown>,
    block: SubstrateBlock,
    event: EvmLogEvent
): Promise<BaseMapper<any> | undefined> {
    const contractAddress = event.args.address
    switch (contractAddress) {
        case FACTORY_ADDRESS:
            return await new NewPairMapper(ctx, block).parse(event)
        case '0x8273De7090C7067f3aE1b6602EeDbd2dbC02C48f'.toLowerCase():
        case '0x09A793cCa9D98b14350F2a767Eb5736AA6B6F921'.toLowerCase(): {
            return await new TokenSwapMapper(ctx, block).parse(event)
        }
        default:
            if (await isKnownPairContracts(ctx.store, contractAddress)) {
                switch (event.args.topics[0]) {
                    case pair.events['Transfer(address,address,uint256)'].topic:
                        return await new TransferMapper(ctx, block).parse(event)
                    case pair.events['Sync(uint112,uint112)'].topic:
                        return await new SyncMapper(ctx, block).parse(event)
                    case pair.events['Swap(address,uint256,uint256,uint256,uint256,address)'].topic:
                        return await new SwapMapper(ctx, block).parse(event)
                    case pair.events['Mint(address,uint256,uint256)'].topic:
                        return await new MintMapper(ctx, block).parse(event)
                    case pair.events['Burn(address,uint256,uint256,address)'].topic:
                        return await new BurnMapper(ctx, block).parse(event)
                }
            }
    }
}

const topUpdateInterval = 60 * 60 * 1000
let lastUpdateTopTimestamp: number | undefined

async function updateTop(ctx: BatchContext<Store, unknown>, block: SubstrateBlock) {
    if (lastUpdateTopTimestamp == null) {
        const swapStat = await ctx.store.findOneBy(SwapStatPeriod, { id: SwapPeriod.DAY })
        lastUpdateTopTimestamp = swapStat?.to.getTime() || -topUpdateInterval
    }

    if (block.timestamp < lastUpdateTopTimestamp + topUpdateInterval) return
    ctx.log.info('Updating top...')

    const swappers = new Map<string, Swapper>()

    const end = Math.floor(block.timestamp / HOUR_MS) * HOUR_MS

    const newSwapStat: Record<SwapPeriod, SwapStatPeriod> = {
        [SwapPeriod.DAY]: createSwapStat(SwapPeriod.DAY, end - DAY_MS, end),
        [SwapPeriod.WEEK]: createSwapStat(SwapPeriod.WEEK, Math.floor((end - WEEK_MS) / DAY_MS) * DAY_MS, end),
        [SwapPeriod.MONTH]: createSwapStat(SwapPeriod.MONTH, Math.floor((end - MONTH_MS) / DAY_MS) * DAY_MS, end),
    }

    const start = Math.min(...Object.values(newSwapStat).map((s) => s.from.getTime()))

    const swaps = await ctx.store.find(TokenSwapEvent, {
        where: { timestamp: Between(new Date(start), new Date(end)) },
    })

    for await (const TokenSwapEvent of swaps) {
        let user = swappers.get(TokenSwapEvent.buyer)
        if (user == null) {
            user = new Swapper({
                id: TokenSwapEvent.buyer,
                dayAmountUSD: '0',
                weekAmountUSD: '0',
                monthAmountUSD: '0',
                type: SwapperType.USER,
            })
            swappers.set(user.id, user)
        }

        let pair = swappers.get(TokenSwapEvent.pairId)
        if (pair == null) {
            pair = new Swapper({
                id: String(TokenSwapEvent.pairId),
                dayAmountUSD: '0',
                weekAmountUSD: '0',
                monthAmountUSD: '0',
                type: SwapperType.PAIR,
            })
            swappers.set(pair.id, pair)
        }

        if (TokenSwapEvent.timestamp.getTime() >= end - DAY_MS) {
            user.dayAmountUSD = BigDecimal(TokenSwapEvent.amountUSD).plus(user.dayAmountUSD).toFixed()
            pair.dayAmountUSD = BigDecimal(TokenSwapEvent.amountUSD).plus(pair.dayAmountUSD).toFixed()
            updateSwapStat(newSwapStat[SwapPeriod.DAY], TokenSwapEvent.amountUSD.toFixed())
        }

        if (TokenSwapEvent.timestamp.getTime() >= end - WEEK_MS) {
            user.weekAmountUSD = BigDecimal(TokenSwapEvent.amountUSD).plus(user.weekAmountUSD).toFixed()
            pair.weekAmountUSD = BigDecimal(TokenSwapEvent.amountUSD).plus(pair.weekAmountUSD).toFixed()
            updateSwapStat(newSwapStat[SwapPeriod.WEEK], TokenSwapEvent.amountUSD.toFixed())
        }

        if (TokenSwapEvent.timestamp.getTime() >= end - MONTH_MS) {
            user.monthAmountUSD = BigDecimal(TokenSwapEvent.amountUSD).plus(user.monthAmountUSD).toFixed()
            pair.monthAmountUSD = BigDecimal(TokenSwapEvent.amountUSD).plus(pair.monthAmountUSD).toFixed()
            updateSwapStat(newSwapStat[SwapPeriod.MONTH], TokenSwapEvent.amountUSD.toFixed())
        }
    }

    for (const swapper of swappers.values()) {
        if (swapper.type === SwapperType.PAIR) {
            if (BigDecimal(swapper.dayAmountUSD).gt(0)) newSwapStat[SwapPeriod.DAY].pairsCount += 1
            if (BigDecimal(swapper.weekAmountUSD).gt(0)) newSwapStat[SwapPeriod.WEEK].pairsCount += 1
            if (BigDecimal(swapper.monthAmountUSD).gt(0)) newSwapStat[SwapPeriod.MONTH].pairsCount += 1
        } else {
            if (BigDecimal(swapper.dayAmountUSD).gt(0)) newSwapStat[SwapPeriod.DAY].usersCount += 1
            if (BigDecimal(swapper.weekAmountUSD).gt(0)) newSwapStat[SwapPeriod.WEEK].usersCount += 1
            if (BigDecimal(swapper.monthAmountUSD).gt(0)) newSwapStat[SwapPeriod.MONTH].usersCount += 1
        }
    }

    await ctx.store.save(Object.values(newSwapStat))
    await ctx.store.remove(await ctx.store.findBy(Swapper, { id: Not(In([...swappers.keys()])) }))
    await ctx.store.save([...swappers.values()])

    lastUpdateTopTimestamp = block.timestamp

    ctx.log.info('Top updated.')
}

function updateSwapStat(swapStat: SwapStatPeriod, amountUSD: string) {
    swapStat.swapsCount += 1
    swapStat.totalAmountUSD = BigDecimal(amountUSD).plus(swapStat.totalAmountUSD).toFixed()
}

function createSwapStat(id: SwapPeriod, from: number, to: number) {
    return new SwapStatPeriod({
        id,
        from: new Date(from),
        to: new Date(to),
        swapsCount: 0,
        usersCount: 0,
        pairsCount: 0,
        totalAmountUSD: '0',
    })
}
