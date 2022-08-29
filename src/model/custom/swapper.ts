import { Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_ } from 'typeorm'

export enum SwapperType {
    PAIR = 'Pair',
    USER = 'User',
}

@Entity_()
export class Swapper {
    constructor(props?: Partial<Swapper>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Column_('varchar', { length: 5, nullable: false })
    type!: SwapperType

    @Column_('numeric', { nullable: false, precision: 38, scale: 20 })
    dayAmountUSD!: string

    @Column_('numeric', { nullable: false, precision: 38, scale: 20 })
    weekAmountUSD!: string

    @Column_('numeric', { nullable: false, precision: 38, scale: 20 })
    monthAmountUSD!: string
}
