import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import schema from "../../convex/betterAuth/schema";

const modules = import.meta.glob("../../convex/betterAuth/**/*.ts");

export function register(t: TestConvex<SchemaDefinition<GenericSchema, boolean>>, name = "betterAuth") {
  t.registerComponent(name, schema, modules);
}

const betterAuthTest = { register };
export default betterAuthTest;
