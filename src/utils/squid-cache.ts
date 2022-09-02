import { Store, EntityClass } from '@subsquid/typeorm-store'
import { In, FindOptionsWhere } from 'typeorm'
import assert from 'assert'
import { BatchContext } from '@subsquid/substrate-processor'

// import { FindManyOptions } from '@subsquid/typeorm-store/src/store'
// import type { FindOptionsRelations, FindOneOptions } from 'typeorm'
// import { FindOneOptions, EntityClass } from '@subsquid/typeorm-store';

type EntityLike = { id: string }

type EntityClassConstructable = EntityClass<EntityLike>

type CacheEntityParams =
    | EntityClassConstructable
    | [EntityClassConstructable, Record<keyof EntityClassConstructable, EntityClassConstructable>] // Inherited from FindOneOptions['loadRelationIds']['relations']

type UpsetEntityOrList<T extends EntityLike> = EntityClass<T> | EntityClass<T>[]

type CachedModel<T> = {
    [P in keyof T]: Exclude<T[P], null | undefined> extends EntityLike
        ? null | undefined extends T[P]
            ? string | null | undefined
            : string
        : T[P]
} &
    EntityLike

class SquidCache {
    static instance: SquidCache

    private processorContext: BatchContext<Store, unknown> | null = null

    private entityRelationsParams = new Map<EntityClassConstructable, Record<string, EntityClassConstructable> | null>()
    private entities = new Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>()

    private deferredGetList = new Map<EntityClassConstructable, Set<string>>()
    private deferredFindWhereList = new Map<EntityClassConstructable, FindOptionsWhere<EntityClassConstructable>[]>()
    private deferredRemoveList = new Map<EntityClassConstructable, Set<string>>()

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
        for (const paramsItem of entityRelationsParams) {
            if (Array.isArray(paramsItem)) {
                this.entityRelationsParams.set(paramsItem[0], paramsItem[1])
            } else {
                this.entityRelationsParams.set(paramsItem, null)
            }
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
    deferredGet<T extends EntityLike>(entityConstructor: EntityClass<T>, idOrList?: string | string[]): SquidCache {
        if (!idOrList) {
            this.deferredGetList.set(entityConstructor, new Set<string>().add('*'))
            return this
        }
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
    deferredFindWhere<T extends EntityLike>(
        entityConstructor: EntityClass<T>,
        findOptions: FindOptionsWhere<T> | FindOptionsWhere<T>[]
    ): SquidCache {
        const whereOptions = Array.isArray(findOptions) ? findOptions : [findOptions]
        this.deferredFindWhereList.set(entityConstructor, [
            ...(this.deferredFindWhereList.get(entityConstructor) || []),
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
    deferredRemove<T extends EntityLike>(entityConstructor: EntityClass<T>, idOrList: string | string[]): SquidCache {
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
    get<T extends EntityLike>(entityConstructor: EntityClass<T>, id: string): T | null {
        return (this.entities.get(entityConstructor) || new Map()).get(id) || null
    }

    /**
     * Get all entities of specific class.
     * Returns a new iterator object that contains the values for
     * each element in the Map object in insertion order.
     */
    getAll<T extends EntityLike>(entityConstructor: EntityClass<T>): IterableIterator<T> | [] {
        return (this.entities.get(entityConstructor) || new Map()).values() || null
    }

    /**
     * Check by ID if entity is existing in cache
     */
    has<T extends EntityLike>(entityConstructor: EntityClass<T>, id: string): boolean {
        return (this.entities.get(entityConstructor) || new Map()).has(id)
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
    upsert<T extends EntityLike>(entity: T): void
    upsert<T extends EntityLike>(entities: T[]): void
    upsert<T extends EntityLike>(entityOrList: T | T[]): void {
        if (Array.isArray(entityOrList) && entityOrList.length === 0) return

        const entityClassConstructor = (Array.isArray(entityOrList) ? entityOrList[0] : entityOrList)
            .constructor as EntityClass<T>
        const existingEntities = this.entities.get(entityClassConstructor) || new Map<string, CachedModel<T>>()

        for (const item of Array.isArray(entityOrList) ? entityOrList : [entityOrList]) {
            // @ts-ignore
            existingEntities.set(item.id, item)
        }

        this.entities.set(entityClassConstructor, existingEntities)
    }

    /**
     * If there were upsets after Cache.load()
     */
    isDirty(): boolean {
        return this.deferredGetList.size > 0 || this.deferredFindWhereList.size > 0
    }

    /**
     * Load all deferred get from the db, clear deferredGet and deferredFindWhereList items list,
     * set loaded items to cache storage.
     */
    async load(): Promise<void> {
        assert(this.processorContext)

        for (const [entityClass, findOptionsList] of this.deferredFindWhereList.entries()) {
            const entityRelationsOptions = this.entityRelationsParams.get(entityClass)

            const entitiesList = await this.processorContext.store.find(entityClass, {
                where: findOptionsList,
                ...(!!entityRelationsOptions && {
                    loadRelationIds: {
                        relations: Object.keys(entityRelationsOptions || {}) || [],
                    },
                }),
            })
            this.upsert(entitiesList)
        }

        for (const [entityClass, idsSet] of this.deferredGetList.entries()) {
            const entityRelationsOptions = this.entityRelationsParams.get(entityClass)

            /**
             * Fetch all available entities of iterated class.
             */
            if (idsSet.has('*')) {
                const entitiesList: CachedModel<typeof entityClass>[] = await this.processorContext.store.find(
                    entityClass
                )
                this.upsert(entitiesList)
                continue
            }

            /**
             * Filter items by "id" which are already fetched accordingly "deferredFindWhereList".
             * As result avoid duplicated fetch.
             */
            const filteredIds = [...idsSet.values()].filter(
                (id) => !(this.entities.get(entityClass) || new Set<string>()).has(id)
            )

            const entitiesList: CachedModel<typeof entityClass>[] = await this.processorContext.store.find(
                entityClass,
                {
                    where: { id: In(filteredIds) },
                    // @ts-ignore
                    ...(!!entityRelationsOptions && {
                        loadRelationIds: {
                            relations: Object.keys(entityRelationsOptions || {}) || [],
                        },
                    }),
                }
            )

            this.upsert(entitiesList)
        }

        /**
         * Separate list of relations from all deferredGet items for further load
         */
        const relationsEntitiesIdsMap = new Map<EntityClassConstructable, Set<string>>()

        /**
         * Collect entity relations IDs.
         */
        for (const [entityClass, entitiesMap] of this.entities.entries()) {
            const entityRelationsOptions = this.entityRelationsParams.get(entityClass)

            if (entitiesMap.size === 0 || !entityRelationsOptions) continue

            for (const entityItem of entitiesMap.values()) {
                for (const relationName in entityRelationsOptions) {
                    const relationEntityClass = entityRelationsOptions[relationName]
                    const relationEntityId = entityItem[relationName as keyof CachedModel<EntityClassConstructable>]
                    /**
                     * If entity is already loaded, we need avoid extra fetch.
                     */
                    if ((this.entities.get(relationEntityClass) || new Map()).has(relationEntityId)) continue

                    relationsEntitiesIdsMap.set(
                        relationEntityClass,
                        (relationsEntitiesIdsMap.get(relationEntityClass) || new Set()).add(relationEntityId)
                    )
                }
            }
        }

        if (relationsEntitiesIdsMap.size > 0) {
            /**
             * Fetch relations in this load flow is ignored and only one level of relations are supported.
             */
            for (const [entityClass, idsSet] of relationsEntitiesIdsMap.entries()) {
                const entitiesList: CachedModel<typeof entityClass>[] = await this.processorContext.store.find(
                    entityClass,
                    {
                        where: { id: In([...idsSet.values()]) },
                    }
                )

                this.upsert(entitiesList)
            }
        }

        this.deferredGetList.clear()
        this.deferredFindWhereList.clear()
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
