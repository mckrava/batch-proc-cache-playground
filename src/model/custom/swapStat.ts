import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"

export enum SwapPeriod {
  DAY = 'Day',
  MONTH = 'Month',
  WEEK = 'Week',
}

@Entity_()
export class SwapStatPeriod {
  constructor(props?: Partial<SwapStatPeriod>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("timestamp with time zone", {nullable: false})
  from!: Date

  @Column_("timestamp with time zone", {nullable: false})
  to!: Date

  @Column_('int4', { nullable: false })
  swapsCount!: number

  @Column_('int4', { nullable: false })
  pairsCount!: number

  @Column_('int4', { nullable: false })
  usersCount!: number

  @Column_('numeric', { nullable: false, precision: 38, scale: 20 })
  totalAmountUSD!: string
}