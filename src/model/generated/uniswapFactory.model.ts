import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_} from "typeorm"
import {bigDecimalTransformer} from "./marshal"
import { Big as BigDecimal } from 'big.js'

@Entity_()
export class UniswapFactory {
  constructor(props?: Partial<UniswapFactory>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("int4", {nullable: false})
  pairCount!: number

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  totalVolumeUSD!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  totalVolumeETH!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  untrackedVolumeUSD!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  totalLiquidityUSD!: BigDecimal

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  totalLiquidityETH!: BigDecimal

  @Column_("int4", {nullable: false})
  txCount!: number
}
