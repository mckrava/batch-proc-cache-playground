import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_} from "typeorm"
import {bigDecimalTransformer} from "./marshal"
import { Big as BigDecimal } from 'big.js'

@Entity_()
export class Bundle {
  constructor(props?: Partial<Bundle>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: bigDecimalTransformer})
  ethPrice!: BigDecimal
}
