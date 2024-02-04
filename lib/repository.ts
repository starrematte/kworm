import { KWormDeleteError, KWormFindError, KWormSetError } from "./errors.ts";
import { KWorm } from "./kworm.ts";
import { EntityInfo, FindOptions } from "./types.ts";
import { RelationLoader } from "./relation-loader.ts";


export class Repository<T> {
  constructor(
    private entityInfo: EntityInfo,
    private kWormInstance: KWorm,
  ) { }

  public static getEntityKeys(object: any, entityInfo: EntityInfo, kWormInstance: KWorm) {
    const toAddKeysAsPrefix = kWormInstance.getOptions().prefixEntityKeys;
    return [
      entityInfo.entityName,
      ...(toAddKeysAsPrefix
        ? entityInfo.keys.flatMap((k) => [k, object[k]])
        : entityInfo.keys.map((k) => object[k])),
    ];
  }

  public async transactionalOperation(
    fn: (atomicOperation: Deno.AtomicOperation) => Promise<void> | void,
  ) {
    const atomicOperation = this.kWormInstance.getKvInstance().atomic();
    await fn(atomicOperation);
    await atomicOperation.commit();
  }

  public async save(object: T | T[]): Promise<any[] | any[][]> {
    const dataToSave = Array.isArray(object) ? object : [object];
    const result: any[][] | any[] = [];
    await this.transactionalOperation(async (atomicOperation) => {
      for (let data of dataToSave) {
        const unsetKeys = this.entityInfo.keys.filter((k) =>
          !((data as any)[k])
        );
        if (unsetKeys.length) {
          throw new KWormSetError(
            `object is missing key values [${unsetKeys.join(",")}]`,
          );
        }

        if (this.entityInfo.hasRelations) {
          const unwantedFields = this.entityInfo.relations!.map((k) => k.field);
          data = Object.keys(data as any).filter((k) =>
            !unwantedFields.includes(k)
          ).reduce(
            (prev, curr) => ({ ...prev, [curr]: (data as any)[curr] }),
            {},
          ) as T;
        }

        const entityKeys = Repository.getEntityKeys(data, this.entityInfo, this.kWormInstance)

        const alreadyExistentData = await this.kWormInstance.getKvInstance()
          .get(
            entityKeys,
          );

        if (alreadyExistentData.value) {
          if (this.entityInfo.hasRelations) {
            const relationsWithDeletedKeysOnDataToSave = this.entityInfo
              .relations!.filter(
                (r) => {
                  r.keys.filter((k) =>
                    (alreadyExistentData.value as any)[k] !==
                    (data as any)[k] &&
                    ((data as any)[k] === undefined ||
                      (data as any)[k] === null)
                  )
                    .length > 0;
                },
              );
            for (const relation of relationsWithDeletedKeysOnDataToSave) {
              await RelationLoader.deleteRelationship(
                alreadyExistentData.value,
                relation,
                this.kWormInstance,
                atomicOperation,
              );
            }
          }
        }

        const entityAutoUpdateDateField = this.entityInfo.autoUpdateDateField;
        if (entityAutoUpdateDateField && alreadyExistentData.value) {
          (data as any)[entityAutoUpdateDateField.field] = new Date();
        }
        const entityAutoCreateDateField = this.entityInfo.autoCreateDateField;
        if (entityAutoCreateDateField) {
          (data as any)[entityAutoCreateDateField.field] =
            alreadyExistentData.value
              ? (alreadyExistentData.value as any)[
              entityAutoCreateDateField.field
              ]
              : new Date();
        }

        atomicOperation.set(entityKeys, data);

        result.push(entityKeys);
      }
    });

    return result.length == 1 ? result[0] : result;
  }

  public async delete(
    object: T | T[],
  ): Promise<void> {
    const dataToDelete = Array.isArray(object) ? object : [object];
    const result: any[][] | any[] = [];
    await this.transactionalOperation(async (atomicOperation) => {
      for (const data of dataToDelete) {
        const unsetKeys = this.entityInfo.keys.filter((k) =>
          !((data as any)[k])
        );
        if (unsetKeys.length) {
          throw new KWormDeleteError(
            `object is missing key values [${unsetKeys.join(",")}]`,
          );
        }

        const entityKeys = Repository.getEntityKeys(data, this.entityInfo, this.kWormInstance)

        const entityFound = await this.kWormInstance.getKvInstance().get<T>(
          entityKeys,
        );

        if (!entityFound.value) {
          throw new KWormDeleteError(
            `entity not found for keys [${entityKeys.join(",")}]`,
          );
        }

        atomicOperation.delete(entityKeys);

        result.push(entityKeys);

        await RelationLoader.deleteRelationships(
          entityFound.value,
          this.entityInfo,
          this.kWormInstance,
          atomicOperation,
        );
      }
    });
  }

  public async findAll(
    options: FindOptions = { relationDeepness: 1 },
  ): Promise<T[]> {
    const entityKeys = [
      this.entityInfo.entityName,
    ];
    const entries = this.kWormInstance.getKvInstance().list({
      prefix: entityKeys,
    });
    const loadedEntities: T[] = [];
    for await (const entry of entries) {
      const entryValue = entry.value as T;
      await RelationLoader.loadAllRelationships(
        this.kWormInstance,
        entryValue,
        this.entityInfo,
        options,
      );
      loadedEntities.push(entryValue);
    }
    return loadedEntities;
  }

  public async findByIds(
    object: T,
    options: FindOptions = { relationDeepness: 1 },
  ): Promise<T> {
    const unsetKeys = this.entityInfo.keys.filter((k) => !((object as any)[k]));
    if (unsetKeys.length) {
      throw new KWormFindError(
        `object is missing key values [${unsetKeys.join(",")}]`,
      );
    }

    const entityKeys = Repository.getEntityKeys(object, this.entityInfo, this.kWormInstance)

    const foundData = await this.kWormInstance.getKvInstance().get(
      entityKeys,
    );

    await RelationLoader.loadAllRelationships(
      this.kWormInstance,
      foundData.value,
      this.entityInfo,
      options,
    );

    return foundData.value as T;
  }
}