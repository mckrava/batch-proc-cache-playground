import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_} from "typeorm"
import {bigDecimalTransformer} from "./marshal"
import { Big as BigDecimal } from 'big.js'

@Entity_()
export class Token {
  constructor(props?: Partial<Token>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("text", {nullable: false})
  symbol!: string

  @Column_("text", {nullable: false})
  name!: string

  @Column_("int4", {nullable: false})
  decimals!: number

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  totalSupply!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  tradeVolume!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  tradeVolumeUSD!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  untrackedVolumeUSD!: BigDecimal

  @Column_("int4", {nullable: false})
  txCount!: number

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  totalLiquidity!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  derivedETH!: BigDecimal
}
