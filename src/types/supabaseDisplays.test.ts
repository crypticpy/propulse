import { describe, expectTypeOf, it } from "vitest";
import type { Json, Tables, TablesInsert, TablesUpdate } from "./supabase";

describe("generated Display Wall database types", () => {
  it("exposes typed display rows and owner updates", () => {
    expectTypeOf<Tables<"displays">["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Tables<"displays">["scene_config"]>().toEqualTypeOf<Json>();
    expectTypeOf<TablesInsert<"displays">["device_token_hash"]>()
      .toEqualTypeOf<string>();
    expectTypeOf<TablesUpdate<"displays">["name"]>()
      .toEqualTypeOf<string | undefined>();
  });

  it("connects pairing codes to display ids", () => {
    expectTypeOf<Tables<"display_pairing_codes">["display_id"]>()
      .toEqualTypeOf<string>();
    expectTypeOf<TablesInsert<"display_pairing_codes">["expires_at"]>()
      .toEqualTypeOf<string>();
  });
});
