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

    @Column_('numeric', { nullable: false })
    dayAmountUSD!: string

    @Column_('numeric', { nullable: false })
    weekAmountUSD!: string

    @Column_('numeric', { nullable: false })
    monthAmountUSD!: string
}
