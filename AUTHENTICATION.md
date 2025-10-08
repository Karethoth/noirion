# Authentication & Authorization Implementation

## Overview
Implemented JWT-based authentication and role-based authorization for the Noirion backend.

## Authentication Flow

### 1. Login Process
- User submits username/password via GraphQL mutation
- Backend validates credentials and generates JWT token
- Token contains: userId, username, email, role
- Token expires in 7 days
- Frontend stores token in localStorage

### 2. Request Authentication
- Frontend sends token in Authorization header: `Bearer <token>`
- Backend extracts and verifies token on every request
- User info added to GraphQL context

### 3. Token Storage
- **Token**: `localStorage.getItem('token')` - JWT for API calls
- **User**: `localStorage.getItem('user')` - User profile data for UI

## Role-Based Permissions

### Admin
- **Permissions**: read, write, admin
- **Can**: View, create, edit, delete all resources
- **Username**: `admin`

### Investigator
- **Permissions**: read, write
- **Can**: View, create, edit, delete images and annotations
- **Cannot**: Perform admin operations
- **Username**: `investigator`

### Analyst
- **Permissions**: read only
- **Can**: View images and annotations
- **Cannot**: Create, edit, or delete anything
- **Username**: `analyst`

## Protected Resources

### Queries (Read Access)
All queries require authentication:
- `images` - Requires: login (any role)
- `image` - Requires: login (any role)
- `imagesInArea` - Requires: login (any role)
- `annotations` - Requires: login (any role)
- `annotation` - Requires: login (any role)

### Mutations (Write Access)
All mutations require 'write' permission (admin or investigator only):
- `uploadImage` - Requires: write permission
- `uploadImages` - Requires: write permission
- `deleteImage` - Requires: write permission
- `createAnnotation` - Requires: write permission
- `updateAnnotation` - Requires: write permission
- `deleteAnnotation` - Requires: write permission
- `addAnnotationRegion` - Requires: write permission
- `updateAnnotationRegion` - Requires: write permission
- `deleteAnnotationRegion` - Requires: write permission

### Public Endpoints
- `login` mutation - No authentication required
- `/health` endpoint - No authentication required
- `/uploads` static files - No authentication required (TODO: Consider securing)

## Error Messages

### Authentication Errors
- **No token**: "Authentication required. Please log in."
- **Invalid/expired token**: Token verification fails silently, user appears as null

### Authorization Errors
- **Insufficient permissions**: "Permission denied. This operation requires 'write' permission. Your role 'analyst' does not have this access."

## Security Considerations

### Current Implementation
✅ JWT tokens with expiration
✅ Passwords hashed with bcrypt
✅ Token verified on every request
✅ Role-based access control enforced
✅ Authorization header properly extracted

### Production Recommendations
⚠️ **JWT_SECRET**: Currently uses default secret. Set `JWT_SECRET` environment variable in production.
⚠️ **Token Refresh**: No refresh token mechanism. Users must re-login after 7 days.
⚠️ **HTTPS**: Ensure all traffic uses HTTPS in production to protect tokens.
⚠️ **Static Files**: Consider adding authentication for `/uploads` endpoint.
⚠️ **Rate Limiting**: No rate limiting on login attempts.
⚠️ **CSRF**: Currently disabled for file uploads. Tokens provide some protection.

## Testing

### Login as Different Roles
```bash
# Admin (full access)
username: admin
password: password

# Investigator (read + write)
username: investigator  
password: password

# Analyst (read only)
username: analyst
password: password
```

### Testing Authorization
1. Login as `analyst`
2. Try to upload an image → Should fail with permission error
3. Try to delete an image → Should fail with permission error
4. View images → Should succeed
5. Try to create annotation → Should fail with permission error

## Files Modified

### Backend
- `src/utils/auth.js` - NEW: JWT utilities and permission checks
- `src/services/users.js` - Generate JWT on login
- `src/graphql/schemas/schema.js` - Add AuthPayload type, update login mutation
- `src/graphql/resolvers/user.resolver.js` - Return token with user
- `src/graphql/resolvers/image.resolver.js` - Add auth/permission checks
- `src/graphql/resolvers/annotation.resolver.js` - Add auth/permission checks
- `index.js` - Extract user from token, add to context
- `package.json` - Add jsonwebtoken dependency

### Frontend
- `src/utils/uploadLink.js` - Send Authorization header
- `src/components/Login.jsx` - Store token, update mutation
- Demo accounts updated with new usernames

### Database
- `src/db/migrations/002_create_default_users.js` - Updated user accounts

## Environment Variables

```env
# Optional - defaults to 'noirion-secret-key-change-in-production'
JWT_SECRET=your-secret-key-here
```

## Migration Notes

To apply the new user accounts:
1. The database migration needs to be re-run to create new users with updated usernames
2. Old users (with `_user` suffix) will need to be manually removed or the database reset
3. Any existing localStorage tokens will be invalid and users will need to re-login
