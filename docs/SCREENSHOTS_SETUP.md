# Automated Screenshot Generation Setup

## What Was Added

### 1. GitHub Actions Workflow (`.github/workflows/screenshots.yml`)
- Automatically runs on push to `main` or `develop`
- Can be manually triggered via GitHub Actions UI
- Spins up full stack (PostgreSQL, backend, frontend)
- Runs Playwright tests to capture screenshots
- Commits screenshots back to repository with `[skip ci]` tag

### 2. Playwright Configuration (`playwright.config.js`)
- Configured for screenshot generation
- Desktop Chrome viewport (1920x1080)
- Integration with local and CI environments

### 3. Screenshot Test Suite (`tests/e2e/screenshots.spec.js`)
- 7 automated screenshot scenarios:
  - Homepage
  - Login page
  - Image gallery
  - Image detail view
  - Map view
  - Annotation interface
  - Mobile view (375x812)
- Smart navigation with fallbacks
- Waits for page load and rendering

### 4. Package Configuration (`package.json`)
- Added Playwright and wait-on dependencies
- Scripts for running E2E tests and screenshots locally

### 5. Documentation (`screenshots/README.md`)
- Explains the screenshot system
- Instructions for local generation
- Details on each screenshot

## How to Use

### Automatic (CI/CD)
Screenshots are automatically generated and committed on every push to `main` or `develop`.

### Manual Trigger
1. Go to GitHub Actions
2. Select "Generate Screenshots" workflow
3. Click "Run workflow"
4. Choose branch and run

### Local Development
```bash
# Install root dependencies
npm install

# Start backend (Terminal 1)
cd src/backend && npm install && npm run dev

# Start frontend (Terminal 2)
cd src/frontend && npm install && npm run dev

# Generate screenshots (Terminal 3)
npm run test:screenshots
```

## Benefits

✅ **Always up-to-date** - Screenshots match current UI
✅ **Visual changelog** - See UI changes in git history
✅ **Documentation** - Auto-generated visual docs
✅ **PR reviews** - Reviewers can see UI changes
✅ **Multiple viewports** - Desktop and mobile views
✅ **CI/CD integrated** - No manual maintenance needed

## Next Steps

1. Commit these files
2. Push to GitHub
3. Workflow will run automatically
4. Screenshots will be generated and committed
5. View them in the `screenshots/` directory

## Customization

### Add More Screenshots
Edit `tests/e2e/screenshots.spec.js` and add new test cases:

```javascript
test('08-my-new-view', async ({ page }) => {
  await page.goto('/my-route');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ 
    path: path.join(SCREENSHOT_DIR, '08-my-new-view.png'),
    fullPage: true 
  });
});
```

### Change Screenshot Quality
In the screenshot call, add options:
```javascript
await page.screenshot({ 
  path: 'screenshot.png',
  fullPage: true,
  quality: 90, // For JPEG (0-100)
  type: 'png' // or 'jpeg'
});
```

### Different Viewports
```javascript
await page.setViewportSize({ width: 1280, height: 720 });
```

## Troubleshooting

**Screenshots are blurry/incomplete:**
- Increase `waitForTimeout` values
- Add more specific `waitForSelector` calls

**Tests failing:**
- Check if routes/elements exist in your app
- Update selectors to match your actual UI
- Make tests more resilient with try/catch

**Workflow not running:**
- Check GitHub Actions are enabled
- Verify workflow file syntax with GitHub Actions validator
- Check branch protection rules
