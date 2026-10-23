// Test-only: lets Node (with --experimental-strip-types) import our .ts sources, which use extensionless
// relative imports like "./prompt" (resolved by the Next.js bundler in the app).
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try {
          return await next(specifier, context);
        } catch (err) {
          const relative = specifier.startsWith("./") || specifier.startsWith("../");
          if (relative && !/\\.[cm]?[jt]s$/.test(specifier)) return next(specifier + ".ts", context);
          throw err;
        }
      }
    `)
);
