import { KWormInitError } from "./errors.ts";
import { Repository } from "./repository.ts";
import { Context, DeleteStrategyType, EntityInfo, FetchType, KWormArgs, KWormOptions, RelationType } from "./types.ts";

/**
 * This is the main context that holds all the information about entities loaded by the `@Entity` decorator and a list of KV instances registered with `KWorm.init(...)`
 */
export const context: Context = {
  entities: [],
  kWormInstances: {},
  registerEntity(entity: EntityInfo) {
    this.entities.push(entity);
  },
};

/**
 * A class that represents a KWorm instance for a single KV db.
 * If you are planning to use multiple KV databases, you must init a new KWorm instance
 */
export class KWorm {
  private name!: string;
  private kvInstance!: Deno.Kv;
  private entities!: EntityInfo[];
  private repositories!: { [k: string]: Repository<unknown> };
  private options: KWormOptions;

  static init(args: KWormArgs) {
    return new this(args);
  }
  /**
   * closes the underlying `Deno.Kv` instance
   */
  close() {
    this.kvInstance.close()
    delete context.kWormInstances[this.name]
  }
  private constructor(
    { kvInstance, entities, options }: KWormArgs,
  ) {
    options = options ?? { prefixEntityKeys: false } as KWormOptions;
    if (!options.name) {
      options.name = crypto.randomUUID();
    }
    if (context.kWormInstances[options.name]) {
      throw new KWormInitError(
        `'${options.name}' a KWorm instance under this name already exists in context`,
        {
          cause: "name duplication for this new KWorm instance",
        },
      );
    }
    this.options = options;
    this.kvInstance = kvInstance;
    this.repositories = this.buildRepositories(entities);
    this.entities = entities.map((e) => {
      const loadedEntity = context.entities.find((ce) => e === ce.type);
      if (!loadedEntity) {
        throw new KWormInitError(
          `'${e.name}' entity not found in context`,
          {
            cause: "this class is not decorated with '@Entity' decorator",
          },
        );
      }
      return loadedEntity;
    });
    this.name = options.name
    context.kWormInstances[options.name] = this;
  }

  public getKvInstance() {
    return this.kvInstance;
  }

  public getRegisteredEntities() {
    return this.entities;
  }

  public getRepository<T>(type: new () => T) {
    return this.repositories[type.name] as Repository<T>;
  }

  public getOptions() {
    return this.options;
  }

  private buildRepositories(entities: (new () => unknown)[]) {
    return entities.reduce(
      (prev, curr) => {
        const foundEntity = context.entities.find((e) =>
          e.type.name === curr.name
        );
        if (!foundEntity) {
          throw new KWormInitError(
            `'${curr.name}' entity not found in context`,
            {
              cause: "this class is not decorated with '@Entity' decorator",
            },
          );
        }
        return {
          ...prev,
          [curr.name]: new Repository<typeof curr>(
            foundEntity,
            this,
          ),
        };
      },
      {},
    );
  }

  /* private enrichEntitiesWithLazyLoadTraps(
    entities: (new () => any)[],
  ) {
    const thisInstance = this;
    return entities.forEach((entity) => {
      entity.prototype.constructor = new Proxy(entity, {
        construct(
          targetClass: any,
          constructorArgArray: any[],
        ) {
          const instance = new targetClass(...constructorArgArray);
          const registeredEntity = context.entities.find((e) =>
            e.type == targetClass
          )!;
          const lazyRelations = registeredEntity.relations?.filter((r) =>
            r.fetchStrategy == "LAZY"
          ) ||
            [];
          for (const lazyRel of lazyRelations) {
            const objectKeys = Object.keys(instance);
            Object.defineProperty(instance, lazyRel.field, {
              get: () => {
                if (
                  !(lazyRel.field in instance) &&
                  RelationLoader.objectHasRelationNeededKeys(
                    lazyRel.keys,
                    objectKeys,
                  )
                ) {
                  // deno-lint-ignore no-async-promise-executor
                  return new Promise(async (resolve, reject) => {
                    await thisInstance.getRelationLoader().loadRelationship(
                      instance,
                      lazyRel,
                    );
                    resolve(instance[lazyRel.field]);
                  });
                }
                return instance[lazyRel.field];
              },
            });
          }
          return instance;
        },
      });
    });
  } */
}

export function Entity(decoratorTarget: {
  /**
   * the array of field keys that define an unique record of this entity
   */
  keys: string[];
  /**
   * the entity name is used for storing keys 
   */
  entityName?: string;
  /**
   * the relation to load for this `@Entity`
   */
  relations?: {
    /**
     * the stringified type class (e.g. `"User"` for `class User {}`)
     */
    type: string;
    /**
     * determines if this is a `MANY`, so has many entities with this key or `ONE`. 
     * You must define it has a `Array<relClazz>` while using it with `MANY`
     */
    relationType: RelationType;
    /**
     * which strategy to apply to the relation when this `@Entity` gets deleted
     */
    deleteStrategy?: DeleteStrategyType;
    /**
     * which strategy to apply to the relation's relations when loading this `@Entity`
     */
    fetchStrategy?: FetchType;
    /**
     * which field is used on this `@Entity` for this relation
     */
    field: string;
    /**
     * the array of field keys on this `@Entity` that must be used for loading this relation
     */
    keys: string[];
  }[];
  /**
   * the option for auto setting the insert date (supports only `Date`)
   */
  autoCreateDateField?: {
    /**
     * the field to use for this insert date
     */
    field: string;
  };
  /**
   * the option for auto setting the update date field (supports only `Date`)
   */
  autoUpdateDateField?: {
    /**
     * the field to use for this update date
     */
    field: string;
  };
}) {
  return function (...args: any[]) {
    const [Class] = args;
    context.registerEntity({
      type: Class,
      entityName: decoratorTarget.entityName ?? Class.name,
      keys: decoratorTarget.keys,
      relations: decoratorTarget.relations,
      hasRelations: decoratorTarget.relations !== undefined &&
        decoratorTarget.relations.length > 0,
      autoCreateDateField: decoratorTarget.autoCreateDateField,
      autoUpdateDateField: decoratorTarget.autoUpdateDateField,
    });
    return Class;
  };
}
