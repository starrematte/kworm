import { KWorm } from "./kworm.ts";

export type Relation<T> = {
    type: string;
    relationType: RelationType;
    deleteStrategy?: DeleteStrategyType;
    fetchStrategy?: FetchType;
    field: string;
    keys: string[];
};

export type EntityInfo = {
    type: new () => unknown;
    entityName: string;
    keys: string[];
    relations:
    | Relation<unknown>[]
    | undefined;
    hasRelations: boolean;
    autoCreateDateField: {
        field: string;
    } | undefined;
    autoUpdateDateField: {
        field: string;
    } | undefined;
};

export type FindOptions = { relationDeepness: number };

export type DeleteStrategyType = "CASCADE" | "NO_ACTION";
export type FetchType = "LAZY" | "EAGER";
export type RelationType = "MANY" | "ONE";

/**
 * defines the option to pass for KWorm
 */
export type KWormOptions = { name?: string; prefixEntityKeys: boolean };
export type KWormArgs = {
    kvInstance: Deno.Kv;
    entities: (new () => unknown)[];
    options?: KWormOptions;
};

export type Context = {
    registerEntity: (entity: EntityInfo) => void;
    entities: EntityInfo[];
    kWormInstances: {
        [k: string]: KWorm;
    };
};

