import React, { useState, useEffect } from "react";
import { Edit2, Save, X, ChevronDown, ChevronUp } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface KindleTitle {
  id?: number;
  title: string;
  author: string;
  highlightCount: number;
  lastHighlightDate: string;
  originalData: {
    title: string;
    author: string;
  };
  isEdited: boolean;
}

interface KindleHighlight {
  id: number;
  title: string;
  author: string;
  highlight: string;
  location: string;
  timestamp: string;
}

const KindleTitles = () => {
  const [titles, setTitles] = useState<KindleTitle[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof KindleTitle>("title");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [editForm, setEditForm] = useState<Partial<KindleTitle>>({});

  useEffect(() => {
    loadTitles();
  }, []);

  const loadTitles = async () => {
    try {
      const db = await openDB();
      const transaction = db.transaction("highlights", "readonly");
      const store = transaction.objectStore("highlights");
      const highlights = await new Promise<KindleHighlight[]>(
        (resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
      );

      // Group highlights by title and create title entries
      const titleMap = new Map<string, KindleTitle>();

      highlights.forEach((highlight) => {
        if (!titleMap.has(highlight.title)) {
          titleMap.set(highlight.title, {
            id: highlight.id,
            title: highlight.title,
            author: highlight.author,
            highlightCount: 1,
            lastHighlightDate: highlight.timestamp,
            originalData: {
              title: highlight.title,
              author: highlight.author,
            },
            isEdited: false,
          });
        } else {
          const titleEntry = titleMap.get(highlight.title)!;
          titleEntry.highlightCount++;
          if (
            new Date(highlight.timestamp) >
            new Date(titleEntry.lastHighlightDate)
          ) {
            titleEntry.lastHighlightDate = highlight.timestamp;
          }
        }
      });

      setTitles(Array.from(titleMap.values()));
    } catch (error) {
      setError("Failed to load titles");
    }
  };

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("NotebookDB", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  };

  const handleEdit = (title: KindleTitle) => {
    setEditingId(title.id!);
    setEditForm({
      title: title.title,
      author: title.author,
    });
  };

  const handleSave = async (title: KindleTitle) => {
    try {
      const db = await openDB();
      const transaction = db.transaction("highlights", "readwrite");
      const store = transaction.objectStore("highlights");

      // Update all highlights for this title
      const highlights = await new Promise<KindleHighlight[]>(
        (resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
      );
      const updatedHighlights = highlights.map((highlight) => {
        if (highlight.title === title.originalData.title) {
          return {
            ...highlight,
            title: editForm.title,
            author: editForm.author,
            originalData: title.originalData,
            isEdited: true,
          };
        }
        return highlight;
      });

      // Clear and rewrite all highlights
      await store.clear();
      for (const highlight of updatedHighlights) {
        await store.add(highlight);
      }

      setEditingId(null);
      loadTitles();
    } catch (error) {
      setError("Failed to save changes");
    }
  };

  const handleSort = (field: keyof KindleTitle) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedTitles = [...titles].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortDirection === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return sortDirection === "asc"
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number);
  });

  const SortIcon = ({ field }: { field: keyof KindleTitle }) => (
    <span className="inline-block ml-1">
      {sortField === field ? (
        sortDirection === "asc" ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )
      ) : (
        <ChevronDown className="w-4 h-4 text-gray-300" />
      )}
    </span>
  );

  return (
    <div className="container mx-auto p-4">
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-6 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer"
                onClick={() => handleSort("title")}
              >
                Title <SortIcon field="title" />
              </th>
              <th
                className="px-6 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer"
                onClick={() => handleSort("author")}
              >
                Author <SortIcon field="author" />
              </th>
              <th
                className="px-6 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer"
                onClick={() => handleSort("highlightCount")}
              >
                Highlights <SortIcon field="highlightCount" />
              </th>
              <th
                className="px-6 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer"
                onClick={() => handleSort("lastHighlightDate")}
              >
                Last Updated <SortIcon field="lastHighlightDate" />
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedTitles.map((title) => (
              <tr
                key={title.id}
                className={`${
                  title.isEdited ? "bg-blue-50" : ""
                } hover:bg-gray-50`}
              >
                <td className="px-6 py-4">
                  {editingId === title.id ? (
                    <input
                      type="text"
                      className="w-full p-1 border rounded"
                      value={editForm.title}
                      onChange={(e) =>
                        setEditForm({ ...editForm, title: e.target.value })
                      }
                    />
                  ) : (
                    <div className="flex items-center">
                      <span>{title.title}</span>
                      {title.isEdited && (
                        <span className="ml-2 text-xs text-blue-600">
                          (edited)
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  {editingId === title.id ? (
                    <input
                      type="text"
                      className="w-full p-1 border rounded"
                      value={editForm.author}
                      onChange={(e) =>
                        setEditForm({ ...editForm, author: e.target.value })
                      }
                    />
                  ) : (
                    <span>{title.author}</span>
                  )}
                </td>
                <td className="px-6 py-4">{title.highlightCount}</td>
                <td className="px-6 py-4">
                  {new Date(title.lastHighlightDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  {editingId === title.id ? (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleSave(title)}
                        className="text-green-600 hover:text-green-900"
                      >
                        <Save className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEdit(title)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default KindleTitles;
