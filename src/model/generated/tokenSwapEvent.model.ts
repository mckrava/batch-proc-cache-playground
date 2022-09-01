import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import * as marshal from "./marshal"
import {Transaction} from "./transaction.model"
import {Pair} from "./pair.model"
import { Big as BigDecimal } from 'big.js'
import {Token} from "./token.model"
import {Pool} from "./pool.model"

@Entity_()
export class TokenSwapEvent {
  constructor(props?: Partial<TokenSwapEvent>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Index_()
  @ManyToOne_(() => Transaction, {nullable: true})
  transaction!: Transaction

  @Index_()
  @Column_("timestamp with time zone", {nullable: true})
  timestamp!: Date

  @Index_()
  @ManyToOne_(() => Pair, {nullable: true})
  pair!: Pair

  @Index_()
  @Column_("text", {nullable: true})
  pairId!: string

  @Index_()
  @ManyToOne_(() => Pool, {nullable: true})
  pool!: Pool

  @Index_()
  @Column_("text", {nullable: true})
  poolId!: string

  @Index_()
  @Column_("text", {nullable: false})
  buyer!: string

  @Index_()
  @ManyToOne_(() => Token, {nullable: true})
  tokenSold!: Token

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  soldAmount!: bigint

  @Index_()
  @ManyToOne_(() => Token, {nullable: true})
  tokenBought!: Token

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  boughtAmount!: bigint

  /**
   * BigDecimal
   */
  @Column_("numeric", {nullable: false, transformer: marshal.bigDecimalTransformer})
  amountUSD!: BigDecimal
}
