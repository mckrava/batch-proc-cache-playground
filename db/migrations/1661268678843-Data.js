module.exports = class Data1661268678843 {
  name = 'Data1661268678843'

  async up(db) {
    await db.query(`CREATE INDEX "IDX_3446160413d94205556988ca5a" ON "token_swap_event" ("timestamp") `)
    await db.query(`CREATE INDEX "IDX_4195a16a3b81bd81e8aa610b79" ON "token_swap_event" ("buyer") `)
  }

  async down(db) {
    await db.query(`DROP INDEX "public"."IDX_3446160413d94205556988ca5a"`)
    await db.query(`DROP INDEX "public"."IDX_4195a16a3b81bd81e8aa610b79"`)
  }
}
