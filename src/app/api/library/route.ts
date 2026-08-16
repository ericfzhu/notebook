import { errorResponse, jsonResponse } from "@/lib/http";
import { getLibraryOverview } from "@/lib/notebook-db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const overview = await getLibraryOverview();
    return jsonResponse(overview);
  } catch (error) {
    console.error("Failed to load notebook library", error);
    return errorResponse("Unable to load the notebook library.", 500);
  }
}
