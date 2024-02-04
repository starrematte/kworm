import { KVUtils } from "./kv-utils.ts";
import { KWorm } from "./kworm.ts";
import { Repository } from "./repository.ts";
import { EntityInfo, FindOptions, Relation } from "./types.ts";
import { RelationLoadChain } from "./relation-load-chain.ts";

export class RelationLoader {
  
    public static objectHasRelationNeededKeys(
      relationKeys: string[],
      objectKeys: string[],
    ) {
      return relationKeys.filter((rk) => objectKeys.includes(rk)).length ===
        relationKeys.length;
    }
  
    public static async deleteRelationship(
      object: unknown,
      relation: Relation<unknown>,
      kWormInstance: KWorm,
      atomicOperation: Deno.AtomicOperation,
    ) {
      const registeredEntity = kWormInstance.getRegisteredEntities()
        .find((re) => re.type.name === relation.type)!;
      const entityKeys = Repository.getEntityKeys(object, registeredEntity, kWormInstance)
      switch (relation.deleteStrategy) {
        case "CASCADE":
          if (relation.relationType == "MANY") {
            const list = await KVUtils.list<typeof relation.type>(
              kWormInstance.getKvInstance(),
              entityKeys,
            );
            for (const e of list) {
              await this.deleteRelationships(
                e.value,
                registeredEntity,
                kWormInstance,
                atomicOperation,
              );
              atomicOperation.delete(e.key);
            }
          } else {
            const entity = await kWormInstance.getKvInstance().get(
              entityKeys,
            );
            await this.deleteRelationships(
              entity.value,
              registeredEntity,
              kWormInstance,
              atomicOperation,
            );
            atomicOperation.delete(entityKeys);
          }
          break;
        case "NO_ACTION":
        default:
          break;
      }
    }
  
    public static async deleteRelationships(
      object: any,
      entityInfo: EntityInfo,
      kWormInstance: KWorm,
      atomicOperation: Deno.AtomicOperation,
    ) {
      if (entityInfo.hasRelations) {
        const existentEntryFields = Object.keys(object as any);
        const foundRelations = entityInfo.relations!.filter((r) =>
          r.keys.filter((rk) => existentEntryFields.includes(rk)).length ===
          r.keys.length
        );
        for (const foundRel of foundRelations) {
          await this.deleteRelationship(
            object,
            foundRel,
            kWormInstance,
            atomicOperation,
          );
        }
      }
    }
  
    public static async loadRelationship(
      kWormInstance: KWorm,
      object: any,
      relation: Relation<unknown>,
      relationLoadChain: RelationLoadChain,
    ): Promise<void> {
      let result: any = undefined;
      const registeredRelationEntity = kWormInstance.getRegisteredEntities()
        .find((re) => re.type.name === relation.type)!;
      const entityKeys = Repository.getEntityKeys(object, registeredRelationEntity, kWormInstance)
      switch (relation.relationType) {
        case "MANY": {
          result = [];
          const entries = kWormInstance.getKvInstance().list({
            prefix: entityKeys,
          });
          for await (const entry of entries) {
            result.push(entry.value);
          }
          break;
        }
        case "ONE": {
          const entry = await kWormInstance.getKvInstance().get(entityKeys);
          result = entry.value;
          break;
        }
      }
      relationLoadChain?.incrementCurrentDeepness();
      if (
        !relationLoadChain?.hasReachedMaxDeepness()
      ) {
        if (Array.isArray(result)) {
          for (const res of result) {
            await this.loadRelationships(
              kWormInstance,
              res,
              registeredRelationEntity,
              relationLoadChain,
            );
          }
        } else {
          await this.loadRelationships(
            kWormInstance,
            result,
            registeredRelationEntity,
            relationLoadChain,
          );
        }
      }
      relationLoadChain?.restartCurrentDeepness();
      (object as any)[relation.field] = result;
    }
  
    public static async loadRelationships(
      kWormInstance: KWorm,
      object: any,
      entitiyInfo: EntityInfo,
      relationLoadChain: RelationLoadChain,
    ) {
      const registeredEntity = kWormInstance.getRegisteredEntities().find((
        e,
      ) => e.type == entitiyInfo.type)!;
      const relations = registeredEntity.relations || [];
      const objectKeys = Object.keys(object);
      for (const relation of relations) {
        if (relation.fetchStrategy === "LAZY") {
          Object.defineProperty(object, relation.field, {
            get: () => {
              if (
                !(relation.field in object) &&
                RelationLoader.objectHasRelationNeededKeys(
                  relation.keys,
                  objectKeys,
                )
              ) {
                // deno-lint-ignore no-async-promise-executor
                return new Promise(async (resolve, _reject) => {
                  await this.loadRelationship(
                    kWormInstance,
                    object,
                    relation,
                    relationLoadChain,
                  );
                  resolve(object[relation.field]);
                });
              }
              return object[relation.field];
            },
          });
        } /* if (relation.fetchStrategy == "EAGER") */ else {
          const objectHasRelationKeys = RelationLoader
            .objectHasRelationNeededKeys(
              relation.keys,
              objectKeys,
            );
          if (objectHasRelationKeys) {
            await this.loadRelationship(
              kWormInstance,
              object,
              relation,
              relationLoadChain,
            );
          }
        }
      }
    }
  
    public static async loadAllRelationships<T>(
      kWormInstance: KWorm,
      object: T,
      entityInfo: EntityInfo,
      options?: FindOptions,
    ) {
      const relationLoadChain = new RelationLoadChain(options?.relationDeepness);
      if (!object) {
        return;
      }
      await this.loadRelationships(
        kWormInstance,
        object,
        entityInfo,
        relationLoadChain,
      );
    }
  }