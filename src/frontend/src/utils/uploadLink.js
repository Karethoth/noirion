import { ApolloLink, Observable } from '@apollo/client';

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

      // Extract files from variables
      const { files } = extractFiles({ variables }, ['variables']);

      let body;
      let headers = {
        ...context.headers,
        'apollo-require-preflight': 'true', // Required for CSRF protection
      };

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

      fetch(uri, {
        method: 'POST',
        headers,
        body,
      })
        .then((response) => {
          return response.json();
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
          observer.error(error);
        });
    });
  });
};
