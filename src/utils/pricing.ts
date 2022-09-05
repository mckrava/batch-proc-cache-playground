import { ZERO_BD, ONE_BD } from '../consts'
import { Big as BigDecimal } from 'big.js'
import { getOrCreateToken } from '../entities/token'
import { Pair } from '../model'
import { BaseMapper, EntityMap } from '../mappers/baseMapper'
import assert from 'assert'
import SquidCache from './squid-cache'

export const WGLMR_ADDRESS = '0xAcc15dC74880C9944775448304B263D191c6077F'.toLowerCase() //Replace with wrapped glint
export const WGLMR_USDC_ADDRESS = '0xb929914B89584b4081C7966AC6287636F7EfD053'.toLowerCase() //replace with wglint usdc LP address
export const USDC = '0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b'.toLowerCase() // replace with USDC address

export const WHITELIST: string[] = [
    '0xcd3B51D98478D53F4515A306bE565c6EebeF1D58'.toLowerCase(), //GLINT
    '0xAcc15dC74880C9944775448304B263D191c6077F'.toLowerCase(), //WGLMR
    '0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b'.toLowerCase(), //USDC
]

export async function getEthPriceInUSD(this: BaseMapper<unknown>): Promise<BigDecimal> {
    let usdcPair = SquidCache.get(Pair, WGLMR_USDC_ADDRESS)
    if (usdcPair == null) {
        // TODO refactor extra load
        usdcPair = (await this.ctx.store.get(Pair, WGLMR_USDC_ADDRESS)) || null
        assert(usdcPair != null)
        SquidCache.upsert(usdcPair)
    }

    // console.log(`usdcPair ${usdcPair.token0Price}, ${usdcPair.token1Price}`)
    return usdcPair.token0Id === USDC ? usdcPair.token0Price : usdcPair.token1Price
}

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
export const MINIMUM_USD_THRESHOLD_NEW_PAIRS = new BigDecimal(3000)

// minimum liquidity for price to get tracked
export const MINIMUM_LIQUIDITY_THRESHOLD_ETH = new BigDecimal(5)

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (plus stablecoin estimates)
 **/
export async function findEthPerToken(this: BaseMapper<unknown>, tokenId: string): Promise<BigDecimal> {
    if (tokenId === WGLMR_ADDRESS) return ONE_BD

    // loop through whitelist and check if paired with any
    for (let i = 0; i < WHITELIST.length; i++) {
        let pair = [...SquidCache.values(Pair)].find((p) => {
            return (
                (p.token0Id === WHITELIST[i] && p.token1Id === tokenId) ||
                (p.token1Id === WHITELIST[i] && p.token0Id === tokenId)
            )
        })
        if (pair == null) {
            // TODO refactor extra load
            pair = await this.ctx.store.get(Pair, {
                where: [
                    {
                        token0Id: WHITELIST[i],
                        token1Id: tokenId,
                    },
                    {
                        token0Id: tokenId,
                        token1Id: WHITELIST[i],
                    },
                ],
            })
            if (pair != null) {
                // entities.get(Pair).set(pair.id, pair)
                SquidCache.upsert(pair)
            } else {
                continue
            }
        }

        if (pair.reserveETH.lte(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) continue

        if (pair.token0Id === tokenId) {
            const token1 = await getOrCreateToken.call(this, pair.token1Id)
            return pair.token1Price.mul(token1.derivedETH) // return token1 per our token * Eth per token 1
        }
        if (pair.token1Id === tokenId) {
            const token0 = await getOrCreateToken.call(this, pair.token0Id)
            return pair.token0Price.mul(token0.derivedETH) // return token0 per our token * ETH per token 0
        }
    }
    return ZERO_BD // nothing was found return 0
}
