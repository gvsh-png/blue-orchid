/**
 * The repo's own lint rules, wired up and scoped per path in the root vite.config.ts.
 * Every message says how to fix the problem, because agents act on the message alone.
 * Import plugin helpers from vite-plus/lint/plugins so they match the bundled oxlint.
 */
import { definePlugin, defineRule, type ESTree } from "vite-plus/lint/plugins";

/** `Obj.prop` → "Obj.prop"; anything else → undefined. */
const memberPath = (node: ESTree.Node): string | undefined => {
  if (node.type !== "MemberExpression" || node.computed) {
    return undefined;
  }
  if (node.object.type !== "Identifier" || node.property.type !== "Identifier") {
    return undefined;
  }
  return `${node.object.name}.${node.property.name}`;
};

const ROOTS = "apps/tracker/{server,routes,crons,scripts} or packages/web/src/runtime.ts";

const noEffectRun = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        const path = memberPath(node);
        if (path === undefined) {
          return;
        }
        const [object = "", property = ""] = path.split(".");
        const forbidden =
          (object === "Effect" && (property.startsWith("run") || property === "provide")) ||
          (object === "Layer" && (property.startsWith("provide") || property === "launch")) ||
          object === "ManagedRuntime";
        if (!forbidden) {
          return;
        }
        context.report({
          node,
          message: `\`${path}\` runs or wires the app, which only ${ROOTS} may do. Leave the requirement in the Effect's type (R) and provide it in apps/tracker/server/AppLive.ts. Tests may provide layers.`,
        });
      },
    };
  },
});

const noThrow = defineRule({
  create(context) {
    return {
      ThrowStatement(node) {
        context.report({
          node,
          message:
            "Don't throw. Fail with a tagged error: `return yield* new MyError({ ... })`, with MyError defined with Schema.TaggedError (examples: packages/domain/src/errors.ts).",
        });
      },
    };
  },
});

const noTryCatch = defineRule({
  create(context) {
    return {
      TryStatement(node) {
        context.report({
          node,
          message:
            "Don't use try/catch. Wrap code that can throw in Effect.try or Effect.tryPromise, turn the failure into a tagged error, and handle it with Effect.catchTag.",
        });
      },
    };
  },
});

const asyncMessage =
  "Don't use async/await. Write an Effect with Effect.gen or Effect.fn and `yield*`; wrap Promise APIs with Effect.tryPromise.";

const noAsync = defineRule({
  create(context) {
    const checkFunction = (node: ESTree.Function | ESTree.ArrowFunctionExpression) => {
      if (node.async) {
        context.report({ node, message: asyncMessage });
      }
    };
    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      AwaitExpression(node) {
        context.report({ node, message: asyncMessage });
      },
      NewExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "Promise") {
          return;
        }
        context.report({ node, message: "Don't create Promises. Wrap callback APIs with Effect.callback." });
      },
    };
  },
});

const assertionMessage =
  "Don't cast with `as`. Decode unknown data with Schema.decodeUnknownEffect, narrow with a type guard, or fix the type where it is created. (`as const` and casts in *.test.ts files are allowed.)";

const noTypeAssertion = defineRule({
  create(context) {
    return {
      TSAsExpression(node) {
        const type = node.typeAnnotation;
        const isConst =
          type.type === "TSTypeReference" && type.typeName.type === "Identifier" && type.typeName.name === "const";
        if (!isConst) {
          context.report({ node, message: assertionMessage });
        }
      },
      TSTypeAssertion(node) {
        context.report({ node, message: assertionMessage });
      },
    };
  },
});

const noAny = defineRule({
  create(context) {
    return {
      TSAnyKeyword(node) {
        context.report({
          node,
          message:
            "Don't use `any`. Use `unknown` and narrow it (or decode it with Schema), or write the precise type.",
        });
      },
    };
  },
});

const preferEffectFn = defineRule({
  create(context) {
    return {
      ArrowFunctionExpression(node) {
        // Inline callbacks like it.effect("...", () => Effect.gen(...)) are fine.
        if (node.parent.type === "CallExpression" || node.params.length === 0) {
          return;
        }
        const body = node.body;
        if (body.type !== "CallExpression" || memberPath(body.callee) !== "Effect.gen") {
          return;
        }
        context.report({
          node,
          message:
            'Write functions that return an Effect with Effect.fn: `const name = Effect.fn("Area.name")(function* (arg) { ... })`. It adds a trace span and keeps one style.',
        });
      },
    };
  },
});

const serviceMessage =
  'Declare services one way: `class Name extends Context.Service<Name, { ... }>()("orchid/<package>/Name") {}` (example: packages/core/src/ports/Catalog.ts).';

const serviceStyle = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        const path = memberPath(node);
        if (path === "Context.Tag" || path === "Context.GenericTag" || path === "Effect.Service") {
          context.report({ node, message: serviceMessage });
        }
      },
      CallExpression(node) {
        if (memberPath(node.callee) !== "Context.Service") {
          return;
        }
        // The class form is `Context.Service<...>()("id")`: the inner call has no arguments.
        if (node.arguments.length > 0) {
          context.report({ node, message: serviceMessage });
          return;
        }
        const parent = node.parent;
        if (parent.type !== "CallExpression") {
          return;
        }
        const id = parent.arguments[0];
        if (id?.type === "Literal" && typeof id.value === "string" && !id.value.startsWith("orchid/")) {
          context.report({
            node,
            message: `Service id "${id.value}" must start with "orchid/<package>/", for example "orchid/core/Catalog".`,
          });
        }
      },
    };
  },
});

const schemaErrors = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        const path = memberPath(node);
        if (path !== "Data.TaggedError" && path !== "Data.Error") {
          return;
        }
        context.report({
          node,
          message:
            "Define errors with Schema.TaggedError so they can be encoded and logged (examples: packages/domain/src/errors.ts).",
        });
      },
    };
  },
});

const noJsonParse = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        if (memberPath(node) !== "JSON.parse") {
          return;
        }
        context.report({
          node,
          message:
            "Don't JSON.parse. Decode with a schema: `Schema.decodeUnknownEffect(Schema.fromJsonString(MySchema))(text)`, so bad input becomes a typed error (example: packages/chat-discord/src/interaction.ts).",
        });
      },
    };
  },
});

const timeMessage =
  "Read the time through Effect: `yield* DateTime.now`. Tests then control it with TestClock (example: packages/core/src/schedule/sync.test.ts).";

const timeThroughEffect = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        if (memberPath(node) === "Date.now") {
          context.report({ node, message: timeMessage });
        }
      },
      NewExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "Date" && node.arguments.length === 0) {
          context.report({ node, message: timeMessage });
        }
      },
    };
  },
});

const noProcessEnv = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        if (memberPath(node) !== "process.env") {
          return;
        }
        context.report({
          node,
          message:
            'Don\'t read process.env. Declare the value in apps/tracker/env.ts, read it with `import { env } from "void/env"` in apps/tracker/server/AppLive.ts, and pass it in as a service.',
        });
      },
    };
  },
});

/** Alchemy resources Void already creates for the app. */
const voidOwned = ["Cloudflare.Worker", "Cloudflare.Workers", "Cloudflare.Website", "Cloudflare.D1"];

const infraOwnsExtrasOnly = defineRule({
  create(context) {
    if (!context.filename.includes("/infra/")) {
      return {};
    }
    return {
      MemberExpression(node) {
        const path = memberPath(node);
        if (path === undefined || !voidOwned.includes(path)) {
          return;
        }
        context.report({
          node,
          message: `\`${path}\` is a resource Void owns. The app's Worker, D1, KV, R2, queues and crons belong to apps/tracker, and Void creates them on \`void deploy\`. Alchemy declares only what Void does not (see docs/internals/hosting.md).`,
        });
      },
    };
  },
});

export default definePlugin({
  meta: { name: "orchid" },
  rules: {
    "no-effect-run": noEffectRun,
    "no-throw": noThrow,
    "no-try-catch": noTryCatch,
    "no-async": noAsync,
    "no-type-assertion": noTypeAssertion,
    "no-any": noAny,
    "prefer-effect-fn": preferEffectFn,
    "service-style": serviceStyle,
    "schema-errors": schemaErrors,
    "no-json-parse": noJsonParse,
    "time-through-effect": timeThroughEffect,
    "no-process-env": noProcessEnv,
    "infra-owns-extras-only": infraOwnsExtrasOnly,
  },
});
