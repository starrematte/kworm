export class KVUtils {
    static async list<T>(kvInstance: Deno.Kv, keys: any[]) {
      const result = [];
      const entries = kvInstance.list<T>({
        prefix: keys,
      });
      for await (const entry of entries) {
        result.push(entry);
      }
      return result;
    }
  }