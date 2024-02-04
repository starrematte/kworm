import { assertExists, assertEquals } from "assert";
import { Entity, KWorm, context } from "../lib/kworm.ts";
{
  @Entity({
    entityName: "book",
    keys: ["id"],
    autoCreateDateField: {
      field: "createdAt",
    },
    autoUpdateDateField: {
      field: "updatedAt",
    },
  })
  class Book {
    id!: string
    name?: string
    createdAt?: Date
    updatedAt?: Date
  }

  @Entity({
    entityName: "user",
    keys: ["id"],
    relations: [
      {
        type: "Book",
        relationType: "MANY",
        deleteStrategy: "CASCADE",
        field: "books",
        keys: ["userId"],
      },
    ],
    autoCreateDateField: {
      field: "createdAt",
    },
    autoUpdateDateField: {
      field: "updatedAt",
    },
  })
  class User {
    id!: string;
    name?: string;
    books?: Book[];
    createdAt?: Date
    updatedAt?: Date
  }

  Deno.test({
    name: "KWorm", fn: async (t: Deno.TestContext) => {

      await t.step("context contains 2 entities", () => {
        assertEquals(context.entities.length, 2)
      });

      await t.step("context has User and Book entities statically registered", () => {
        assertEquals(context.entities, [
          {
            autoCreateDateField: {
              field: "createdAt",
            },
            autoUpdateDateField: {
              field: "updatedAt",
            },
            entityName: "book",
            hasRelations: false,
            keys: [
              "id",
            ],
            relations: undefined,
            type: Book,
          },
          {
            autoCreateDateField: {
              field: "createdAt",
            },
            autoUpdateDateField: {
              field: "updatedAt",
            },
            entityName: "user",
            hasRelations: true,
            keys: [
              "id",
            ],
            relations: [
              {
                deleteStrategy: "CASCADE",
                field: "books",
                keys: [
                  "userId",
                ],
                relationType: "MANY",
                type: "Book",
              },
            ],
            type: User,
          },
        ])
      });

      await t.step("KWorm initialised", async () => {
        const kv = await Deno.openKv("./kv-tests")
        const kworm = KWorm.init({ kvInstance: kv, entities: [User, Book] })

        await t.step("User and Book are registered entities into this instance", () => {
          assertEquals(kworm.getRegisteredEntities().length, 2)
          assertEquals(kworm.getRegisteredEntities().map(e => e.type), [User, Book])
        });

        await t.step("User repository exists", () => {
          const userRepo = kworm.getRepository(User)
          assertExists(userRepo)
        });

        await t.step("User entity", async () => {
          const userRepo = kworm.getRepository(User)
          const id = "1234"
          await t.step("User gets inserted with save", async () => {
            const userKeys = await userRepo.save({ id, name: "Denosaur" })
            assertEquals(userKeys, ["user", "1234"]);
          },);
          await t.step("User is findable with findByIds", async () => {
            const user = await userRepo.findByIds({ id })
            assertExists(user)
          },);
          await t.step("User gets deleted with delete", async () => {
            await userRepo.delete({ id })
            const user = await userRepo.findByIds({ id })
            assertEquals(user, null);
          });
        }
        );

        kworm.close()
        assertEquals(context.kWormInstances, {});

      })
    },
    sanitizeExit: false,
    sanitizeOps: false,
    sanitizeResources: false
  })
}