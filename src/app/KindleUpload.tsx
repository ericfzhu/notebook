import React, { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Merge, Replace } from "lucide-react";
import {
  KindleHighlight,
  getAllHighlights,
  putHighlight,
  clearStore,
  getHighlightsByBookId,
} from "./db-utils";

interface UploadState {
  isUploading: boolean;
  error: string | null;
  success: boolean;
}

const KindleUpload = () => {
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    error: null,
    success: false,
  });
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [newHighlights, setNewHighlights] = useState<KindleHighlight[]>([]);

  // Initialize IndexedDB with updated schema
  useEffect(() => {
    const initDB = async () => {
      const request = indexedDB.open("KindleHighlightsDB", 2); // Increment version for schema update

      request.onerror = () => {
        setUploadState((prev) => ({
          ...prev,
          error: "Failed to initialize database",
        }));
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Drop old store if exists
        if (db.objectStoreNames.contains("highlights")) {
          db.deleteObjectStore("highlights");
        }

        // Create new store with compound index
        const store = db.createObjectStore("highlights", { keyPath: "id" });

        // Create indexes for efficient querying
        store.createIndex("bookId", "bookId", { unique: false });
        store.createIndex("bookId_location", ["bookId", "location"], {
          unique: true,
        });
        store.createIndex("title", "title", { unique: false });
      };
    };

    initDB();
  }, []);

  // Generate a stable book ID from title and author
  const generateBookId = (title: string, author: string): string => {
    const str = `${title.toLowerCase()}|${author.toLowerCase()}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `book_${Math.abs(hash).toString(36)}`;
  };

  // Generate a stable highlight ID
  const generateHighlightId = (bookId: string, location: string): string => {
    return `highlight_${bookId}_${location.replace(/[^a-zA-Z0-9]/g, "")}`;
  };

  const parseKindleFile = (content: string): KindleHighlight[] => {
    const highlights: KindleHighlight[] = [];
    const sections = content.split("==========");

    sections.forEach((section) => {
      const lines = section.trim().split("\n");
      if (lines.length >= 4) {
        const titleAuthorMatch = lines[0].match(/(.*?)\((.*?)\)/);
        if (titleAuthorMatch) {
          const title = titleAuthorMatch[1].trim();
          const author = titleAuthorMatch[2].trim();
          const bookId = generateBookId(title, author);
          const location = lines[1].split("|")[0].trim();

          highlights.push({
            id: generateHighlightId(bookId, location),
            bookId,
            title,
            author,
            highlight: lines[3].trim(),
            location,
            timestamp: lines[1].split("|")[1]?.trim() || "",
            originalData: {
              title,
              author,
            },
            isEdited: false,
          });
        }
      }
    });

    return highlights;
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadState({ isUploading: true, error: null, success: false });

    try {
      const content = await file.text();
      const parsedHighlights = parseKindleFile(content);

      // Check if we have existing highlights
      const existingHighlights = await getAllHighlights();

      if (existingHighlights.length > 0) {
        setNewHighlights(parsedHighlights);
        setShowMergeDialog(true);
      } else {
        await saveHighlights(parsedHighlights, "overwrite");
      }
    } catch (error) {
      setUploadState({
        isUploading: false,
        error: "Failed to process file",
        success: false,
      });
    }
  };

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("KindleHighlightsDB", 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  };

  const saveHighlights = async (
    highlights: KindleHighlight[],
    mode: "merge" | "overwrite"
  ) => {
    try {
      if (mode === "overwrite") {
        await clearStore();
        for (const highlight of highlights) {
          await putHighlight(highlight);
        }
      } else {
        // Merge logic
        const existing = await getAllHighlights();
        const existingMap = new Map(existing.map((h) => [h.id, h]));

        for (const newHighlight of highlights) {
          const existingHighlight = existingMap.get(newHighlight.id);

          if (existingHighlight?.isEdited) {
            // Keep edited metadata but update highlight content
            newHighlight.title = existingHighlight.title;
            newHighlight.author = existingHighlight.author;
            newHighlight.isEdited = true;
            newHighlight.originalData = existingHighlight.originalData;
          }

          // Always update or add the highlight
          await putHighlight(newHighlight);
        }
      }

      setUploadState({
        isUploading: false,
        error: null,
        success: true,
      });
    } catch (error) {
      setUploadState({
        isUploading: false,
        error: "Failed to save highlights",
        success: false,
      });
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-4">
      <div className="space-y-4">
        <label className="block">
          <div className="flex items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-gray-300 border-dashed rounded-lg appearance-none cursor-pointer hover:border-gray-400 focus:outline-none">
            <div className="flex flex-col items-center space-y-2">
              <Upload className="w-6 h-6 text-gray-600" />
              <span className="text-sm text-gray-600">
                Upload Kindle Highlights File
              </span>
            </div>
            <input
              type="file"
              className="hidden"
              accept=".txt"
              onChange={handleFileUpload}
              disabled={uploadState.isUploading}
            />
          </div>
        </label>

        {uploadState.error && (
          <Alert variant="destructive">
            <AlertDescription>{uploadState.error}</AlertDescription>
          </Alert>
        )}

        {uploadState.success && (
          <Alert>
            <AlertDescription>Highlights saved successfully!</AlertDescription>
          </Alert>
        )}

        <AlertDialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Existing Highlights Found</AlertDialogTitle>
              <AlertDialogDescription>
                How would you like to handle the new highlights?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="space-x-2">
              <AlertDialogCancel onClick={() => setShowMergeDialog(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  saveHighlights(newHighlights, "merge");
                  setShowMergeDialog(false);
                }}
              >
                <Merge className="mr-2 h-4 w-4" />
                Merge with Existing
              </AlertDialogAction>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => {
                  saveHighlights(newHighlights, "overwrite");
                  setShowMergeDialog(false);
                }}
              >
                <Replace className="mr-2 h-4 w-4" />
                Overwrite Existing
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default KindleUpload;
