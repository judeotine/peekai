import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Query } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const historyDB = SQLDatabase.named("user");

export interface QueryHistoryItem {
  id: number;
  question: string;
  answer: string;
  pageTitle?: string;
  pageUrl?: string;
  pageDomain?: string;
  contextText?: string;
  modelUsed: string;
  responseTimeMs: number;
  createdAt: string;
}

export interface QueryHistoryResponse {
  queries: QueryHistoryItem[];
  total: number;
  hasMore: boolean;
}

export interface ExportRequest {
  format: "pdf" | "markdown" | "json";
  queryIds?: number[];
}

export interface ExportResponse {
  downloadUrl: string;
  filename: string;
}

// Gets query history for the current user
export const getQueryHistory = api<{
  limit?: Query<number>;
  offset?: Query<number>;
}, QueryHistoryResponse>(
  { expose: true, method: "GET", path: "/history", auth: true },
  async (req) => {
    const auth = getAuthData()!;
    const limit = req.limit || 10;
    const offset = req.offset || 0;

    const queries = await historyDB.queryAll<QueryHistoryItem>`
      SELECT 
        id,
        question,
        answer,
        page_title as "pageTitle",
        page_url as "pageUrl",
        page_domain as "pageDomain",
        context_text as "contextText",
        model_used as "modelUsed",
        response_time_ms as "responseTimeMs",
        created_at as "createdAt"
      FROM query_history 
      WHERE user_id = ${auth.userID}
      ORDER BY created_at DESC
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `;

    const hasMore = queries.length > limit;
    if (hasMore) {
      queries.pop(); // Remove the extra item
    }

    const totalResult = await historyDB.queryRow<{ count: number }>`
      SELECT COUNT(*) as count
      FROM query_history 
      WHERE user_id = ${auth.userID}
    `;

    return {
      queries,
      total: totalResult?.count || 0,
      hasMore,
    };
  }
);

// Gets recent queries (last 10)
export const getRecentQueries = api<void, { queries: QueryHistoryItem[] }>(
  { expose: true, method: "GET", path: "/history/recent", auth: true },
  async () => {
    const auth = getAuthData()!;

    const queries = await historyDB.queryAll<QueryHistoryItem>`
      SELECT 
        id,
        question,
        answer,
        page_title as "pageTitle",
        page_url as "pageUrl",
        page_domain as "pageDomain",
        context_text as "contextText",
        model_used as "modelUsed",
        response_time_ms as "responseTimeMs",
        created_at as "createdAt"
      FROM query_history 
      WHERE user_id = ${auth.userID}
      ORDER BY created_at DESC
      LIMIT 10
    `;

    return { queries };
  }
);

// Deletes a query from history
export const deleteQuery = api<{ id: number }, void>(
  { expose: true, method: "DELETE", path: "/history/:id", auth: true },
  async (req) => {
    const auth = getAuthData()!;

    const result = await historyDB.queryRow`
      SELECT id FROM query_history 
      WHERE id = ${req.id} AND user_id = ${auth.userID}
    `;

    if (!result) {
      throw APIError.notFound("query not found");
    }

    await historyDB.exec`
      DELETE FROM query_history 
      WHERE id = ${req.id} AND user_id = ${auth.userID}
    `;
  }
);

// Clears all query history for the user
export const clearHistory = api<void, void>(
  { expose: true, method: "DELETE", path: "/history", auth: true },
  async () => {
    const auth = getAuthData()!;

    await historyDB.exec`
      DELETE FROM query_history 
      WHERE user_id = ${auth.userID}
    `;
  }
);

// Exports query history in various formats
export const exportHistory = api<ExportRequest, ExportResponse>(
  { expose: true, method: "POST", path: "/history/export", auth: true },
  async (req) => {
    const auth = getAuthData()!;

    let queries: QueryHistoryItem[];

    if (req.queryIds && req.queryIds.length > 0) {
      // Export specific queries
      const placeholders = req.queryIds.map(() => '?').join(',');
      queries = await historyDB.rawQueryAll<QueryHistoryItem>(
        `SELECT 
          id, question, answer, page_title as "pageTitle", page_url as "pageUrl",
          page_domain as "pageDomain", context_text as "contextText",
          model_used as "modelUsed", response_time_ms as "responseTimeMs",
          created_at as "createdAt"
         FROM query_history 
         WHERE user_id = $1 AND id = ANY($2)
         ORDER BY created_at DESC`,
        auth.userID,
        req.queryIds
      );
    } else {
      // Export all queries
      queries = await historyDB.queryAll<QueryHistoryItem>`
        SELECT 
          id, question, answer, page_title as "pageTitle", page_url as "pageUrl",
          page_domain as "pageDomain", context_text as "contextText",
          model_used as "modelUsed", response_time_ms as "responseTimeMs",
          created_at as "createdAt"
        FROM query_history 
        WHERE user_id = ${auth.userID}
        ORDER BY created_at DESC
      `;
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `peekai-history-${timestamp}.${req.format}`;

    // Generate export content based on format
    let content: string;
    let contentType: string;

    switch (req.format) {
      case "markdown":
        content = generateMarkdownExport(queries);
        contentType = "text/markdown";
        break;
      case "json":
        content = JSON.stringify(queries, null, 2);
        contentType = "application/json";
        break;
      case "pdf":
        // For PDF, we'll return markdown content and let the frontend handle PDF generation
        content = generateMarkdownExport(queries);
        contentType = "text/markdown";
        break;
      default:
        throw APIError.invalidArgument("unsupported export format");
    }

    // In a real implementation, you'd upload this to object storage and return a download URL
    // For now, we'll return the content directly encoded as a data URL
    const dataUrl = `data:${contentType};base64,${Buffer.from(content).toString('base64')}`;

    return {
      downloadUrl: dataUrl,
      filename,
    };
  }
);

function generateMarkdownExport(queries: QueryHistoryItem[]): string {
  const header = `# PeekAI Query History Export\n\nExported on: ${new Date().toISOString()}\nTotal queries: ${queries.length}\n\n---\n\n`;
  
  const content = queries.map((query, index) => {
    return `## Query ${index + 1}\n\n` +
           `**Date:** ${new Date(query.createdAt).toLocaleString()}\n\n` +
           `**Question:** ${query.question}\n\n` +
           `**Answer:**\n${query.answer}\n\n` +
           (query.pageTitle ? `**Page:** ${query.pageTitle}\n\n` : '') +
           (query.pageUrl ? `**URL:** ${query.pageUrl}\n\n` : '') +
           `**Model:** ${query.modelUsed}\n\n` +
           `**Response Time:** ${query.responseTimeMs}ms\n\n` +
           `---\n\n`;
  }).join('');

  return header + content;
}
