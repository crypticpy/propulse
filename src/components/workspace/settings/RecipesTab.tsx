import { useState } from "react";
import { Button } from "@/components/station-ui";
import { RECIPES } from "@/lib/workspace/recipes";
import { getRegistryEntry } from "@/lib/workspace/registry";
import { useActiveWorkspace, useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Starter pages (#657, recipes A/B from #655's `lib/workspace/recipes.ts`).
 * A recipe roams with the operator (epic #652 decision 2 — pages themselves
 * pin to the workspace, recipes do not): choosing one here seeds a brand new
 * page from that recipe's layout for this workspace's canvas type, and from
 * that moment it is an ordinary page the operator can edit in PagesTab or
 * WidgetsTab. `addRecipePage` runs the same `autoDock` refusal check
 * `addWidget` does, so a recipe that somehow doesn't fit this canvas is
 * refused honestly rather than partially applied.
 */
export function RecipesTab() {
  const workspace = useActiveWorkspace();
  const addRecipePage = useWorkspaceStore((s) => s.addRecipePage);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="su-stack workspace-settings-recipes">
      {message && <p className="su-hint">{message}</p>}
      {RECIPES.map((recipe) => {
        const layout = workspace.canvasType === "phone" ? [] : recipe.layouts[workspace.canvasType];
        const titles = layout.map((id) => getRegistryEntry(id)?.title ?? id);
        return (
          <div key={recipe.id} className="workspace-settings-recipe-card">
            <p className="workspace-add-widget-row-title">{recipe.title}</p>
            <p className="su-hint">{titles.length > 0 ? titles.join(" · ") : "Not available on this canvas."}</p>
            <Button
              variant="primary"
              disabled={workspace.canvasType === "phone"}
              onClick={() => {
                const result = addRecipePage(recipe.id);
                setMessage(result.ok ? `Added as a new page: "${recipe.title}".` : result.reason);
              }}
            >
              ADD AS A NEW PAGE
            </Button>
          </div>
        );
      })}
    </div>
  );
}
