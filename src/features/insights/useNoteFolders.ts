"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/lib/auth";
import {
  buildFolderPath,
  deriveNoteFolderMaps,
  listFoldersInTreeOrder,
  optimisticAssignDraftFolder,
  type NoteFolderMaps,
  type NoteFolderWorkspace,
} from "@/lib/noteFolders";

/**
 * The folder workspace, name-keyed, plus the one mutation both the reader
 * panel and the Notes page need: filing a note into a folder.
 */
export function useNoteFolders(): NoteFolderMaps & {
  workspace: NoteFolderWorkspace | undefined;
  /** Folder names in tree order with depth, for pickers. */
  folderTree: Array<{ name: string; depth: number; path: string }>;
  folderPathFor: (draftId: string) => string;
  assignFolder: (draftId: string, folderName: string | null) => Promise<void>;
} {
  const { user } = useAuth();
  const workspace = useQuery(api.noteFolders.getWorkspace, user ? {} : "skip");
  const maps = useMemo(() => deriveNoteFolderMaps(workspace), [workspace]);
  const assignFolderMutation = useMutation(api.noteFolders.assignDraftFolder).withOptimisticUpdate(
    optimisticAssignDraftFolder
  );
  const folderTree = useMemo(
    () => listFoldersInTreeOrder(maps.folderNames, maps.folderParentMap),
    [maps.folderNames, maps.folderParentMap]
  );

  const folderPathFor = useCallback(
    (draftId: string) => buildFolderPath(maps.noteFolderMap[draftId] ?? "", maps.folderParentMap),
    [maps.noteFolderMap, maps.folderParentMap]
  );

  const assignFolder = useCallback(
    async (draftId: string, folderName: string | null) => {
      const folderId = folderName ? maps.folderIdByName.get(folderName) : undefined;
      if (folderName && !folderId) return;
      await assignFolderMutation({ draftId: draftId as Id<"insightDrafts">, folderId });
    },
    [assignFolderMutation, maps.folderIdByName]
  );

  return { ...maps, workspace, folderTree, folderPathFor, assignFolder };
}
