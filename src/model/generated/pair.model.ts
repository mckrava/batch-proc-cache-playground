import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, OneToMany as OneToMany_} from "typeorm"
import {Token} from "./token.model"
import {LiquidityPosition} from "./liquidityPosition.model"
import {TokenSwapEvent} from "./tokenSwapEvent.model"
import {bigDecimalTransformer} from "./marshal"
import { Big as BigDecimal } from 'big.js'

@Entity_()
export class Pair {
  constructor(props?: Partial<Pair>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("text", {nullable: false})
  token0Id!: string

  @Index_()
  @ManyToOne_(() => Token, {nullable: true})
  token0!: Token

  @Column_("text", {nullable: false})
  token1Id!: string

  @Index_()
  @ManyToOne_(() => Token, {nullable: true})
  token1!: Token

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  reserve0!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  reserve1!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  totalSupply!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  reserveETH!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  reserveUSD!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  trackedReserveETH!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  token0Price!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  token1Price!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  volumeToken0!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  volumeToken1!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  volumeUSD!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  untrackedVolumeUSD!: BigDecimal

  @Column_("int4", {nullable: false})
  txCount!: number

  @Column_("timestamp with time zone", {nullable: false})
  createdAtTimestamp!: Date

  @Column_("int4", {nullable: false})
  createdAtBlockNumber!: number

  @Column_("int4", {nullable: false})
  liquidityProviderCount!: number

  @OneToMany_(() => LiquidityPosition, e => e.pair)
  liquidityPositions!: LiquidityPosition[]

  @OneToMany_(() => TokenSwapEvent, e => e.pair)
  swaps!: TokenSwapEvent[]
}
