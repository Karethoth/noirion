import { ApolloLink, Observable } from '@apollo/client';

const DEBUG_GRAPHQL = ['1', 'true', 'yes', 'on'].includes(
  String(import.meta.env.VITE_DEBUG_GRAPHQL || '').toLowerCase()
);
const parsedTimeoutMs = parseInt(String(import.meta.env.VITE_GRAPHQL_TIMEOUT_MS || ''), 10);
const GRAPHQL_TIMEOUT_MS = Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0 ? parsedTimeoutMs : 30000;

function newRequestId() {
  return `gql_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Helper function to extract files from variables
function extractFiles(obj) {
  const files = new Map();

  // Manual traversal to find files
  function traverse(obj, currentPath = []) {
    if (obj instanceof File || obj instanceof Blob) {
      const pathStr = currentPath.join('.');
      if (!files.has(obj)) {
        files.set(obj, [pathStr]);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        traverse(item, [...currentPath, index.toString()]);
      });
    } else if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        traverse(value, [...currentPath, key]);
      });
    }
  }

  traverse(obj);
  return { clone: obj, files };
}

export const createUploadLink = (options) => {
  const { uri } = options;

  return new ApolloLink((operation) => {
    return new Observable((observer) => {
      const context = operation.getContext();
      const { operationName, variables, query } = operation;

      const requestId = newRequestId();
      const start = Date.now();

      // Extract files from variables
      const { files } = extractFiles({ variables }, ['variables']);

      let body;
      let headers = {
        ...context.headers,
        'apollo-require-preflight': 'true', // Required for CSRF protection
      };

      // Add Authorization header if token exists in localStorage
      const token = localStorage.getItem('token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      if (files.size === 0) {
        // Standard GraphQL request
        body = JSON.stringify({
          operationName,
          query: typeof query === 'string' ? query : query.loc?.source.body,
          variables,
        });
        headers['Content-Type'] = 'application/json';
      } else {
        // Multipart form data for file uploads
        const formData = new FormData();

        // Clone variables and replace files with null
        const clonedVariables = JSON.parse(JSON.stringify(variables, (key, value) => {
          if (value instanceof File || value instanceof Blob) {
            return null;
          }
          return value;
        }));

        const operations = {
          operationName,
          query: typeof query === 'string' ? query : query.loc?.source.body,
          variables: clonedVariables,
        };

        formData.append('operations', JSON.stringify(operations));

        // Build the map
        const map = {};
        let i = 0;
        files.forEach((paths) => {
          map[i] = paths;
          i++;
        });
        formData.append('map', JSON.stringify(map));

        // Append files
        i = 0;
        files.forEach((paths, file) => {
          formData.append(i.toString(), file, file.name);
          i++;
        });

        body = formData;
        // Don't set Content-Type for FormData - browser will set it with boundary
        delete headers['Content-Type'];
      }

      if (DEBUG_GRAPHQL) {
        console.log(
          `[${requestId}] -> ${operationName || 'anonymous'} uri=${uri} files=${files.size} timeoutMs=${GRAPHQL_TIMEOUT_MS}`
        );
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GRAPHQL_TIMEOUT_MS);

      fetch(uri, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
        .then((response) => {
          return response.text().then((text) => {
            const ms = Date.now() - start;

            if (DEBUG_GRAPHQL) {
              console.log(`[${requestId}] <- ${operationName || 'anonymous'} status=${response.status} (${ms}ms)`);
            }

            const parsed = safeJsonParse(text);

            if (!response.ok) {
              const snippet = (text || '').slice(0, 500);
              throw new Error(`HTTP ${response.status} from GraphQL endpoint. Body: ${snippet}`);
            }

            if (!parsed) {
              const snippet = (text || '').slice(0, 500);
              throw new Error(`Non-JSON response from GraphQL endpoint. Body: ${snippet}`);
            }

            return parsed;
          });
        })
        .then((result) => {
          if (result.errors) {
            observer.error(new Error(result.errors[0].message));
          } else {
            observer.next(result);
            observer.complete();
          }
        })
        .catch((error) => {
          const ms = Date.now() - start;
          if (DEBUG_GRAPHQL) {
            console.warn(`[${requestId}] xx ${operationName || 'anonymous'} failed (${ms}ms):`, error);
          }

          if (error?.name === 'AbortError') {
            observer.error(new Error(`GraphQL request timed out after ${GRAPHQL_TIMEOUT_MS}ms (AbortError)`));
            return;
          }

          observer.error(error);
        })
        .finally(() => {
          clearTimeout(timeout);
        });
    });
  });
};
