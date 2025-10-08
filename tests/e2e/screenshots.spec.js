import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || 'screenshots';
const SAMPLE_DATA_DIR = path.join(__dirname, '../../doc/sample-data');

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Helper function to login with admin credentials
async function loginAsAdmin(page) {
  try {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if already logged in by looking for upload button
    const uploadButton = page.getByRole('button', { name: /upload|add/i });
    if (await uploadButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('Already logged in, skipping login');
      return true;
    }

    // Find and fill login form
    const usernameInput = page.locator('input#username');
    const passwordInput = page.locator('input#password');
    const loginButton = page.locator('button[type="submit"]');

    if (await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await usernameInput.fill('admin');
      await passwordInput.fill('password');
      await loginButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000); // Wait for login to complete
      console.log('Logged in as admin');
      return true;
    }

    return false;
  } catch (error) {
    console.log('Login error:', error.message);
    return false;
  }
}

// Helper function to upload sample images
async function uploadSampleImages(page) {
  try {
    // Login first
    const loggedIn = await loginAsAdmin(page);
    if (!loggedIn) {
      console.log('Could not log in, skipping upload');
      return;
    }

    // Get sample image files
    const sampleFiles = fs.readdirSync(SAMPLE_DATA_DIR)
      .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
      .slice(0, 5) // Upload first 5 images
      .map(f => path.join(SAMPLE_DATA_DIR, f));

    if (sampleFiles.length === 0) {
      console.log('No sample images found in', SAMPLE_DATA_DIR);
      return;
    }

    console.log(`Uploading ${sampleFiles.length} sample images...`);

    // Find the file input in the dropzone
    // The ImageUpload component uses react-dropzone
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Set the files to the input
      await fileInput.setInputFiles(sampleFiles);

      // Wait for upload to complete
      await page.waitForTimeout(3000);

      // Wait for success or check for upload button to be enabled again
      await page.waitForTimeout(2000);

      console.log(`Successfully uploaded ${sampleFiles.length} sample images`);
    } else {
      console.log('File input not found');
    }
  } catch (error) {
    console.log('Upload error:', error.message);
  }
}

test.describe('Application Screenshots', () => {
  // Upload sample data once before all tests
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await uploadSampleImages(page);
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    // Set viewport to a standard size
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test('01-homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-homepage.png'),
      fullPage: true
    });
  });

  test('02-login-page', async ({ page }) => {
    await page.goto('/');
    // Look for login button or link
    const loginButton = page.getByRole('button', { name: /login|sign in/i }).first();
    if (await loginButton.isVisible()) {
      await loginButton.click();
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '02-login-page.png'),
        fullPage: true
      });
    }
  });

  test('03-image-gallery', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait a bit for images to load from the upload
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-image-gallery.png'),
      fullPage: true
    });
  });

  test('04-image-detail-view', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click first image in gallery if available
    const images = page.locator('img[src*="/uploads/"]');
    const imageCount = await images.count();

    if (imageCount > 0) {
      await images.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500); // Wait for detail view to render
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '04-image-detail-view.png'),
        fullPage: true
      });
    } else {
      console.log('No images found for detail view screenshot');
    }
  });

  test('05-map-view', async ({ page }) => {
    await page.goto('/');

    // Look for map view
    const mapLink = page.getByRole('link', { name: /map/i }).first();
    if (await mapLink.isVisible()) {
      await mapLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000); // Wait for map to render
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '05-map-view.png'),
        fullPage: true
      });
    }
  });

  test('06-annotation-interface', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click first image to open detail view
    const images = page.locator('img[src*="/uploads/"]');
    const imageCount = await images.count();

    if (imageCount > 0) {
      await images.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Look for annotation button/tool
      const annotateButton = page.getByRole('button', { name: /annotate|add|annotation/i }).first();
      if (await annotateButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await annotateButton.click();
        await page.waitForTimeout(500);
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '06-annotation-interface.png'),
        fullPage: true
      });
    } else {
      console.log('No images found for annotation screenshot');
    }
  });

  test('07-mobile-view', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '07-mobile-view.png'),
      fullPage: true
    });
  });
});
