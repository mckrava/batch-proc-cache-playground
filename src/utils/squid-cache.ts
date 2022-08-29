import type { FindOptionsRelations } from 'typeorm'
// import { FindOneOptions, EntityClass } from '@subsquid/typeorm-store';
import { BatchContext, SubstrateBlock } from '@subsquid/substrate-processor'
import { Store } from '@subsquid/typeorm-store'
import { FindManyOptions } from '@subsquid/typeorm-store/src/store'

export interface EntityClass<T = any> {
    new (): T
}

type CacheEntityParams = [EntityClass<T>, FindOptionsRelations<T>]

class SquidCache {
    static instance: SquidCache

    /**
     * Initialize cache entities Map and relations config for fetching data in
     * load method. Current relations config will be actual for all fetch actions.
     * Relations will be saved in cache storage like related entities IDs
     * (e.g. not "token: Token" but "tokenId: string" ) and related entities will
     * be added to the list for load in the same level as parent entity. In such case,
     * if same related entity is changed by some logic, this updated related entity will
     * be available for all parent entities automatically. During Cache.flush all relations
     * will be updated as whole cache will be pushed to DB.
     */
    init(ctx: BatchContext, entityParams: CacheEntityParams[]): void {}

    /**
     * Get initialized cache instance
     */
    static getInstance(): SquidCache {
        if (!this.instance) this.instance = new SquidCache()
        return this.instance
    }

    /**
     * Add ids of entities which should be loaded, resolved after Cache.load()
     * (keeps items as Map structure).
     * If idOrList === '*', fetch all available entities.
     */
    deferredGet(entityConstructor: EntityClass, idOrList: string | string[]): SquidCache {
        return this
    }

    /**
     * Add requests for find entities by "FindManyOptions" parameters.
     * Can be useful if user needs fetch list of entities by id with
     * additional check for "soft remove" flag (e.g. additional field
     * "deleted: true" or "active: false")
     */
    deferredFind(entityConstructor: EntityClass, options: FindManyOptions<EntityClass>): SquidCache {
        return this
    }

    /**
     * Add ids of entities which should be removed, resolved after Cache.flush()
     * Keeps items as Map structure.
     * If item is added to the list for deferredRemove, it will be removed from local cache and won't be available for
     * Cache.get() method.
     */
    deferredRemove(entityConstructor: EntityClass, idOrList: string | string[]): SquidCache {
        return this
    }

    /**
     * Get entity by id form cache
     */
    get(entityConstructor: EntityClass, id: string): EntityClass<T> | null {
        return null
    }

    /**
     * If there are unresolved gets
     */
    ready(): boolean {
        return false
    }

    /**
     * Set/update item in cache by id
     * (maybe id prop can be omitted as each entity must have id field)
     */
    upsert(entity: EntityClass<T> | EntityClass<T>[]): void {}

    /**
     * If there were upserts after Cache.load()
     */
    isDirty(): boolean {
        return false
    }

    /**
     * Load all deferred get from the db, clear deferredGet items list,
     * set loaded items to cache storage.
     */
    load(): Promise<void> {
        return Promise.resolve()
    }

    /**
     * Persist all updates to the db.
     */
    flush(): Promise<void> {
        return Promise.resolve()
    }

    /**
     * Purge current cache.
     */
    purge(): void {}
}

export default SquidCache.getInstance()
