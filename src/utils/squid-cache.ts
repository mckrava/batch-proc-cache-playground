import type { FindOptionsRelations } from 'typeorm'
import { FindManyOptions, Store, EntityClass as EntityClassTypeOrm } from '@subsquid/typeorm-store'
import { Between, Not, In, FindOptionsWhere } from 'typeorm'
import assert from 'assert'

// import { FindOneOptions, EntityClass } from '@subsquid/typeorm-store';
import { BatchContext, SubstrateBlock } from '@subsquid/substrate-processor'
import { Entity } from '@subsquid/typeorm-store/src/store'
// import { FindManyOptions } from '@subsquid/typeorm-store/src/store'

export interface EntityClass<T = any> extends EntityClassTypeOrm<T> {
    id: string
    new (): T
}

interface EntityWithId {
    id: string
}

type CacheEntityParams = [EntityClass<EntityWithId>, FindOptionsRelations<EntityClass<EntityWithId>>]

class SquidCache {
    static instance: SquidCache

    private processorContext: BatchContext<Store, unknown> | null = null

    private entityRelationsParams = new Map<string, FindOptionsRelations<EntityClass>>()
    private entities = new Map<EntityClass, Map<string, EntityClass>>()

    private deferredGetList = new Map<EntityClass, Set<string>>()
    private deferredFindList = new Map<EntityClass, FindOptionsWhere<EntityClass>[]>()
    private deferredRemoveList = new Map<EntityClass, Set<string>>()

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
    init(ctx: BatchContext<Store, unknown>, entityRelationsParams: CacheEntityParams[]): void {
        this.processorContext = ctx
        for (const [entityClass, relationParams] of entityRelationsParams) {
            this.entityRelationsParams.set(entityClass.name, relationParams)
        }
    }

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
        const idsList = this.deferredGetList.get(entityConstructor) || new Set()

        for (const idItem of Array.isArray(idOrList) ? idOrList : [idOrList]) {
            idsList.add(idItem)
        }
        this.deferredGetList.set(entityConstructor, idsList)

        return this
    }

    /**
     * Add requests for find entities by "FindManyOptions" parameters.
     * Can be useful if user needs fetch list of entities by id with
     * additional check for "soft remove" flag (e.g. additional field
     * "deleted: true" or "active: false")
     */
    deferredFindWhere<T>(
        entityConstructor: EntityClass<T>,
        findOptions: FindOptionsWhere<T> | FindOptionsWhere<T>[]
    ): SquidCache {
        const whereOptions = Array.isArray(findOptions) ? findOptions : [findOptions]
        this.deferredFindList.set(entityConstructor, [
            ...(this.deferredFindList.get(entityConstructor) || []),
            ...whereOptions,
        ])
        return this
    }

    /**
     * Add ids of entities which should be removed, resolved after Cache.flush()
     * Keeps items as Map structure.
     * If item is added to the list for deferredRemove, it will be removed from local cache and won't be available for
     * Cache.get() method.
     */
    deferredRemove<T>(entityConstructor: EntityClass<T>, idOrList: string | string[]): SquidCache {
        const idsList = this.deferredRemoveList.get(entityConstructor) || new Set()

        for (const idItem of Array.isArray(idOrList) ? idOrList : [idOrList]) {
            idsList.add(idItem)
        }
        this.deferredRemoveList.set(entityConstructor, idsList)

        const cachedEntities = this.entities.get(entityConstructor) || new Map()
        let isIntersection = false
        idsList.forEach((defRemItemId) => {
            if (cachedEntities.has(defRemItemId)) {
                cachedEntities.delete(defRemItemId)
                isIntersection = true
            }
        })
        if (isIntersection) this.entities.set(entityConstructor, cachedEntities)
        return this
    }

    /**
     * Get entity by id form cache
     */
    get<T>(entityConstructor: EntityClass<T>, id: string): EntityClass<T> | null {
        return (this.entities.get(entityConstructor) || new Map()).get(id) || null
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
    upsert<T>(entityOrList: EntityClass<T> | EntityClass<T>[]): void {
        const entityClassConstructor = (Array.isArray(entityOrList) ? entityOrList[0] : entityOrList)
            .constructor as EntityClass<T>
        const existingEntities = this.entities.get(entityClassConstructor) || new Map<string, EntityClass<T>>()

        for (const item of Array.isArray(entityOrList) ? entityOrList : [entityOrList]) {
            existingEntities.set(item.id, item)
        }

        this.entities.set(entityClassConstructor, existingEntities)
    }

    /**
     * If there were upserts after Cache.load()
     */
    isDirty(): boolean {
        return this.deferredGetList.size > 0 || this.deferredFindList.size > 0
    }

    /**
     * Load all deferred get from the db, clear deferredGet and deferredFindList items list,
     * set loaded items to cache storage.
     */
    async load(): Promise<void> {
        assert(this.processorContext)

        for (const [entityClass, idsSet] of this.deferredGetList.entries()) {
            const entitiesList: typeof entityClass[] = await this.processorContext.store.find(entityClass, {
                where: { id: In([...idsSet.values()]) },
            })
            this.upsert(entitiesList)
        }

        for (const [entityClass, findOptionsList] of this.deferredFindList.entries()) {
            const entitiesList: typeof entityClass[] = await this.processorContext.store.find(entityClass, {
                where: findOptionsList,
            })
            this.upsert(entitiesList)
        }

        this.deferredGetList.clear()
        this.deferredFindList.clear()
        return Promise.resolve()
    }

    /**
     * Persist all updates to the db.
     */
    async flush(): Promise<void> {
        assert(this.processorContext)
        for (const entities of this.entities.values()) {
            await this.processorContext.store.save([...entities.values()])
        }
    }

    /**
     * Purge current cache.
     */
    purge(): void {
        this.entities.clear()
    }
}

export default SquidCache.getInstance()
