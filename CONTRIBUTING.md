# Contributing to Noirion

Thank you for considering contributing to Noirion! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

By participating in this project, you agree to:
- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- Node.js ≥ 20
- Docker and Docker Compose
- Git
- A code editor (VS Code recommended)

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/noirion.git
   cd noirion
   ```

3. **Add the upstream remote**
   ```bash
   git remote add upstream https://github.com/Karethoth/noirion.git
   ```

4. **Copy environment configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your local settings
   ```

5. **Start the development environment**
   ```bash
   docker-compose up -d
   ```

6. **Run database migrations**
   ```bash
   docker exec -it noirion_backend node scripts/run-migrations.js
   ```

## Development Workflow

### Branch Strategy

We use a **main/develop** branching model:

- **`main`** - Stable, production-ready code. Tagged releases are made from this branch.
- **`develop`** - Integration branch for ongoing development. All feature branches merge here first.
- **`feature/*`** - New features branch from `develop`
- **`fix/*`** - Bug fixes branch from `develop` (or from `main` for hotfixes)

```
main (stable/production)
  ↑
  └─ develop (integration)
       ↑
       ├─ feature/your-feature
       └─ fix/your-bugfix
```

### Working on a Feature or Bug Fix

1. **Sync with upstream develop**
   ```bash
   git checkout develop
   git pull upstream develop
   ```

2. **Create a new branch from develop**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

3. **Make your changes**
   - Write clean, maintainable code
   - Follow the coding standards (see below)
   - Add tests for new functionality

4. **Test your changes**
   ```bash
   # Backend tests
   cd src/backend
   npm test
   
   # Frontend tests
   cd src/frontend
   npm test
   ```

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   # See commit guidelines below
   ```

6. **Keep your branch up to date**
   ```bash
   git checkout develop
   git pull upstream develop
   git checkout feature/your-feature-name
   git rebase develop
   ```

7. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

8. **Open a Pull Request** targeting the **`develop`** branch on GitHub

### Hotfix Workflow (Critical Bugs in Production)

For urgent fixes to production:

1. **Branch from main**
   ```bash
   git checkout main
   git pull upstream main
   git checkout -b hotfix/critical-bug-name
   ```

2. **Make and test the fix**

3. **Create PR to main** and after merge, also merge to develop:
   ```bash
   git checkout develop
   git merge main
   ```

## Coding Standards

### JavaScript/Node.js

- Use ES6+ features (import/export, arrow functions, destructuring, etc.)
- Use 2 spaces for indentation
- Use meaningful variable and function names
- Add JSDoc comments for functions
- Keep functions small and focused
- Avoid deeply nested code

**Example:**
```javascript
/**
 * Extract EXIF data from an image buffer
 * @param {Buffer} buffer - Image file buffer
 * @returns {Promise<Object>} Extracted EXIF data
 */
async function extractExifData(buffer) {
  // Implementation
}
```

### React/JSX

- Use functional components with hooks
- Use meaningful component names (PascalCase)
- Keep components small and focused
- Use PropTypes or TypeScript for type checking
- Extract reusable logic into custom hooks

### GraphQL

- Use descriptive field names
- Add descriptions to types and fields
- Follow the existing schema patterns
- Test resolvers thoroughly

### Python

- Follow PEP 8 style guide
- Use 4 spaces for indentation
- Add docstrings to functions and classes
- Use type hints where applicable

### General Guidelines

- **DRY (Don't Repeat Yourself)**: Extract common logic into reusable functions
- **KISS (Keep It Simple)**: Prefer simple solutions over complex ones
- **YAGNI (You Aren't Gonna Need It)**: Don't add functionality until needed
- **Write self-documenting code**: Use clear names and structure
- **Comment the "why", not the "what"**: Explain reasoning, not obvious actions

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring without changing functionality
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, build config, etc.)

### Examples

```bash
feat(backend): add EXIF metadata extraction
fix(frontend): resolve image upload validation error
docs: update installation instructions
refactor(graphql): simplify resolver logic
test(backend): add tests for annotation service
```

## Pull Request Process

1. **Update documentation** if you've changed APIs or added features

2. **Add or update tests** to cover your changes

3. **Ensure all tests pass**
   ```bash
   npm test
   ```

4. **Update the changelog** if applicable

5. **Fill out the PR template** with all relevant information

6. **Request review** from maintainers

7. **Address review feedback** promptly

8. **Squash commits** if requested before merging

### PR Requirements

- [ ] Tests pass
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] Commit messages follow convention
- [ ] No merge conflicts
- [ ] PR description is clear and complete

## Testing

### Backend Tests

```bash
cd src/backend
npm test
```

### Frontend Tests

```bash
cd src/frontend
npm test
```

### Integration Tests

```bash
docker-compose up -d
# Run manual integration tests
```

### Test Coverage

- Aim for at least 80% code coverage
- Focus on critical paths and edge cases
- Test both success and error scenarios

## Release Process

Releases are created by merging `develop` into `main` and tagging the release.

### Creating a Release (Maintainers Only)

1. **Ensure develop is stable**
   ```bash
   # All tests pass
   # All features are complete
   # Documentation is updated
   ```

2. **Update version numbers** (if applicable)
   - Update `package.json` versions
   - Update any version references in documentation

3. **Merge develop to main**
   ```bash
   git checkout main
   git pull origin main
   git merge --no-ff develop -m "Release v1.x.x"
   ```

4. **Tag the release**
   ```bash
   git tag -a v1.x.x -m "Release version 1.x.x - Brief description"
   git push origin main --tags
   ```

5. **Sync develop with main**
   ```bash
   git checkout develop
   git merge main
   git push origin develop
   ```

6. **Create GitHub Release**
   - Go to GitHub Releases
   - Create release from tag
   - Add changelog and release notes

### Version Numbering

We follow [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

## Documentation

### Code Documentation

- Add JSDoc comments to all exported functions
- Document complex algorithms and business logic
- Explain non-obvious decisions in comments

### User Documentation

- Update README.md for new features
- Add examples and usage instructions
- Keep documentation up to date with code changes

### API Documentation

- Document GraphQL schema changes
- Add query/mutation examples
- Update API version notes

## Questions?

If you have questions:

1. Check existing [documentation](doc/)
2. Search [existing issues](https://github.com/Karethoth/noirion/issues)
3. Open a [new issue](https://github.com/Karethoth/noirion/issues/new/choose) with the "Question" template

## Thank You!

Your contributions help make Noirion better for everyone. We appreciate your time and effort! 🎉
