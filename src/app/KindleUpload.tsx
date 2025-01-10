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

// Define TypeScript interfaces
interface KindleHighlight {
  title: string;
  author: string;
  highlight: string;
  location: string;
  timestamp: string;
}

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

  // Initialize IndexedDB
  useEffect(() => {
    const initDB = async () => {
      const request = indexedDB.open("KindleHighlightsDB", 1);

      request.onerror = () => {
        setUploadState((prev) => ({
          ...prev,
          error: "Failed to initialize database",
        }));
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("highlights")) {
          db.createObjectStore("highlights", {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      };
    };

    initDB();
  }, []);

  const parseKindleFile = (content: string): KindleHighlight[] => {
    // Basic parser for Kindle highlights
    const highlights: KindleHighlight[] = [];
    const sections = content.split("==========");

    sections.forEach((section) => {
      const lines = section.trim().split("\n");
      if (lines.length >= 4) {
        const titleAuthorMatch = lines[0].match(/(.*?)\((.*?)\)/);
        if (titleAuthorMatch) {
          highlights.push({
            title: titleAuthorMatch[1].trim(),
            author: titleAuthorMatch[2].trim(),
            highlight: lines[3].trim(),
            location: lines[1].split("|")[0].trim(),
            timestamp: lines[1].split("|")[1]?.trim() || "",
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
      const db = await openDB();
      const transaction = db.transaction("highlights", "readonly");
      const store = transaction.objectStore("highlights");
      const existingHighlights = await new Promise<any[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

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
      const request = indexedDB.open("KindleHighlightsDB", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  };

  const saveHighlights = async (
    highlights: KindleHighlight[],
    mode: "merge" | "overwrite"
  ) => {
    try {
      const db = await openDB();
      const transaction = db.transaction("highlights", "readwrite");
      const store = transaction.objectStore("highlights");

      if (mode === "overwrite") {
        await store.clear();
      } else {
        // Merge logic - get existing highlights
        const existing = await new Promise<any[]>((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        // Create a map of existing highlights by title for quick lookup
        const existingMap = new Map(existing.map((h) => [h.title, h]));

        // Filter out highlights that would be replaced
        highlights = highlights.filter((newHighlight) => {
          const existingHighlight = existingMap.get(newHighlight.title);
          return (
            !existingHighlight ||
            new Date(newHighlight.timestamp) >
              new Date(existingHighlight.timestamp)
          );
        });
      }

      // Add new highlights
      for (const highlight of highlights) {
        await store.add(highlight);
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
