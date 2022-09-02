import { ZERO_BD } from '../consts'
import { convertTokenToDecimal } from '../utils/helpers'
import SquidCache from '../utils/squid-cache'

import { Token } from '../model'

import * as ERC20 from '../types/abi/erc20'
import { BaseMapper, EntityMap } from '../mappers/baseMapper'

export async function getOrCreateToken(this: BaseMapper<unknown>, tokenId: string): Promise<Token> {
    // let token = entities.get(Token).get(tokenId)
    let token = SquidCache.get(Token, tokenId)
    if (token != null) return token

    // token = await this.ctx.store.get(Token, tokenId)
    // if (token != null) {
    //     entities.get(Token).set(tokenId, token)
    //     return token
    // }

    const erc20 = new ERC20.Contract(this.ctx, this.block, tokenId)

    const name = await erc20.name()
    const symbol = await erc20.symbol()
    const decimals = await erc20.decimals()
    const totalSupply = await erc20.totalSupply()

    token = new Token({
        id: tokenId.toLowerCase(),
        symbol,
        name,
        totalSupply: convertTokenToDecimal(totalSupply.toBigInt(), decimals),
        decimals,
        derivedETH: ZERO_BD,
        tradeVolume: ZERO_BD,
        tradeVolumeUSD: ZERO_BD,
        untrackedVolumeUSD: ZERO_BD,
        totalLiquidity: ZERO_BD,
        txCount: 0,
    })
    // entities.get(Token).set(tokenId, token)
    SquidCache.upsert(token)

    return token
}
