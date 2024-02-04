export interface TransactionalOperation {

    transactionalOperation(
        fn: (atomicOperation: Deno.AtomicOperation) => Promise<void> | void,
    ): Promise<void>;
}
